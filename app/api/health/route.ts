import { ensureRuntimeSchema } from "@/db/runtime-schema";
import { garageBucket } from "@/lib/garage-storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureRuntimeSchema();
    return Response.json(
      { status: "ok", database: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  const expected = process.env.INTERNAL_HEALTH_SECRET?.trim();
  const provided = request.headers.get("x-internal-health-secret")?.trim();
  if (!expected || !provided || !(await sameSecret(expected, provided))) {
    return new Response("Not found", { status: 404 });
  }

  const key = `_health/${crypto.randomUUID()}.txt`;
  const expectedBody = "vidu-studio-garage-health";
  const bucket = garageBucket();
  try {
    await ensureRuntimeSchema();
    await bucket.put(key, new TextEncoder().encode(expectedBody), {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    });
    const object = await bucket.get(key);
    if (!object) throw new Error("Garage health object was not readable.");
    const actualBody = await streamText(object.body);
    if (actualBody !== expectedBody) {
      throw new Error("Garage health object did not match.");
    }
    return Response.json(
      { status: "ok", database: "ok", storage: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    await bucket.delete(key).catch(() => undefined);
  }
}

async function streamText(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

async function sameSecret(expected: string, provided: string) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}
