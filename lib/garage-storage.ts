import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

type HttpMetadata = {
  contentType?: string;
  contentDisposition?: string;
};

type PutOptions = { httpMetadata?: HttpMetadata };
type UploadedPart = { partNumber: number; etag: string };

let client: S3Client | undefined;
let bucket: GarageBucket | undefined;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Garage storage.`);
  return value;
}

function s3Client() {
  client ??= new S3Client({
    endpoint: required("S3_ENDPOINT"),
    region: process.env.S3_REGION?.trim() || "garage",
    forcePathStyle: true,
    credentials: {
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

async function bytes(body: unknown): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      chunks.push(chunk);
      size += chunk.byteLength;
    }
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }
  throw new Error("Unsupported Garage upload body.");
}

function webStream(body: unknown): ReadableStream<Uint8Array> {
  if (
    body &&
    typeof body === "object" &&
    "transformToWebStream" in body &&
    typeof body.transformToWebStream === "function"
  ) {
    return body.transformToWebStream();
  }
  return Readable.toWeb(body as Readable) as ReadableStream<Uint8Array>;
}

class GarageMultipartUpload {
  constructor(
    private readonly key: string,
    readonly uploadId: string,
  ) {}

  async uploadPart(partNumber: number, body: unknown) {
    const content = await bytes(body);
    const response = await s3Client().send(
      new UploadPartCommand({
        Bucket: required("S3_BUCKET"),
        Key: this.key,
        UploadId: this.uploadId,
        PartNumber: partNumber,
        Body: content,
        ContentLength: content.byteLength,
      }),
    );
    if (!response.ETag) throw new Error("Garage did not return a part ETag.");
    return { partNumber, etag: response.ETag };
  }

  async complete(parts: UploadedPart[]) {
    await s3Client().send(
      new CompleteMultipartUploadCommand({
        Bucket: required("S3_BUCKET"),
        Key: this.key,
        UploadId: this.uploadId,
        MultipartUpload: {
          Parts: parts.map((part) => ({
            PartNumber: part.partNumber,
            ETag: part.etag,
          })),
        },
      }),
    );
    const head = await s3Client().send(
      new HeadObjectCommand({ Bucket: required("S3_BUCKET"), Key: this.key }),
    );
    return { size: Number(head.ContentLength || 0), httpEtag: head.ETag };
  }

  async abort() {
    await s3Client().send(
      new AbortMultipartUploadCommand({
        Bucket: required("S3_BUCKET"),
        Key: this.key,
        UploadId: this.uploadId,
      }),
    );
  }
}

class GarageBucket {
  async createMultipartUpload(key: string, options: PutOptions = {}) {
    const response = await s3Client().send(
      new CreateMultipartUploadCommand({
        Bucket: required("S3_BUCKET"),
        Key: key,
        ContentType: options.httpMetadata?.contentType,
        ContentDisposition: options.httpMetadata?.contentDisposition,
      }),
    );
    if (!response.UploadId) throw new Error("Garage did not create an upload ID.");
    return new GarageMultipartUpload(key, response.UploadId);
  }

  resumeMultipartUpload(key: string, uploadId: string) {
    return new GarageMultipartUpload(key, uploadId);
  }

  async put(key: string, body: unknown, options: PutOptions = {}) {
    const content = await bytes(body);
    const response = await s3Client().send(
      new PutObjectCommand({
        Bucket: required("S3_BUCKET"),
        Key: key,
        Body: content,
        ContentLength: content.byteLength,
        ContentType: options.httpMetadata?.contentType,
        ContentDisposition: options.httpMetadata?.contentDisposition,
      }),
    );
    return { size: content.byteLength, httpEtag: response.ETag };
  }

  async get(key: string) {
    try {
      const response = await s3Client().send(
        new GetObjectCommand({ Bucket: required("S3_BUCKET"), Key: key }),
      );
      if (!response.Body) return null;
      return {
        body: webStream(response.Body),
        size: Number(response.ContentLength || 0),
        httpEtag: response.ETag,
      };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "$metadata" in error &&
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  async delete(key: string) {
    await s3Client().send(
      new DeleteObjectCommand({ Bucket: required("S3_BUCKET"), Key: key }),
    );
  }
}

export function garageBucket() {
  bucket ??= new GarageBucket();
  return bucket;
}
