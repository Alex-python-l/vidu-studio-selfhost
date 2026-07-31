import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminSource = await readFile(
  new URL("../app/admin/AdminClient.tsx", import.meta.url),
  "utf8",
);
const toastSource = await readFile(
  new URL("../app/components/ui/Toast.tsx", import.meta.url),
  "utf8",
);
const providerKeySource = await readFile(
  new URL("../lib/provider-keys.ts", import.meta.url),
  "utf8",
);
const providerKeyCryptoSource = await readFile(
  new URL("../lib/provider-key-crypto.ts", import.meta.url),
  "utf8",
);
const providerKeyAvailabilitySource = await readFile(
  new URL("../lib/provider-key-availability.ts", import.meta.url),
  "utf8",
);
const providerKeyRouteSource = await readFile(
  new URL("../app/api/admin/provider-keys/route.ts", import.meta.url),
  "utf8",
);
const providerUsageSource = await readFile(
  new URL("../lib/provider-usage.ts", import.meta.url),
  "utf8",
);
const providerUsageChartSource = await readFile(
  new URL("../app/admin/ProviderUsageChart.tsx", import.meta.url),
  "utf8",
);
const taskDataSource = await readFile(
  new URL("../lib/data.ts", import.meta.url),
  "utf8",
);
const viduSource = await readFile(
  new URL("../lib/vidu.ts", import.meta.url),
  "utf8",
);
const adminAuditRouteSource = await readFile(
  new URL("../app/api/admin/audit/route.ts", import.meta.url),
  "utf8",
);
const adminUserRouteSource = await readFile(
  new URL("../app/api/admin/users/[id]/route.ts", import.meta.url),
  "utf8",
);
const loginSource = await readFile(
  new URL("../app/login/LoginClient.tsx", import.meta.url),
  "utf8",
);
const codeRouteSource = await readFile(
  new URL("../app/api/auth/code/route.ts", import.meta.url),
  "utf8",
);
const passwordRouteSource = await readFile(
  new URL("../app/api/auth/password/route.ts", import.meta.url),
  "utf8",
);
const recoveryRouteSource = await readFile(
  new URL("../app/api/auth/password/recovery/route.ts", import.meta.url),
  "utf8",
);
const accountDataSource = await readFile(
  new URL("../lib/account-data.ts", import.meta.url),
  "utf8",
);
const inviteSource = await readFile(
  new URL("../app/invite/[token]/InviteBridge.tsx", import.meta.url),
  "utf8",
);
const accountPageSource = await readFile(
  new URL("../app/account/page.tsx", import.meta.url),
  "utf8",
);
const accountClientSource = await readFile(
  new URL("../app/account/AccountClient.tsx", import.meta.url),
  "utf8",
);
const accountPasswordRouteSource = await readFile(
  new URL("../app/api/account/password/route.ts", import.meta.url),
  "utf8",
);
const otpVerifyRouteSource = await readFile(
  new URL("../app/api/auth/otp/verify/route.ts", import.meta.url),
  "utf8",
);
const studioSource = await readFile(
  new URL("../app/studio/StudioClient.tsx", import.meta.url),
  "utf8",
);
const tutorialSource = await readFile(
  new URL("../app/components/FeatureTutorialDialog.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("login exposes password, access-code, and OTP flows without ChatGPT login", () => {
  assert.match(loginSource, /htmlFor=\{emailId\}/);
  assert.match(loginSource, /autoComplete="current-password"/);
  assert.match(loginSource, /autoComplete="one-time-code"/);
  assert.match(loginSource, /aria-live="polite"/);
  assert.match(loginSource, /登录正在维护/);
  assert.doesNotMatch(loginSource, /使用 ChatGPT 登录/);
  assert.match(loginSource, /turnstileSiteKey/);
  assert.match(loginSource, /window\.location\.assign\(returnTo\)/);
  assert.match(loginSource, /访问口令/);
  assert.match(loginSource, /\/api\/auth\/code/);
  assert.match(loginSource, /\/api\/auth\/password/);
  assert.match(loginSource, /没有账户？使用访问口令注册/);
  assert.doesNotMatch(loginSource, /<TabsTab value="code">/);
  assert.match(loginSource, /当前只校验格式/);
  assert.match(loginSource, /const otpConfigured = Boolean\(turnstileSiteKey\)/);
  assert.match(loginSource, /otpConfigured \? <TabsTab value="otp">/);
  assert.match(loginSource, /mode === "otp" && !otpConfigured/);
  assert.doesNotMatch(
    loginSource,
    /handleCodeAccess[\s\S]*?if \(!turnstileToken\)/,
  );
});

