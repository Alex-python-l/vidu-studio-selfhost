"use client";

import { useEffect } from "react";
import { AmbientBackdrop } from "@/app/components/AmbientBackdrop";
import { Card, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/Card";

const INVITE_STORAGE_KEY = "vidu_pending_invite";

export function InviteBridge({ token }: { token: string }) {
  useEffect(() => {
    if (token) {
      window.sessionStorage.setItem(INVITE_STORAGE_KEY, token);
      window.location.replace("/login?invite=stored");
      return;
    }
    window.location.replace("/login");
  }, [token]);

  return (
    <main className="auth-shell">
      <AmbientBackdrop variant="studio" />
      <Card className="invite-bridge-card" role="status" aria-live="polite">
        <CardHeader>
          <span className="ui-button-spinner" aria-hidden="true" />
          <CardTitle>{token ? "正在安全接收邀请" : "邀请链接无效"}</CardTitle>
          <CardDescription>
            {token
              ? "即将进入邮箱验证。邀请凭证不会显示在页面内容中。"
              : "正在返回登录页，请向管理员获取新的邀请链接。"}
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
