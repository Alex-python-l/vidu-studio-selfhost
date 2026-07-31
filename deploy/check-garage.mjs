import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "garage",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.S3_BUCKET;
const key = `_health/${crypto.randomUUID()}.txt`;
const expected = "vidu-studio-garage-health";

try {
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: expected }),
  );
  const result = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const actual = await result.Body.transformToString();
  if (actual !== expected) throw new Error("Garage read-back mismatch.");
  console.log("garage=ok");
} catch (error) {
  console.error(`garage=failed ${error.name || "Error"}`);
  process.exitCode = 1;
} finally {
  await client
    .send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    .catch(() => undefined);
  client.destroy();
}