test("password login is rate-limited, generic on failure, and creates an app session", () => {
  assert.match(passwordRouteSource, /action: "password_login"/);
  assert.match(passwordRouteSource, /DUMMY_CREDENTIAL/);
  assert.match(passwordRouteSource, /邮箱或密码错误。/);
  assert.match(passwordRouteSource, /createAppSession/);
  assert.match(passwordRouteSource, /sessionCookie\(token\)/);
});

test("access-code login keeps rate limits without requiring Turnstile", () => {
  assert.match(codeRouteSource, /enforceAuthRateLimits/);
  assert.doesNotMatch(codeRouteSource, /verifyTurnstile|turnstileToken/);
});

test("admin access recovery is temporary, allowlisted, one-time, and audited", () => {
  assert.match(recoveryRouteSource, /ADMIN_RECOVERY_SECRET/);
  assert.match(recoveryRouteSource, /ADMIN_EMAILS/);
  assert.match(recoveryRouteSource, /assertSameOrigin\(request\)/);
  assert.match(recoveryRouteSource, /x-admin-recovery-secret/);
  assert.match(recoveryRouteSource, /application\/x-www-form-urlencoded/);
  assert.match(recoveryRouteSource, /<form method="post"/);
  assert.match(recoveryRouteSource, /secretsEqual\(providedSecret, recoverySecret\)/);
  assert.match(recoveryRouteSource, /registrationCodeDigest/);
  assert.match(accountDataSource, /export async function recoverAdminAccess/);
  assert.match(accountDataSource, /action: "user\.recover_admin"/);
  assert.match(accountDataSource, /maxUses: 1/);
});

test("session retention uses a MySQL-compatible derived table", () => {
  assert.match(accountDataSource, /SELECT retained_sessions\.id/);
  assert.match(accountDataSource, /\) AS retained_sessions/);
  assert.match(accountDataSource, /LIMIT \$\{maxActiveSessions - 1\}/);
});

test("invite bridge removes the raw token from the address bar flow", () => {
  assert.match(inviteSource, /sessionStorage\.setItem/);
  assert.match(inviteSource, /window\.location\.replace\("\/login\?invite=stored"\)/);
  assert.doesNotMatch(inviteSource, /\{token\}<\/code>/);
});

