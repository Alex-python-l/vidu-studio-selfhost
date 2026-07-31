"use client";

import Script from "next/script";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, CheckCircle, Envelope, Lock } from "reicon-react";
import { AmbientBackdrop } from "@/app/components/AmbientBackdrop";
import { Button } from "@/app/components/ui/Button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/app/components/ui/Card";
import {
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@/app/components/ui/Tabs";

const INVITE_STORAGE_KEY = "vidu_pending_invite";
const PASSWORD_REMINDER_STORAGE_KEY = "vidu_password_setup_reminder";

type LoginStep = "request" | "verify";
type LoginMode = "password" | "code" | "otp";
type Feedback = { tone: "error" | "success" | "info"; message: string };

declare global {
  interface Window {
    turnstile?: {
      render(
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
          theme: "auto";
          size: "flexible";
        },
      ): string;
      reset(widgetId?: string): void;
      remove(widgetId: string): void;
    };
  }
}

export function LoginClient({
  initialInviteToken,
  returnTo,
  turnstileSiteKey,
}: {
  initialInviteToken?: string;
  returnTo: string;
  turnstileSiteKey: string;
}) {
  const [step, setStep] = useState<LoginStep>("request");
  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registrationPassword, setRegistrationPassword] = useState("");
  const [registrationPasswordConfirmation, setRegistrationPasswordConfirmation] =
    useState("");
  const [otp, setOtp] = useState("");
  const [code, setCode] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | undefined>(undefined);
  const emailId = useId();
  const passwordId = useId();
  const registrationPasswordId = useId();
  const registrationPasswordConfirmationId = useId();
  const otpId = useId();
  const feedbackId = useId();

  useEffect(() => {
    const storedInvite = window.sessionStorage.getItem(INVITE_STORAGE_KEY);
    const candidate =
      initialInviteToken && initialInviteToken !== "stored"
        ? initialInviteToken
        : storedInvite;
    if (candidate) {
      queueMicrotask(() => {
        setInviteToken(candidate);
        setMode("code");
      });
      window.sessionStorage.setItem(INVITE_STORAGE_KEY, candidate);
    }
    if (window.location.search) {
      const cleanUrl =
        returnTo === "/studio"
          ? "/login"
          : `/login?returnTo=${encodeURIComponent(returnTo)}`;
      window.history.replaceState(null, "", cleanUrl);
    }
  }, [initialInviteToken, returnTo]);

  useEffect(() => {
    if (
      mode !== "otp" ||
      step !== "request" ||
      !turnstileSiteKey ||
      !turnstileReady ||
      !window.turnstile ||
      !turnstileContainer.current
    ) {
      return;
    }
    if (turnstileWidgetId.current) return;

    turnstileWidgetId.current = window.turnstile.render(
      turnstileContainer.current,
      {
        sitekey: turnstileSiteKey,
        callback: setTurnstileToken,
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => {
          setTurnstileToken("");
          setFeedback({
            tone: "error",
            message: "安全验证暂时不可用，请刷新页面后重试。",
          });
        },
        theme: "auto",
        size: "flexible",
      },
    );

    return () => {
      if (turnstileWidgetId.current) {
        window.turnstile?.remove(turnstileWidgetId.current);
        turnstileWidgetId.current = undefined;
      }
    };
  }, [mode, step, turnstileReady, turnstileSiteKey]);

  function resetTurnstile() {
    setTurnstileToken("");
    window.turnstile?.reset(turnstileWidgetId.current);
  }

  async function handleRequestOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!turnstileToken) {
      setFeedback({ tone: "error", message: "请先完成安全验证。" });
      return;
    }

    setSubmitting(true);
    setFeedback({ tone: "info", message: "正在发送验证码…" });
    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          inviteToken,
          turnstileToken,
        }),
      });
      if (!response.ok && response.status !== 202) {
        const payload = await safeJson(response);
        throw new Error(payload.error ?? "验证码发送失败，请稍后重试。");
      }
      setStep("verify");
      setFeedback({
        tone: "success",
        message: "如邮箱与邀请匹配，6 位验证码已发送。请检查收件箱。",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "验证码发送失败，请稍后重试。",
      });
      resetTurnstile();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCodeAccess(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteToken && code.trim().length < 6) {
      setFeedback({ tone: "error", message: "请输入至少 6 位访问口令。" });
      return;
    }

    if (registrationPassword.length < 8) {
      setFeedback({ tone: "error", message: "请设置至少 8 个字符的登录密码。" });
      return;
    }
    if (registrationPassword !== registrationPasswordConfirmation) {
      setFeedback({ tone: "error", message: "两次输入的登录密码不一致。" });
      return;
    }

    setSubmitting(true);
    setFeedback({ tone: "info", message: "正在校验访问口令并建立会话…" });
    try {
      const response = await fetch("/api/auth/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: inviteToken ? undefined : code.trim(),
          inviteToken,
          password: registrationPassword,
        }),
      });
      const payload = await safeJson(response);
      if (!response.ok) {
        throw new Error(payload.error ?? "访问口令无效或已过期。");
      }
      window.sessionStorage.removeItem(INVITE_STORAGE_KEY);
      setRegistrationPassword("");
      setRegistrationPasswordConfirmation("");
      setFeedback({ tone: "success", message: "访问已开通，正在进入创作台…" });
      window.location.assign(returnTo);
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "访问口令无效或已过期。",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setFeedback({
        tone: "error",
        message: "请输入至少 8 个字符的登录密码。",
      });
      return;
    }

    setSubmitting(true);
    setFeedback({ tone: "info", message: "正在校验密码并建立安全会话…" });
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      const payload = await safeJson(response);
      if (!response.ok) {
        throw new Error(payload.error ?? "邮箱或密码错误。");
      }
      setPassword("");
      setFeedback({ tone: "success", message: "登录成功，正在进入创作台…" });
      window.location.assign(returnTo);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "邮箱或密码错误。",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setFeedback({ tone: "error", message: "请输入邮件中的 6 位验证码。" });
      return;
    }

    setSubmitting(true);
    setFeedback({ tone: "info", message: "正在验证并建立安全会话…" });
    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          otp,
          inviteToken,
        }),
      });
      const payload = await safeJson(response);
      if (!response.ok) {
        throw new Error(payload.error ?? "验证码无效或已过期。");
      }
      window.sessionStorage.removeItem(INVITE_STORAGE_KEY);
      window.sessionStorage.setItem(PASSWORD_REMINDER_STORAGE_KEY, "1");
      setFeedback({ tone: "success", message: "登录成功，正在进入创作台…" });
      window.location.assign(returnTo);
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "验证码无效或已过期。",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const otpConfigured = Boolean(turnstileSiteKey);

  return (
    <main className="auth-shell">
      <AmbientBackdrop variant="studio" />
      {mode === "otp" ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onReady={() => setTurnstileReady(true)}
        />
      ) : null}

      <Link className="brand-lockup auth-brand" href="/" aria-label="返回 Vidu 首页">
        <span className="brand-mark" aria-hidden="true">V</span>
        <span>Vidu 创作台</span>
      </Link>

      <section className="auth-layout" aria-labelledby="auth-title">
        <div className="auth-intro">
          <p className="eyebrow">INVITE ACCESS</p>
          <h1 id="auth-title">带着你的额度，继续创作。</h1>
          <p>
            新用户可使用管理员发放的访问口令注册；已有密码的账户可直接登录。
            当前注册仅校验邮箱格式，不验证邮箱归属。
          </p>
          <div className="auth-trust-list" aria-label="登录安全说明">
            <span><Lock size={17} aria-hidden="true" />口令只用于访问授权，不保存明文</span>
            <span><Envelope size={17} aria-hidden="true" />邮箱注册阶段仅检查格式</span>
            <span><CheckCircle size={17} aria-hidden="true" />登录密码以加盐派生值保存</span>
          </div>
        </div>

        <Card className="auth-card">
          <CardHeader>
            <CardTitle>
              {mode === "password"
                ? "使用密码登录"
                : mode === "code"
                  ? "使用访问口令注册"
                  : step === "request"
                    ? "邮箱验证码登录"
                    : "输入 6 位验证码"}
            </CardTitle>
            <CardDescription>
              {mode === "password"
                ? "填写账户邮箱和永久登录密码。访问口令仅用于注册，不是登录密码。"
                : mode === "code"
                  ? inviteToken
                    ? "已识别邮箱专属邀请链接，请填写受邀邮箱。"
                    : "填写邮箱和管理员提供的注册口令；额度只在首次兑换时发放。"
                  : step === "request"
                    ? "已验证邮箱可继续使用邮件验证码登录。"
                    : `验证码已发送至 ${maskEmail(email)}。`}
            </CardDescription>
          </CardHeader>
          <CardPanel>
            <Tabs
              className="auth-mode-tabs"
              value={mode}
              onValueChange={(value) => {
                setMode(value as LoginMode);
                setStep("request");
                setOtp("");
                setFeedback(null);
                resetTurnstile();
              }}
            >
              <TabsList aria-label="选择登录方式">
                <TabsTab value="password">密码登录</TabsTab>
                {otpConfigured ? <TabsTab value="otp">邮箱验证码</TabsTab> : null}
              </TabsList>
              <TabsPanel value="password">
                <form className="auth-form" onSubmit={handlePasswordLogin}>
                  <div className="form-field">
                    <label htmlFor={`${emailId}-password`}>邮箱</label>
                    <input
                      id={`${emailId}-password`}
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      maxLength={320}
                      aria-describedby={feedbackId}
                      placeholder="name@example.com"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor={passwordId}>登录密码</label>
                    <input
                      id={passwordId}
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={8}
                      maxLength={128}
                      aria-describedby={`${passwordId}-help ${feedbackId}`}
                    />
                    <small id={`${passwordId}-help`}>
                      密码区分大小写，长度为 8–128 个字符。
                    </small>
                  </div>
                  <Button
                    className="auth-submit"
                    type="submit"
                    size="lg"
                    loading={submitting}
                    disabled={!email.trim() || password.length < 8}
                  >
                    使用密码登录
                    <ArrowRight size={17} aria-hidden="true" />
                  </Button>
                </form>
              </TabsPanel>
              <TabsPanel value="code">
                <form className="auth-form" onSubmit={handleCodeAccess}>
                  <div className="form-field">
                    <label htmlFor={emailId}>邮箱</label>
                    <input
                      id={emailId}
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      maxLength={320}
                      aria-describedby={`${emailId}-help ${feedbackId}`}
                      placeholder="name@example.com"
                    />
                    <small id={`${emailId}-help`}>
                      当前只校验格式；请使用你后续能够识别的邮箱。
                    </small>
                  </div>
                  {inviteToken ? (
                    <div className="auth-invite-detected" role="status">
                      <CheckCircle size={17} aria-hidden="true" />
                      已从邀请链接安全读取访问口令
                    </div>
                  ) : (
                    <div className="form-field">
                      <label htmlFor={`${emailId}-code`}>访问口令</label>
                      <input
                        id={`${emailId}-code`}
                        name="code"
                        type="text"
                        autoComplete="off"
                        value={code}
                        onChange={(event) =>
                          setCode(event.target.value.toUpperCase())
                        }
                        required
                        minLength={6}
                        maxLength={64}
                        aria-describedby={feedbackId}
                        placeholder="例如 VIDU-START"
                      />
                    </div>
                  )}
                  <div className="form-field">
                    <label htmlFor={registrationPasswordId}>设置登录密码</label>
                    <input
                      id={registrationPasswordId}
                      name="registration-password"
                      type="password"
                      autoComplete="new-password"
                      value={registrationPassword}
                      onChange={(event) => setRegistrationPassword(event.target.value)}
                      required
                      minLength={8}
                      maxLength={128}
                      aria-describedby={`${registrationPasswordId}-help ${feedbackId}`}
                    />
                    <small id={`${registrationPasswordId}-help`}>
                      注册完成后可用此密码登录；长度为 8–128 个字符。
                    </small>
                  </div>
                  <div className="form-field">
                    <label htmlFor={registrationPasswordConfirmationId}>确认登录密码</label>
                    <input
                      id={registrationPasswordConfirmationId}
                      name="registration-password-confirmation"
                      type="password"
                      autoComplete="new-password"
                      value={registrationPasswordConfirmation}
                      onChange={(event) =>
                        setRegistrationPasswordConfirmation(event.target.value)
                      }
                      required
                      minLength={8}
                      maxLength={128}
                      aria-describedby={feedbackId}
                    />
                  </div>
                  <Button
                    className="auth-submit"
                    type="submit"
                    size="lg"
                    loading={submitting}
                    disabled={
                      !email.trim() ||
                      (!inviteToken && code.trim().length < 6) ||
                      registrationPassword.length < 8 ||
                      registrationPassword !== registrationPasswordConfirmation
                    }
                  >
                    注册并进入创作台
                    <ArrowRight size={17} aria-hidden="true" />
                  </Button>
                </form>
              </TabsPanel>
              <TabsPanel value="otp">
                {mode === "otp" && !otpConfigured ? (
                  <div className="auth-maintenance" role="status">
                    <strong>邮箱验证码登录正在维护</strong>
                    <p>
                      安全验证尚未配置，请先使用管理员提供的访问口令。
                    </p>
                  </div>
                ) : step === "request" ? (
                  <form className="auth-form" onSubmit={handleRequestOtp}>
                    <div className="form-field">
                      <label htmlFor={`${emailId}-otp`}>已验证邮箱</label>
                      <input
                        id={`${emailId}-otp`}
                        name="email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        maxLength={320}
                        aria-describedby={`${emailId}-otp-help ${feedbackId}`}
                        placeholder="name@example.com"
                      />
                      <small id={`${emailId}-otp-help`}>
                        系统不会透露邮箱是否已注册。
                      </small>
                    </div>
                    {mode === "otp" ? (
                      <TurnstileField
                        containerRef={turnstileContainer}
                        ready={turnstileReady}
                      />
                    ) : null}
                    <Button
                      className="auth-submit"
                      type="submit"
                      size="lg"
                      loading={submitting}
                      disabled={!email.trim() || !turnstileToken}
                    >
                      发送验证码
                      <ArrowRight size={17} aria-hidden="true" />
                    </Button>
                  </form>
                ) : (
                  <form className="auth-form" onSubmit={handleVerifyOtp}>
                    <div className="form-field">
                      <label htmlFor={otpId}>验证码</label>
                      <input
                        id={otpId}
                        className="otp-input"
                        name="otp"
                        type="text"
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={otp}
                        onChange={(event) =>
                          setOtp(
                            event.target.value.replace(/\D/g, "").slice(0, 6),
                          )
                        }
                        required
                        aria-describedby={feedbackId}
                        placeholder="000000"
                      />
                    </div>
                    <Button
                      className="auth-submit"
                      type="submit"
                      size="lg"
                      loading={submitting}
                      disabled={otp.length !== 6}
                    >
                      验证并进入创作台
                      <ArrowRight size={17} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="lg"
                      onClick={() => {
                        setStep("request");
                        setOtp("");
                        setFeedback(null);
                        resetTurnstile();
                      }}
                    >
                      更换邮箱或重新发送
                    </Button>
                  </form>
                )}
              </TabsPanel>
            </Tabs>

            <div className="auth-register-switch">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMode(mode === "code" ? "password" : "code");
                  setStep("request");
                  setFeedback(null);
                }}
              >
                {mode === "code"
                  ? "返回登录"
                  : "没有账户？使用访问口令注册"}
              </Button>
            </div>

            <div
              id={feedbackId}
              className={`auth-feedback ${feedback ? `is-${feedback.tone}` : ""}`}
              aria-live="polite"
              aria-atomic="true"
            >
              {feedback?.message}
            </div>

          </CardPanel>
        </Card>
      </section>
    </main>
  );
}

function TurnstileField({
  containerRef,
  ready,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  ready: boolean;
}) {
  return (
    <>
      <div
        className="turnstile-slot"
        ref={containerRef}
        aria-label="安全验证"
        aria-busy={!ready}
      />
      <p className="turnstile-help" role="status">
        {ready ? "安全验证已载入。" : "正在载入安全验证…"}
      </p>
    </>
  );
}

async function safeJson(response: Response): Promise<{ error?: string }> {
  try {
    return (await response.json()) as { error?: string };
  } catch {
    return {};
  }
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "你的邮箱";
  return `${name.slice(0, 2)}${name.length > 2 ? "•••" : ""}@${domain}`;
}
