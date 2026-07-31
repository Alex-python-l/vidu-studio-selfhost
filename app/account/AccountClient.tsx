"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { CreditCard, Key, Logout, Shield, Wallet } from "reicon-react";
import { AmbientBackdrop } from "@/app/components/AmbientBackdrop";
import { SignOutLink } from "@/app/components/SignOutLink";
import { Button } from "@/app/components/ui/Button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/app/components/ui/Card";

type AccountOverview = {
  user: {
    id: string;
    email: string;
    displayName: string;
    creditBalance: number;
    concurrencyLimit: number;
    dailyCreditLimit: number;
    passwordEnabled: boolean;
  };
  ledgerEntries: Array<{
    id: string;
    taskId: string | null;
    amount: number;
    event: string;
    note: string;
    source: string;
    createdAt: string;
  }>;
};

type Notice = { tone: "error" | "success" | "info"; message: string };

export function AccountClient({
  initialAccount,
}: {
  initialAccount: AccountOverview;
}) {
  const [account, setAccount] = useState(initialAccount);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const currentPasswordId = useId();
  const passwordId = useId();
  const confirmationId = useId();
  const noticeId = useId();

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (account.user.passwordEnabled && currentPassword.length < 8) {
      setNotice({ tone: "error", message: "请输入当前登录密码。" });
      return;
    }

    if (password.length < 8) {
      setNotice({ tone: "error", message: "请输入至少 8 个字符的登录密码。" });
      return;
    }
    if (password !== confirmation) {
      setNotice({ tone: "error", message: "两次输入的密码不一致。" });
      return;
    }

    setSaving(true);
    setNotice({ tone: "info", message: "正在保存登录密码…" });
    try {
      const response = await fetch("/api/account/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "保存密码失败，请稍后重试。");
      }
      setAccount((current) => ({
        ...current,
        user: { ...current.user, passwordEnabled: true },
      }));
      setPassword("");
      setCurrentPassword("");
      setConfirmation("");
      setNotice({ tone: "success", message: "登录密码已保存，其他设备已退出。" });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "保存密码失败，请稍后重试。",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="admin-shell account-shell">
      <AmbientBackdrop variant="studio" />
      <header className="admin-header">
        <Link className="brand-lockup" href="/studio" aria-label="返回 Vidu 创作台">
          <span className="brand-mark" aria-hidden="true">V</span>
          <span>Vidu 创作台</span>
        </Link>
        <nav aria-label="账户导航">
          <Link href="/studio">返回创作台</Link>
          <SignOutLink className="ui-button ui-button-variant--ghost ui-button-size--sm">
            <Logout size={16} aria-hidden="true" />
            退出
          </SignOutLink>
        </nav>
      </header>

      <div className="admin-content">
        <section className="admin-heading" aria-labelledby="account-title">
          <div>
            <p className="eyebrow">ACCOUNT &amp; CREDITS</p>
            <h1 id="account-title">账户与额度</h1>
            <p>
              {account.user.displayName || account.user.email} · {account.user.email}
              。在这里更新登录密码，并查看自己的额度余额与变动记录。
            </p>
          </div>
          <span className="admin-role-badge">
            <Shield size={15} aria-hidden="true" />
            个人账户
          </span>
        </section>

        <section className="admin-overview" aria-label="个人额度概览">
          <MetricCard icon={<Wallet size={18} />} label="可用额度" value={account.user.creditBalance.toLocaleString()} />
          <MetricCard icon={<CreditCard size={18} />} label="并发上限" value={`${account.user.concurrencyLimit}`} />
          <MetricCard icon={<Wallet size={18} />} label="每日额度上限" value={account.user.dailyCreditLimit.toLocaleString()} />
          <MetricCard icon={<Key size={18} />} label="登录密码" value={account.user.passwordEnabled ? "已设置" : "待设置"} />
        </section>

        <section className="admin-grid account-grid">
          <Card className="admin-action-card account-password-card">
            <CardHeader>
              <span className="admin-card-icon"><Key size={18} /></span>
              <div>
                <CardTitle>{account.user.passwordEnabled ? "修改登录密码" : "设置登录密码"}</CardTitle>
                <CardDescription>
                  密码用于后续直接登录，不会显示或以明文保存。
                </CardDescription>
              </div>
            </CardHeader>
            <CardPanel>
              <form className="admin-form" onSubmit={savePassword}>
                {account.user.passwordEnabled ? (
                  <label className="form-field" htmlFor={currentPasswordId}>
                    当前登录密码
                    <input
                      id={currentPasswordId}
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      minLength={8}
                      maxLength={128}
                      required
                      aria-describedby={noticeId}
                    />
                  </label>
                ) : null}
                <label className="form-field" htmlFor={passwordId}>
                  新登录密码
                  <input
                    id={passwordId}
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    maxLength={128}
                    required
                    aria-describedby={`${passwordId}-help ${noticeId}`}
                  />
                  <small id={`${passwordId}-help`}>长度为 8–128 个字符，区分大小写。</small>
                </label>
                <label className="form-field" htmlFor={confirmationId}>
                  确认新登录密码
                  <input
                    id={confirmationId}
                    type="password"
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    minLength={8}
                    maxLength={128}
                    required
                    aria-describedby={noticeId}
                  />
                </label>
                <Button
                  type="submit"
                  className="admin-submit"
                  loading={saving}
                  disabled={
                    (account.user.passwordEnabled && currentPassword.length < 8) ||
                    password.length < 8 ||
                    password !== confirmation
                  }
                >
                  {account.user.passwordEnabled ? "更新登录密码" : "保存登录密码"}
                </Button>
              </form>
            </CardPanel>
          </Card>

          <Card className="admin-action-card account-help-card">
            <CardHeader>
              <span className="admin-card-icon"><Shield size={18} /></span>
              <div>
                <CardTitle>账户说明</CardTitle>
                <CardDescription>额度使用与账户状态以实时任务结果为准。</CardDescription>
              </div>
            </CardHeader>
            <CardPanel>
              <div className="account-help-list">
                <p><b>访问口令</b>仅用于首次注册和领取初始额度。</p>
                <p><b>登录密码</b>可在此页随时更新，用于密码登录。</p>
                <p><b>额度账本</b>保留最近 50 条当前账户的额度变动。</p>
              </div>
            </CardPanel>
          </Card>
        </section>

        <div
          id={noticeId}
          className={`admin-notice ${notice ? `is-${notice.tone}` : ""}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {notice?.message}
        </div>

        <Card className="admin-ledger-card account-ledger-card">
          <CardHeader>
            <span className="admin-card-icon"><CreditCard size={18} /></span>
            <div>
              <CardTitle>额度明细</CardTitle>
              <CardDescription>最近 50 条额度增减记录。</CardDescription>
            </div>
          </CardHeader>
          <CardPanel className="admin-ledger-list">
            {account.ledgerEntries.length ? account.ledgerEntries.map((entry) => (
              <article className="admin-ledger-entry" key={entry.id}>
                <strong className={entry.amount >= 0 ? "is-positive" : "is-negative"}>
                  {entry.amount >= 0 ? "+" : ""}{entry.amount}
                </strong>
                <div>
                  <b>{entry.event || entry.source || "额度变动"}</b>
                  <p>{entry.note || "暂无备注"}</p>
                  {entry.taskId ? <small>任务 {entry.taskId}</small> : null}
                </div>
                <time dateTime={entry.createdAt}>{formatTime(entry.createdAt)}</time>
              </article>
            )) : (
              <div className="admin-empty">暂时没有额度记录。</div>
            )}
          </CardPanel>
        </Card>
      </div>
    </main>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card className="admin-metric">
      <CardHeader>{icon}<span>{label}</span></CardHeader>
      <CardPanel><strong>{value}</strong></CardPanel>
    </Card>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}