test("admin UI announces state and disables all writes for support users", () => {
  assert.match(adminSource, /<Toast/);
  assert.match(adminSource, /notice\.tone === "success" \? 4_500 : 7_000/);
  assert.match(toastSource, /data-slot="toast-viewport"/);
  assert.match(toastSource, /role=\{tone === "error" \? "alert" : "status"\}/);
  assert.match(toastSource, /aria-live=\{tone === "error" \? "assertive" : "polite"\}/);
  assert.match(toastSource, /aria-label="关闭提示"/);
  assert.match(toastSource, /warning: "请注意"/);
  assert.match(styles, /\.ui-toast-viewport/);
  assert.match(styles, /@keyframes ui-toast-enter/);
  assert.match(adminSource, /const canWrite = viewer\.role === "admin"/);
  assert.match(adminSource, /disabled=\{!canWrite\}/);
  assert.match(adminSource, /支持人员只读模式/);
  assert.match(adminSource, /crypto\.randomUUID\(\)/);
  assert.match(adminSource, /AlertDialogTitle>撤销此用户的全部活跃会话/);
  assert.match(adminSource, /最近额度账本/);
  assert.match(adminSource, /formatCreditAmount\(entry\.amount\)/);
  assert.match(adminSource, /创建访问口令/);
  assert.match(adminSource, /初始并发数/);
  assert.match(adminSource, /每日额度上限/);
  assert.match(adminSource, /initialConcurrencyLimit/);
  assert.match(adminSource, /initialDailyCreditLimit/);
  assert.match(accountDataSource, /initial_concurrency_limit/);
  assert.match(accountDataSource, /initial_daily_credit_limit/);
  assert.match(adminSource, /访问口令管理/);
  assert.match(adminSource, /保存配置/);
  assert.match(adminSource, /删除这个访问口令/);
  assert.match(adminSource, /method: "PATCH"/);
  assert.match(adminSource, /method: "DELETE"/);
  assert.match(
    adminSource,
    /setDeleteInvitationTarget\(selectedInvitation\);\s+setSelectedInvitation\(null\);\s+setInvitationEditor\(null\);/,
  );
  assert.match(adminSource, /admin-user-dialog/);
  assert.match(adminSource, /admin-code-dialog/);
  assert.match(adminSource, /ledgerDirection/);
  assert.match(adminSource, /nextAuditCursor/);
  assert.match(adminSource, /nextLedgerCursor/);
  assert.match(adminSource, /上一页/);
  assert.match(adminSource, /下一页/);
  assert.match(accountDataSource, /ledgerCursor/);
  assert.match(accountDataSource, /nextLedgerCursor/);
  assert.match(adminAuditRouteSource, /limit: 8/);
  assert.match(adminSource, /\/api\/admin\/users\/\$\{encodeURIComponent\(selectedUser\.id\)\}\/password/);
  assert.match(adminSource, /创建登录密码/);
  assert.match(adminSource, /更新登录密码/);
  assert.match(adminSource, /移除密码/);
  assert.match(adminSource, /\/api\/admin\/provider-keys/);
  assert.match(adminSource, /设为活跃 Key/);
  assert.match(adminSource, /分配管理员角色/);
  assert.match(adminSource, /option value="admin">管理员/);
  assert.match(adminSource, /删除用户/);
  assert.match(adminSource, /历史任务、额度账本、媒体索引和审计记录会保留/);
  assert.match(adminSource, /method: "DELETE"/);
  assert.match(adminUserRouteSource, /export async function DELETE/);
  assert.match(adminUserRouteSource, /deleteAdminUser/);
  assert.match(adminUserRouteSource, /requireAdminUser\(\{ write: true \}\)/);
  assert.match(accountDataSource, /export async function deleteAdminUser/);
  assert.match(accountDataSource, /const where: string\[\] = \["deleted_at IS NULL"\]/);
  assert.match(accountDataSource, /不能删除当前登录的管理员账号/);
  assert.match(accountDataSource, /user\.delete/);
  assert.match(accountDataSource, /必须至少保留一名活跃管理员/);
  assert.match(providerKeySource, /provider_key_settings/);
  assert.match(providerKeySource, /provider_key\.activate/);
  assert.match(providerKeySource, /provider_key_secrets/);
  assert.match(providerKeySource, /provider_key\.create/);
  assert.match(providerKeySource, /provider_key\.delete/);
  assert.match(providerKeySource, /environmentPrefix: "VIDU_API_KEY"/);
  assert.match(providerKeySource, /environmentPrefix: "GEMINI_API_KEY"/);
  assert.match(providerKeyCryptoSource, /AES-GCM/);
  assert.match(adminSource, /添加 Key/);
  assert.match(adminSource, /type="password"/);
  assert.match(adminSource, /加密保存并启用/);
  assert.match(adminSource, /删除这个服务 Key/);
  assert.match(providerKeyRouteSource, /export async function POST/);
  assert.match(providerKeyRouteSource, /export async function DELETE/);
  assert.match(providerKeyRouteSource, /requireAdminUser\(\{ write: true \}\)/);
  assert.match(
    providerKeyRouteSource,
    /checkActiveProviderKeyAvailability\(input\.provider\)/,
  );
  assert.match(adminSource, /providerKeyNotice/);
  assert.match(adminSource, /保存或切换结果不受影响/);
  assert.match(providerKeyAvailabilitySource, /\/ent\/v2\/credits/);
  assert.match(adminSource, /活跃 Key 额度与消耗/);
  assert.match(adminSource, /Vidu credits 消耗/);
  assert.match(adminSource, /Gemini 分析尝试/);
  assert.match(adminSource, /ProviderUsageChart/);
  assert.match(providerUsageChartSource, /from "recharts"/);
  assert.match(providerUsageChartSource, /ResponsiveContainer/);
  assert.match(providerUsageChartSource, /CartesianGrid/);
  assert.match(providerUsageChartSource, /<Tooltip/);
  assert.match(providerUsageChartSource, /accessibilityLayer/);
  assert.match(providerUsageChartSource, /role="img"/);
  assert.match(providerUsageChartSource, /最近 7 天柱状图/);
  assert.doesNotMatch(styles, /\.admin-usage-bar-track/);
  assert.match(providerKeyRouteSource, /inspectActiveProviderKey\("vidu"\)/);
  assert.match(providerKeyRouteSource, /getProviderUsage\(\)/);
  assert.match(providerUsageSource, /SUM\(charged_credits\)/);
  assert.match(providerUsageSource, /SUM\(attempt_count\)/);
  assert.match(viduSource, /chargedCredits:/);
  assert.match(taskDataSource, /task:settle:\$\{input\.taskId\}/);
  assert.match(taskDataSource, /isTerminalTaskState\(input\.state\)/);
  assert.match(
    taskDataSource,
    /state IN \('created', 'queueing', 'processing'\)/,
  );
  assert.match(providerKeyAvailabilitySource, /\/v1beta\/models\?pageSize=1/);
  assert.match(providerKeyAvailabilitySource, /"x-goog-api-key"/);
  assert.match(providerKeyAvailabilitySource, /AbortSignal\.timeout\(10_000\)/);
  assert.doesNotMatch(adminSource, /VIDU_API_KEY|GEMINI_API_KEY/);
});

