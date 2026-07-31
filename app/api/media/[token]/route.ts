import { runtimeEnv as env } from "@/lib/runtime-env";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { mediaAssets } from "@/db/schema";
import { inlineContentDisposition } from "@/lib/content-disposition";

type StoredObject = {
  body: ReadableStream;
  size: number;
  httpEtag?: string;
};

type MediaBucket = {
  get(key: string): Promise<StoredObject | null>;
};

type RuntimeEnv = {
  MEDIA?: MediaBucket;
};

export async function GET(
  _request: Request,
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
  const object = await bucket.get(asset.r2Key);
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": asset.contentType,
      "Content-Length": String(object.size),
      "Content-Disposition": inlineContentDisposition(asset.fileName),
      "Cache-Control": "public, max-age=3600",
      ...(object.httpEtag ? { ETag: object.httpEtag } : {}),
    },
  });
}
