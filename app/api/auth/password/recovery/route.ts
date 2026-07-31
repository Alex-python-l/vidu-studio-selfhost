import { runtimeEnv as env } from "@/lib/runtime-env";
import { createAppSession, recoverAdminAccess } from "@/lib/account-data";
import { authRuntimeConfig } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { APP_SESSION_MAX_AGE_SECONDS, assertSameOrigin, newSessionToken, normalizeAuthEmail, normalizeOpaqueInput, registrationCodeDigest, requireInvitationSigningConfig, sessionCookie, sessionTokenDigest } from "@/lib/session-security";
import { authErrorResponse, authJson, authRequestId, readAuthJson } from "../../_shared";

type RecoveryRuntimeEnv = { ADMIN_EMAILS?: string; ADMIN_RECOVERY_SECRET?: string };

export function GET() {
  const runtimeEnv = env as unknown as RecoveryRuntimeEnv;
  const recoverySecret = runtimeEnv.ADMIN_RECOVERY_SECRET?.trim() ?? process.env.ADMIN_RECOVERY_SECRET?.trim();
  if (!recoverySecret) return new Response("Not found", { status: 404 });
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>创建管理员访问口令</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f6ef;font:16px system-ui;color:#182018}form{width:min(420px,calc(100vw - 40px));display:grid;gap:16px;padding:32px;border:1px solid #cad1c3;border-radius:22px;background:#fff}label{display:grid;gap:7px;font-weight:650}input,button{min-height:48px;border-radius:12px;font:inherit}input{border:1px solid #aeb8aa;padding:0 13px}button{border:0;background:#5d7900;color:#fff;font-weight:750}</style></head><body><form method="post" action="/api/auth/password/recovery"><h1>创建管理员访问口令</h1><label>管理员邮箱<input name="email" type="email" required></label><label>访问口令<input name="code" type="text" minlength="6" maxlength="64" required></label><label>临时恢复密钥<input name="recoverySecret" type="password" required></label><button type="submit">创建口令</button></form></body></html>`, { headers: { "Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(request: Request) {
  const requestId = authRequestId(request);
  try {
    assertSameOrigin(request);
    const formRequest = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded");
    const body = formRequest ? Object.fromEntries(await request.formData()) : await readAuthJson(request);
    const email = normalizeAuthEmail(body.email);
    const code = normalizeOpaqueInput(body.code, "访问口令", 64).toUpperCase();
    const runtimeEnv = env as unknown as RecoveryRuntimeEnv;
    const recoverySecret = runtimeEnv.ADMIN_RECOVERY_SECRET?.trim() ?? process.env.ADMIN_RECOVERY_SECRET?.trim();
    const allowedEmails = runtimeEnv.ADMIN_EMAILS?.trim() ?? process.env.ADMIN_EMAILS?.trim() ?? "";
    if (!recoverySecret || !adminEmails(allowedEmails).has(email)) throw new AppError("管理员恢复入口不可用。", 404);
    const providedSecret = request.headers.get("x-admin-recovery-secret") ?? (typeof body.recoverySecret === "string" ? body.recoverySecret : "");
    if (!(await secretsEqual(providedSecret, recoverySecret))) throw new AppError("管理员恢复凭证无效。", 403);
    const config = requireInvitationSigningConfig(authRuntimeConfig());
    const invitation = await recoverAdminAccess({ email, code, origin: new URL(request.url).origin, requestId, tokenDigest: await registrationCodeDigest(code, config.sessionTokenPepper) });
    const token = newSessionToken();
    await createAppSession({
      userId: invitation.userId,
      tokenDigest: await sessionTokenDigest(token, config.sessionTokenPepper),
      expiresAt: new Date(Date.now() + APP_SESSION_MAX_AGE_SECONDS * 1_000).toISOString(),
    });
    if (formRequest) return new Response(null, { status: 303, headers: { "Cache-Control": "no-store", Location: "/admin", "Set-Cookie": sessionCookie(token), "X-Request-Id": requestId } });
    return authJson({ invitation }, { status: 201 }, requestId);
  } catch (error) { return authErrorResponse(error, requestId); }
}
function adminEmails(value: string) { return new Set(value.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)); }
async function secretsEqual(left: string, right: string) { const encoder = new TextEncoder(); const [a,b] = await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(left)),crypto.subtle.digest("SHA-256",encoder.encode(right))]); const x=new Uint8Array(a),y=new Uint8Array(b); let d=x.length^y.length; for(let i=0;i<x.length;i+=1)d|=x[i]^y[i]; return d===0; }
