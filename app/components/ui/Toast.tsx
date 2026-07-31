"use client";

import type React from "react";
import { AlertTriangle, Check, CircleInfo, X } from "reicon-react";

export type ToastTone = "success" | "warning" | "error" | "info";

const labels: Record<ToastTone, string> = {
  success: "已完成",
  warning: "请注意",
  error: "操作失败",
  info: "处理中",
};

export function Toast({
  tone,
  message,
  onDismiss,
}: {
  tone: ToastTone;
  message: string;
  onDismiss: () => void;
}): React.ReactElement {
  const Icon =
    tone === "success"
      ? Check
      : tone === "warning" || tone === "error"
        ? AlertTriangle
        : CircleInfo;

  return (
    <div className="ui-toast-viewport" data-slot="toast-viewport">
      <div
        className={`ui-toast is-${tone}`}
        data-slot="toast"
        role={tone === "error" ? "alert" : "status"}
        aria-live={tone === "error" ? "assertive" : "polite"}
        aria-atomic="true"
      >
        <span className="ui-toast-icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <div className="ui-toast-content">
          <strong>{labels[tone]}</strong>
          <p>{message}</p>
        </div>
        <button
          type="button"
          className="ui-toast-dismiss"
          onClick={onDismiss}
          aria-label="关闭提示"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
