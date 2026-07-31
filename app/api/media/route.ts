import { runtimeEnv as env } from "@/lib/runtime-env";
import { getDb } from "@/db";
import { mediaAssets } from "@/db/schema";
import { requireApiUser } from "@/lib/auth";
import { inlineContentDisposition } from "@/lib/content-disposition";
import { ensureStudioUser } from "@/lib/data";
import { AppError, errorResponse } from "@/lib/errors";
import { enforceUploadInitializationRateLimit } from "@/lib/route-protection";
import { assertSameOrigin } from "@/lib/session-security";

type RuntimeEnv = {
  MEDIA?: R2Bucket;
};

type MediaKind = "image" | "video";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/avi",
]);
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const MULTIPART_CHUNK_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_PARTS = MAX_MEDIA_BYTES / MULTIPART_CHUNK_BYTES;

function mediaBucket() {
  const bucket = (env as unknown as RuntimeEnv).MEDIA;
  if (!bucket) throw new AppError("媒体存储尚未配置。", 503);
  return bucket;
}

function safeFileName(value: string) {
  return value.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 120) || "media";
}

function objectValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("上传参数无效。");
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, message = "上传参数无效。") {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(message);
  }
  return value.trim();
}

function numberValue(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AppError("上传参数无效。");
  }
  return value;
}

function mediaKind(value: unknown): MediaKind {
  if (value !== "image" && value !== "video") {
    throw new AppError("媒体类型无效。");
  }
  return value;
}

function validateMedia(
  kind: MediaKind,
  contentType: string,
  sizeBytes: number,
) {
  const allowedTypes = kind === "image" ? IMAGE_TYPES : VIDEO_TYPES;
  if (!allowedTypes.has(contentType)) {
    throw new AppError(
      kind === "image"
        ? "图片仅支持 JPG、PNG、WebP。"
        : "视频仅支持 MP4、MOV、AVI。",
    );
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_MEDIA_BYTES) {
    throw new AppError(
      kind === "image"
        ? "站内上传图片需要在 50MB 以内。"
        : "站内上传视频需要在 50MB 以内；更大的视频请使用可公开访问的 URL。",
    );
  }
}

function requireOwnedUploadKey(r2Key: string, userId: string) {
  if (!r2Key.startsWith(`uploads/${userId}/`) || r2Key.includes("..")) {
    throw new AppError("无权访问这个上传会话。", 403);
  }
}

