import { runtimeEnv as env } from "@/lib/runtime-env";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { mediaAssets } from "@/db/schema";
import { inlineContentDisposition } from "@/lib/content-disposition";
import sharp from "sharp";

type StoredObject = {
  body: ReadableStream;
  size: number;
  httpEtag?: string;
};

type MediaBucket = {
  get(key: string): Promise<StoredObject | null>;
  put(
    key: string,
    body: Uint8Array,
    options?: {
      httpMetadata?: {
        contentType?: string;
        contentDisposition?: string;
      };
    },
  ): Promise<{ size: number; httpEtag?: string }>;
};

type RuntimeEnv = {
  MEDIA?: MediaBucket;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const [asset] = await getDb()
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.publicToken, token))
    .limit(1);

  if (!asset) return new Response("Not found", { status: 404 });

  const bucket = (env as unknown as RuntimeEnv).MEDIA;
  if (!bucket) return new Response("Storage unavailable", { status: 503 });

  if (
    new URL(request.url).searchParams.get("variant") === "thumbnail" &&
    asset.contentType.startsWith("image/")
  ) {
    const thumbnailKey = `${asset.r2Key}.thumbnail.webp`;
    const cachedThumbnail = await bucket.get(thumbnailKey);
    if (cachedThumbnail) {
      return mediaResponse(cachedThumbnail, {
        contentType: "image/webp",
        fileName: `${asset.fileName}.webp`,
        immutable: true,
      });
    }

    const original = await bucket.get(asset.r2Key);
    if (!original) return new Response("Not found", { status: 404 });
    const originalBytes = Buffer.from(await new Response(original.body).arrayBuffer());

    try {
      const thumbnailBytes = await sharp(originalBytes)
        .rotate()
        .resize({
          width: 192,
          height: 288,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();
      const storedThumbnail = await bucket
        .put(thumbnailKey, thumbnailBytes, {
          httpMetadata: {
            contentType: "image/webp",
            contentDisposition: inlineContentDisposition(`${asset.fileName}.webp`),
          },
        })
        .catch(() => undefined);

      return mediaResponse(
        {
          body: new Response(thumbnailBytes).body!,
          size: thumbnailBytes.byteLength,
          httpEtag: storedThumbnail?.httpEtag,
        },
        {
          contentType: "image/webp",
          fileName: `${asset.fileName}.webp`,
          immutable: true,
        },
      );
    } catch {
      return mediaResponse(
        {
          body: new Response(originalBytes).body!,
          size: originalBytes.byteLength,
          httpEtag: original.httpEtag,
        },
        { contentType: asset.contentType, fileName: asset.fileName },
      );
    }
  }

  const object = await bucket.get(asset.r2Key);
  if (!object) return new Response("Not found", { status: 404 });

  return mediaResponse(object, {
    contentType: asset.contentType,
    fileName: asset.fileName,
  });
}

function mediaResponse(
  object: StoredObject,
  input: {
    contentType: string;
    fileName: string;
    immutable?: boolean;
  },
) {
  return new Response(object.body, {
    headers: {
      "Content-Type": input.contentType,
      "Content-Length": String(object.size),
      "Content-Disposition": inlineContentDisposition(input.fileName),
      "Cache-Control": input.immutable
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600",
      ...(object.httpEtag ? { ETag: object.httpEtag } : {}),
    },
  });
}