test("admin and auth layouts include mobile and reduced-motion safeguards", () => {
  assert.match(styles, /@media \(max-width: 560px\)/);
  assert.match(styles, /@media \(max-width: 390px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.auth-shell,\s*\.admin-shell/);
  assert.match(styles, /overflow-x: clip/);
  assert.match(styles, /min-height: 44px/);
  assert.doesNotMatch(styles, /\.credit-top-up-button/);
  assert.doesNotMatch(styles, /\.credit-top-up-feedback/);
});

test("registration requires a password and users can manage their own account", () => {
  assert.match(loginSource, /registrationPasswordConfirmation/);
  assert.match(loginSource, /password: registrationPassword/);
  assert.match(loginSource, /autoComplete="new-password"/);
  assert.match(codeRouteSource, /normalizePassword\(body\.password\)/);
  assert.match(codeRouteSource, /credential: await hashPassword\(password\)/);
  assert.doesNotMatch(codeRouteSource, /setUserPassword/);
  assert.match(accountDataSource, /该邮箱已注册，请直接登录/);
  assert.match(accountDataSource, /INSERT INTO password_credentials/);
  assert.match(accountPageSource, /getAccountOverview/);
  assert.match(accountClientSource, /账户与额度/);
  assert.match(accountClientSource, /额度明细/);
  assert.match(accountClientSource, /autoComplete="current-password"/);
  assert.match(accountClientSource, /currentPassword/);
  assert.match(accountClientSource, /\/api\/account\/password/);
  assert.match(accountPasswordRouteSource, /requireApiUser/);
  assert.match(accountPasswordRouteSource, /verifyPassword/);
  assert.match(accountPasswordRouteSource, /action: "password_change"/);
  assert.match(accountPasswordRouteSource, /targetUserId: user\.id/);
  assert.match(accountPasswordRouteSource, /preserveSessionDigest/);
  assert.match(accountDataSource, /export async function getAccountOverview/);
});

test("email-code login keeps passwords optional and starts the guided onboarding", () => {
  assert.doesNotMatch(otpVerifyRouteSource, /setUserPassword|hashPassword/);
  assert.match(loginSource, /PASSWORD_REMINDER_STORAGE_KEY/);
  assert.match(loginSource, /sessionStorage\.setItem\(PASSWORD_REMINDER_STORAGE_KEY, "1"\)/);
  assert.match(studioSource, /passwordReminderOpen/);
  assert.match(studioSource, /TUTORIAL_DISMISS_STORAGE_KEY/);
  assert.match(studioSource, /showTrigger=\{false\}/);
  assert.match(tutorialSource, /autoOpen/);
  assert.match(tutorialSource, /dismissStorageKey/);
  assert.match(tutorialSource, /tutorial-dismiss-control/);
});