function uploadedParts(value: unknown, expectedCount: number) {
  if (!Array.isArray(value) || value.length !== expectedCount) {
    throw new AppError("上传分块不完整，请重新上传。");
  }

  return value.map((part, index) => {
    const body = objectValue(part);
    const partNumber = numberValue(body.partNumber);
    const etag = stringValue(body.etag);
    if (!Number.isInteger(partNumber) || partNumber !== index + 1) {
      throw new AppError("上传分块顺序无效，请重新上传。");
    }
    return { partNumber, etag } satisfies R2UploadedPart;
  });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const profile = await requireApiUser();
    const userId = profile.id;
    const requestUrl = new URL(request.url);
    const action = requestUrl.searchParams.get("action");
    const bucket = mediaBucket();

    if (action === "init") {
      const body = objectValue(await request.json());
      const kind = mediaKind(body.kind);
      const fileName = safeFileName(stringValue(body.fileName));
      const contentType = stringValue(body.contentType);
      const sizeBytes = numberValue(body.sizeBytes);
      validateMedia(kind, contentType, sizeBytes);
      await enforceUploadInitializationRateLimit(profile.id);
      await ensureStudioUser(profile);

      const id = crypto.randomUUID();
      const publicToken = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
      const r2Key = `uploads/${userId}/${id}/${fileName}`;
      const upload = await bucket.createMultipartUpload(r2Key, {
        httpMetadata: {
          contentType,
          contentDisposition: inlineContentDisposition(fileName),
        },
      });

      return Response.json(
        {
          id,
          publicToken,
          r2Key,
          uploadId: upload.uploadId,
          fileName,
          kind,
          contentType,
          sizeBytes,
        },
        { status: 201 },
      );
    }

    if (action === "part") {
      const uploadId = stringValue(requestUrl.searchParams.get("uploadId"));
      const r2Key = stringValue(requestUrl.searchParams.get("r2Key"));
      const partNumber = Number(requestUrl.searchParams.get("partNumber"));
      requireOwnedUploadKey(r2Key, userId);
      if (
        !Number.isInteger(partNumber) ||
        partNumber < 1 ||
        partNumber > MAX_MULTIPART_PARTS
      ) {
        throw new AppError("上传分块编号无效。");
      }

      const chunk = await request.arrayBuffer();
      if (chunk.byteLength <= 0 || chunk.byteLength > MULTIPART_CHUNK_BYTES) {
        throw new AppError("单个上传分块需要在 5MB 以内。", 413);
      }
      const part = await bucket
        .resumeMultipartUpload(r2Key, uploadId)
        .uploadPart(partNumber, chunk);
      return Response.json(part);
    }

    if (action === "complete") {
      const body = objectValue(await request.json());
      const id = stringValue(body.id);
      const publicToken = stringValue(body.publicToken);
      const uploadId = stringValue(body.uploadId);
      const r2Key = stringValue(body.r2Key);
      const fileName = safeFileName(stringValue(body.fileName));
      const kind = mediaKind(body.kind);
      const contentType = stringValue(body.contentType);
      const sizeBytes = numberValue(body.sizeBytes);
      validateMedia(kind, contentType, sizeBytes);
      requireOwnedUploadKey(r2Key, userId);
      if (r2Key !== `uploads/${userId}/${id}/${fileName}`) {
        throw new AppError("上传会话信息不匹配。", 403);
      }
      if (publicToken.length !== 73 || !/^[0-9a-f-]+$/.test(publicToken)) {
        throw new AppError("上传会话信息无效。");
      }

      const expectedPartCount = Math.ceil(sizeBytes / MULTIPART_CHUNK_BYTES);
      const parts = uploadedParts(body.parts, expectedPartCount);
      const object = await bucket
        .resumeMultipartUpload(r2Key, uploadId)
        .complete(parts);
      if (object.size !== sizeBytes) {
        await bucket.delete(r2Key);
        throw new AppError("上传文件大小校验失败，请重新上传。");
      }

      try {
        await getDb().insert(mediaAssets).values({
          id,
          userId,
          publicToken,
          r2Key,
          kind,
          fileName,
          contentType,
          sizeBytes: object.size,
        });
      } catch (error) {
        await bucket.delete(r2Key);
        throw error;
      }

      return Response.json(
        {
          url: new URL(`/api/media/${publicToken}`, request.url).toString(),
          fileName,
          kind,
        },
        { status: 201 },
      );
    }

    if (action === "abort") {
      const body = objectValue(await request.json());
      const uploadId = stringValue(body.uploadId);
      const r2Key = stringValue(body.r2Key);
      requireOwnedUploadKey(r2Key, userId);
      await bucket.resumeMultipartUpload(r2Key, uploadId).abort();
      return new Response(null, { status: 204 });
    }

    await enforceUploadInitializationRateLimit(profile.id);
    const user = await ensureStudioUser(profile);
    const form = await request.formData();
    const file = form.get("file");
    const requestedKind = form.get("kind");

    if (!(file instanceof File)) {
      throw new AppError("请选择需要上传的文件。");
    }

    const kind =
      requestedKind === "video"
        ? "video"
        : requestedKind === "image"
          ? "image"
          : null;
    if (!kind) throw new AppError("媒体类型无效。");

    validateMedia(kind, file.type, file.size);

    const id = crypto.randomUUID();
    const publicToken = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    const fileName = safeFileName(file.name);
    const r2Key = `uploads/${user.id}/${id}/${fileName}`;

    await bucket.put(r2Key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        contentDisposition: inlineContentDisposition(fileName),
      },
    });

    await getDb().insert(mediaAssets).values({
      id,
      userId: user.id,
      publicToken,
      r2Key,
      kind,
      fileName,
      contentType: file.type,
      sizeBytes: file.size,
    });

    return Response.json(
      {
        url: new URL(`/api/media/${publicToken}`, request.url).toString(),
        fileName,
        kind,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
