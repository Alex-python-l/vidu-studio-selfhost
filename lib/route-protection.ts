import {
  consumeRateLimit,
  consumeTaskSubmissionRateLimit,
} from "@/lib/account-data";
import { authRuntimeConfig } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { abuseBucketDigest } from "@/lib/session-security";

async function accountDigest(userId: string) {
  const secret = authRuntimeConfig().abuseHashSecret;
  if (!secret) {
    throw new AppError("账号风控尚未配置，请稍后再试。", 503);
  }
  return abuseBucketDigest(`account:${userId}`, secret);
}

export async function enforceTaskSubmissionRateLimit(userId: string) {
  const result = await consumeTaskSubmissionRateLimit({
    keyDigest: await accountDigest(userId),
  });
  if (!result.allowed) {
    throw new AppError("任务提交过于频繁，请稍后再试。", 429);
  }
}

export async function enforceUploadInitializationRateLimit(userId: string) {
  const result = await consumeRateLimit({
    scope: "upload_init",
    keyDigest: await accountDigest(userId),
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (!result.allowed) {
    throw new AppError("上传请求过于频繁，请稍后再试。", 429);
  }
}
