"use client";

import Link from "next/link";
import {
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Activity,
  ChartBar,
  Check,
  Coins,
  Copy,
  CreditCard,
  Edit,
  History,
  Key,
  Logout,
  Pause,
  Plus,
  Refresh,
  Search,
  Settings,
  Shield,
  Trash,
  UserAdd,
  Users,
} from "reicon-react";
import { AmbientBackdrop } from "@/app/components/AmbientBackdrop";
import { ProviderUsageChart } from "@/app/admin/ProviderUsageChart";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/app/components/ui/AlertDialog";
import { Button } from "@/app/components/ui/Button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/app/components/ui/Card";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/app/components/ui/Dialog";
import { Switch } from "@/app/components/ui/Switch";
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/app/components/ui/Progress";
import { Toast } from "@/app/components/ui/Toast";
import { SignOutLink } from "@/app/components/SignOutLink";
import type {
  AdminAuditEntry,
  AdminInvitationResult,
  AdminInvitationSummary,
  AdminLedgerEntry,
  AdminUserSummary,
  AppUserProfile,
  ProviderKeyAvailability,
  ProviderKeyStatus,
  ProviderKeyKind,
  ProviderKeyOption,
  ProviderQuotaSnapshot,
  ProviderUsagePoint,
  UserRole,
  UserStatus,
} from "@/lib/account-contracts";

type UsersResponse = {
  users: AdminUserSummary[];
  nextCursor?: string | null;
};

type AuditResponse = {
  entries: AdminAuditEntry[];
  ledgerEntries?: AdminLedgerEntry[];
  nextAuditCursor?: string | null;
  nextLedgerCursor?: string | null;
};

type InvitationsResponse = {
  invitations: AdminInvitationSummary[];
};

type ProviderKeysResponse = {
  providers: ProviderKeyStatus[];
  quotas: ProviderQuotaSnapshot[];
  usage: ProviderUsagePoint[];
};

type ProviderKeyDraft = {
  provider: ProviderKeyKind;
  label: string;
  apiKey: string;
};

type ProviderKeyDeleteTarget = {
  provider: ProviderKeyKind;
  providerLabel: string;
  option: ProviderKeyOption;
};

type Notice = {
  tone: "success" | "warning" | "error" | "info";
  message: string;
};

type EditableUser = {
  role: UserRole;
  status: UserStatus;
  concurrencyLimit: string;
  dailyCreditLimit: string;
};

type EditableInvitation = {
  email: string;
  initialCredits: string;
  initialConcurrencyLimit: string;
  initialDailyCreditLimit: string;
  maxUses: string;
  expiresAt: string;
  allowEmailLink: boolean;
  allowManualCode: boolean;
  revoked: boolean;
};

export function AdminClient({ viewer }: { viewer: AppUserProfile }) {
  const canWrite = viewer.role === "admin";
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [invitations, setInvitations] = useState<AdminInvitationSummary[]>([]);
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<AdminLedgerEntry[]>([]);
  const [auditPage, setAuditPage] = useState(0);
  const [auditPageCursors, setAuditPageCursors] = useState<string[]>([""]);
  const [nextAuditCursor, setNextAuditCursor] = useState<string | null>(null);
  const [ledgerPage, setLedgerPage] = useState(0);
  const [ledgerPageCursors, setLedgerPageCursors] = useState<string[]>([""]);
  const [nextLedgerCursor, setNextLedgerCursor] = useState<string | null>(null);
  const [nextUserCursor, setNextUserCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [providerKeys, setProviderKeys] = useState<ProviderKeyStatus[]>([]);
  const [providerQuotas, setProviderQuotas] = useState<
    ProviderQuotaSnapshot[]
  >([]);
  const [providerUsage, setProviderUsage] = useState<ProviderUsagePoint[]>([]);
  const [loadingProviderKeys, setLoadingProviderKeys] = useState(true);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [providerKeyDraft, setProviderKeyDraft] =
    useState<ProviderKeyDraft | null>(null);
  const [providerKeyBusy, setProviderKeyBusy] = useState(false);
  const [deleteProviderKeyTarget, setDeleteProviderKeyTarget] =
    useState<ProviderKeyDeleteTarget | null>(null);
  const [editing, setEditing] = useState<Record<string, EditableUser>>({});
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(
    null,
  );
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AdminUserSummary | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] =
    useState<AdminUserSummary | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [removePasswordTarget, setRemovePasswordTarget] =
    useState<AdminUserSummary | null>(null);
  const [inviteResult, setInviteResult] =
    useState<AdminInvitationResult | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [invitationBusyId, setInvitationBusyId] = useState<string | null>(null);
  const [selectedInvitation, setSelectedInvitation] =
    useState<AdminInvitationSummary | null>(null);
  const [invitationEditor, setInvitationEditor] =
    useState<EditableInvitation | null>(null);
  const [deleteInvitationTarget, setDeleteInvitationTarget] =
    useState<AdminInvitationSummary | null>(null);
  const [invitationQuery, setInvitationQuery] = useState("");
  const [invitationStatus, setInvitationStatus] = useState<
    "all" | "active" | "paused" | "expired" | "exhausted"
  >("all");
  const [creditBusy, setCreditBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [allowEmailLink, setAllowEmailLink] = useState(true);
  const [allowManualCode, setAllowManualCode] = useState(true);
  const [ledgerQuery, setLedgerQuery] = useState("");
  const [ledgerDirection, setLedgerDirection] = useState<
    "all" | "credit" | "debit"
  >("all");

  const loadUsers = useCallback(
    async ({
      cursor,
      append = false,
      search = "",
    }: {
      cursor?: string;
      append?: boolean;
      search?: string;
    } = {}) => {
      setLoadingUsers(true);
      try {
        const params = new URLSearchParams();
        if (search) params.set("query", search);
        if (cursor) params.set("cursor", cursor);
        const response = await apiFetch<UsersResponse>(
          `/api/admin/users?${params}`,
        );
        setUsers((current) =>
          append ? mergeUsers(current, response.users) : response.users,
        );
        setNextUserCursor(response.nextCursor ?? null);
        setEditing((current) => {
          const next = { ...current };
          for (const user of response.users) {
            next[user.id] = editableUser(user);
          }
          return next;
        });
      } catch (error) {
        setNotice({ tone: "error", message: messageFrom(error) });
      } finally {
        setLoadingUsers(false);
      }
    },
    [],
  );

  const loadAudit = useCallback(
    async (cursors?: { auditCursor?: string; ledgerCursor?: string }) => {
      setLoadingAudit(true);
      try {
        const params = new URLSearchParams();
        if (cursors?.auditCursor) {
          params.set("auditCursor", cursors.auditCursor);
        }
        if (cursors?.ledgerCursor) {
          params.set("ledgerCursor", cursors.ledgerCursor);
        }
        const response = await apiFetch<AuditResponse>(
          `/api/admin/audit?${params}`,
        );
        setAuditEntries(response.entries);
        setLedgerEntries(response.ledgerEntries ?? []);
        setNextAuditCursor(response.nextAuditCursor ?? null);
        setNextLedgerCursor(response.nextLedgerCursor ?? null);
        if (!cursors) {
          setAuditPage(0);
          setAuditPageCursors([""]);
          setLedgerPage(0);
          setLedgerPageCursors([""]);
        }
        return true;
      } catch (error) {
        setNotice({ tone: "error", message: messageFrom(error) });
        return false;
      } finally {
        setLoadingAudit(false);
      }
    },
    [],
  );

  const loadInvitations = useCallback(async () => {
    setLoadingInvitations(true);
    try {
      const response = await apiFetch<InvitationsResponse>(
        "/api/admin/invitations",
      );
      setInvitations(response.invitations);
    } catch (error) {
      setNotice({ tone: "error", message: messageFrom(error) });
    } finally {
      setLoadingInvitations(false);
    }
  }, []);

  const loadProviderKeys = useCallback(async () => {
    setLoadingProviderKeys(true);
    try {
      const response = await apiFetch<ProviderKeysResponse>(
        "/api/admin/provider-keys",
      );
      setProviderKeys(response.providers);
      setProviderQuotas(response.quotas);
      setProviderUsage(response.usage);
    } catch (error) {
      setNotice({ tone: "error", message: messageFrom(error) });
    } finally {
      setLoadingProviderKeys(false);
    }
  }, []);

  useEffect(() => {
    if (!notice || notice.tone === "info") return;
    const timeout = window.setTimeout(
      () => setNotice(null),
      notice.tone === "success" ? 4_500 : 7_000,
    );
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadUsers();
      void loadAudit();
      void loadInvitations();
      void loadProviderKeys();
    });
  }, [loadAudit, loadInvitations, loadProviderKeys, loadUsers]);

  const overview = useMemo(
    () => ({
      visible: users.length,
      active: users.filter((user) => user.status === "active").length,
      suspended: users.filter((user) => user.status === "suspended").length,
      activeTasks: users.reduce((sum, user) => sum + user.activeTaskCount, 0),
    }),
    [users],
  );
  const filteredLedgerEntries = useMemo(() => {
    const normalizedQuery = ledgerQuery.trim().toLowerCase();
    return ledgerEntries.filter((entry) => {
      if (ledgerDirection === "credit" && entry.amount < 0) return false;
      if (ledgerDirection === "debit" && entry.amount >= 0) return false;
      if (!normalizedQuery) return true;
      const user = users.find((candidate) => candidate.id === entry.userId);
      return [
        entry.userId,
        user?.email,
        user?.displayName,
        entry.event,
        entry.source,
        entry.note,
        entry.taskId,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [ledgerDirection, ledgerEntries, ledgerQuery, users]);
  const currentAuditCursor = auditPageCursors[auditPage] ?? "";
  const currentLedgerCursor = ledgerPageCursors[ledgerPage] ?? "";

  async function changeActivityPage(
    section: "audit" | "ledger",
    direction: "previous" | "next",
  ) {
    const page = section === "audit" ? auditPage : ledgerPage;
    const cursors =
      section === "audit" ? auditPageCursors : ledgerPageCursors;
    const nextCursor =
      section === "audit" ? nextAuditCursor : nextLedgerCursor;
    const targetPage = direction === "next" ? page + 1 : page - 1;
    if (targetPage < 0 || (direction === "next" && !nextCursor)) return;
    const targetCursor =
      direction === "next" ? (nextCursor ?? "") : (cursors[targetPage] ?? "");
    const loaded = await loadAudit({
      auditCursor:
        section === "audit" ? targetCursor : currentAuditCursor,
      ledgerCursor:
        section === "ledger" ? targetCursor : currentLedgerCursor,
    });
    if (!loaded) return;

    if (direction === "next") {
      const rememberCursor = (current: string[]) => {
        const next = current.slice(0, targetPage);
        next[targetPage] = targetCursor;
        return next;
      };
      if (section === "audit") setAuditPageCursors(rememberCursor);
      else setLedgerPageCursors(rememberCursor);
    }
    if (section === "audit") setAuditPage(targetPage);
    else setLedgerPage(targetPage);
  }

  const filteredInvitations = useMemo(() => {
    const normalizedQuery = invitationQuery.trim().toLowerCase();
    return invitations.filter((invitation) => {
      const status = invitationState(invitation);
      if (invitationStatus !== "all" && status !== invitationStatus) {
        return false;
      }
      if (!normalizedQuery) return true;
      return [invitation.codeHint, invitation.email, invitation.id].some(
        (value) => value.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [invitationQuery, invitationStatus, invitations]);

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setInviteBusy(true);
    setInviteResult(null);
    setNotice({ tone: "info", message: "正在创建访问口令…" });
    try {
      const response = await apiFetch<{
        invitation: AdminInvitationResult;
      }>("/api/admin/invitations", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          code: form.get("code"),
          initialCredits: Number(form.get("initialCredits")),
          initialConcurrencyLimit: Number(form.get("initialConcurrencyLimit")),
          initialDailyCreditLimit: Number(form.get("initialDailyCreditLimit")),
          expiresInDays: Number(form.get("expiresInDays")),
          maxUses: Number(form.get("maxUses")),
          allowEmailLink,
          allowManualCode,
        }),
      });
      setInviteResult(response.invitation);
      setNotice({
        tone: "success",
        message: "访问口令已创建。口令和链接只显示这一次，请立即安全保存。",
      });
      formElement.reset();
      setAllowEmailLink(true);
      setAllowManualCode(true);
      await loadInvitations();
    } catch (error) {
      setNotice({ tone: "error", message: messageFrom(error) });
    } finally {
      setInviteBusy(false);
    }
  }

  async function saveInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || !selectedInvitation || !invitationEditor) return;
    if (
      !invitationEditor.allowEmailLink &&
      !invitationEditor.allowManualCode
    ) {
      setNotice({
        tone: "error",
        message: "邮箱链接和手动口令至少启用一种。",
      });
      return;
    }
    if (
      Number(invitationEditor.maxUses) < selectedInvitation.useCount
    ) {
      setNotice({
        tone: "error",
        message: `可用次数不能小于已使用次数 ${selectedInvitation.useCount}。`,
      });
      return;
    }
    const expiresAt = new Date(invitationEditor.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      setNotice({ tone: "error", message: "请输入有效的口令到期时间。" });
      return;
    }

    setInvitationBusyId(selectedInvitation.id);
    setNotice({ tone: "info", message: "正在保存访问口令配置…" });
    try {
      const response = await apiFetch<{
        invitation: AdminInvitationSummary;
      }>(
        `/api/admin/invitations/${encodeURIComponent(selectedInvitation.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            email: invitationEditor.email,
            initialCredits: Number(invitationEditor.initialCredits),
            initialConcurrencyLimit: Number(
              invitationEditor.initialConcurrencyLimit,
            ),
            initialDailyCreditLimit: Number(
              invitationEditor.initialDailyCreditLimit,
            ),
            maxUses: Number(invitationEditor.maxUses),
            expiresAt: expiresAt.toISOString(),
            allowEmailLink: invitationEditor.allowEmailLink,
            allowManualCode: invitationEditor.allowManualCode,
            revoked: invitationEditor.revoked,
          }),
        },
      );
      setInvitations((current) =>
        current.map((invitation) =>
          invitation.id === response.invitation.id
            ? response.invitation
            : invitation,
        ),
      );
      setSelectedInvitation(response.invitation);
      setInvitationEditor(editableInvitation(response.invitation));
      setNotice({ tone: "success", message: "访问口令配置已更新。" });
      await loadAudit();
    } catch (error) {
      setNotice({ tone: "error", message: messageFrom(error) });
    } finally {
      setInvitationBusyId(null);
    }
  }

  async function deleteInvitation() {
    if (!canWrite || !deleteInvitationTarget) return;
    const target = deleteInvitationTarget;
    setInvitationBusyId(target.id);
    setNotice({ tone: "info", message: "正在删除访问口令…" });
    try {
      await apiFetch(
        `/api/admin/invitations/${encodeURIComponent(target.id)}`,
        { method: "DELETE" },
      );
      setInvitations((current) =>
        current.filter((invitation) => invitation.id !== target.id),
      );
      if (selectedInvitation?.id === target.id) {
        setSelectedInvitation(null);
        setInvitationEditor(null);
      }
      setNotice({
        tone: "success",
        message: "访问口令已删除并立即失效，历史额度与审计记录已保留。",
      });
      await loadAudit();
    } catch (error) {
      setNotice({ tone: "error", message: messageFrom(error) });
    } finally {
      setInvitationBusyId(null);
      setDeleteInvitationTarget(null);
    }
  }

  async function handleCredit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const target = selectedUser;
    if (!target) {
      setNotice({ tone: "error", message: "请先从用户列表选择用户。" });
      return;
    }
    setCreditBusy(true);
    setNotice({ tone: "info", message: "正在写入额度账本…" });
    try {
      await apiFetch("/api/admin/credit-adjustments", {
        method: "POST",
        body: JSON.stringify({
          userId: target.id,
          amount: Number(form.get("amount")),
          reason: form.get("reason"),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setNotice({ tone: "success", message: "额度调整已写入账本。" });
      formElement.reset();
      await Promise.all([
        loadUsers({ search: submittedQuery }),
        loadAudit(),
      ]);
      setSelectedUser(null);
    } catch (error) {
      setNotice({ tone: "error", message: messageFrom(error) });
    } finally {
      setCreditBusy(false);
    }
  }

  async function saveProviderKey(provider: ProviderKeyStatus) {
    if (!canWrite || !provider.selectedKeyId) return;
    setSavingProvider(provider.provider);
    setNotice({
      tone: "info",
      message: `正在切换 ${provider.label} 活跃 Key…`,
    });
    try {
      const response = await apiFetch<{
        provider: ProviderKeyStatus;
        validation: ProviderKeyAvailability;
      }>(
        "/api/admin/provider-keys",
        {
          method: "PATCH",
          body: JSON.stringify({
            provider: provider.provider,
            activeKeyId: provider.selectedKeyId,
          }),
        },
      );
      setProviderKeys((current) =>
        current.map((item) =>
          item.provider === response.provider.provider
            ? response.provider
            : item,
        ),
      );
      setNotice(
        providerKeyNotice(
          `${provider.label} 活跃 Key 已切换`,
          response.validation,
        ),
      );
      void loadProviderKeys();
      await loadAudit();
    } catch (error) {
      setNotice({ tone: "error", message: messageFrom(error) });
    } finally {
      setSavingProvider(null);
    }
  }

  async function createProviderKey(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!canWrite || !providerKeyDraft) return;
    const draft = providerKeyDraft;
    setProviderKeyBusy(true);
    setNotice({
      tone: "info",
      message: `正在安全保存 ${draft.label}…`,
    });
    try {
      const response = await apiFetch<{
        provider: ProviderKeyStatus;
        validation: ProviderKeyAvailability;
      }>(
        "/api/admin/provider-keys",
        {
          method: "POST",
          body: JSON.stringify({
            provider: draft.provider,
            label: draft.label,
            apiKey: draft.apiKey,
          }),
        },
      );
      setProviderKeys((current) =>
        current.map((item) =>
          item.provider === response.provider.provider
            ? response.provider
            : item,
        ),
      );
      setProviderKeyDraft(null);
      setNotice(
        providerKeyNotice(
          `${response.provider.label} Key 已加密保存并设为活跃`,
          response.validation,
        ),
      );
      void loadProviderKeys();
      await loadAudit();
    } catch (error) {
      setNotice({ tone: "error", message: messageFrom(error) });
    } finally {
      setProviderKeyBusy(false);
    }
  }

  async function deleteProviderKey() {
    if (!canWrite || !deleteProviderKeyTarget) return;
    const target = deleteProviderKeyTarget;
    setProviderKeyBusy(true);
    setNotice({
      tone: "info",
      message: `正在删除 ${target.option.label}…`,
    });
    try {
      const response = await apiFetch<{ provider: ProviderKeyStatus }>(
        "/api/admin/provider-keys",
        {
          method: "DELETE",
          body: JSON.stringify({
            provider: target.provider,
            keyId: target.option.id,
          }),
        },
      );
      setProviderKeys((current) =>
        current.map((item) =>
          item.provider === response.provider.provider
            ? response.provider
            : item,
        ),
      );
      setNotice({
        tone: "success",
        message: `${target.providerLabel} Key ${target.option.label} 已删除。`,
      });
      await loadAudit();
    } catch (error) {
      setNotice({ tone: "error", message: messageFrom(error) });
    } finally {
      setProviderKeyBusy(false);
      setDeleteProviderKeyTarget(null);
    }
  }

  async function saveUser(user: AdminUserSummary) {
    if (!canWrite) return;
    const value = editing[user.id];
    if (!value) return;
    setSavingUserId(user.id);
    setNotice({ tone: "info", message: `正在保存 ${user.email}…` });
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          role: value.role,
          status: value.status,
          concurrencyLimit: Number(value.concurrencyLimit),
          dailyCreditLimit: Number(value.dailyCreditLimit),
        }),
      });
      setNotice({ tone: "success", message: `${user.email} 已更新。` });
      await Promise.all([
        loadUsers({ search: submittedQuery }),
        loadAudit(),
      ]);
      setSelectedUser(null);
    } catch (error) {
      setNotice({ tone: "error", message: messageFrom(error) });
    } finally {
      setSavingUserId(null);
    }
  }

  async function deleteUser() {
    if (!canWrite || !deleteUserTarget) return;
    const target = deleteUserTarget;
    setSavingUserId(target.id);
    setNotice({ tone: "info", message: `正在删除 ${target.email}…` });
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(target.id)}`, {
        method: "DELETE",
      });
      setUsers((current) => current.filter((user) => user.id !== target.id));
      setEditing((current) => {
        const next = { ...current };
        delete next[target.id];
        return next;
      });
      setNotice({
        tone: "success",
        message: `${target.email} 已删除；历史任务、额度、媒体和审计记录已保留。`,
      });
      await loadAudit();
    } catch (error) {
      setNotice({ tone: "error", message: messageFrom(error) });
    } finally {
      setSavingUserId(null);
      setDeleteUserTarget(null);
    }
  }
  async function revokeSessions() {
    if (!canWrite || !revokeTarget) return;
    const target = revokeTarget;
    setSavingUserId(target.id);
    setNotice({ tone: "info", message: `正在撤销 ${target.email} 的会话…` });
    try {
      const response = await apiFetch<{ revokedSessions: number }>(
        `/api/admin/users/${encodeURIComponent(target.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ revokeSessions: true }),
        },
      );
      setNotice({
        tone: "success",
        message: `已撤销 ${response.revokedSessions} 个活跃会话。`,
      });
      await loadAudit();
    } catch (error) {
      setNotice({ tone: "error", message: messageFrom(error) });
    } finally {
      setSavingUserId(null);
      setRevokeTarget(null);
    }
  }

async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || !selectedUser) return;
    if (passwordDraft !== passwordConfirmation) {
      setNotice({ tone: "error", message: "两次输入的密码不一致。" });
      return;
    }
    setPasswordBusy(true);
    setNotice({ tone: "info", message: `正在保存 ${selectedUser.email} 的登录密码…` });
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/password`, {
        method: "PUT",
        body: JSON.stringify({ password: passwordDraft }),
      });
      setUsers((current) => current.map((user) =>
        user.id === selectedUser.id ? { ...user, passwordEnabled: true } : user,
      ));
      setSelectedUser((current) =>
        current ? { ...current, passwordEnabled: true } : current,
      );
      setPasswordDraft("");
      setPasswordConfirmation("");
      setNotice({ tone: "success", message: "登录密码已保存，该用户的现有会话已撤销。" });
      await loadAudit();
    } catch (error) {
      setNotice({ tone: "error", message: messageFrom(error) });
    } finally {
      setPasswordBusy(false);
    }
  }

  async function removePassword() {
    if (!canWrite || !removePasswordTarget) return;
    const target = removePasswordTarget;
    setPasswordBusy(true);
    setNotice({ tone: "info", message: `正在移除 ${target.email} 的登录密码…` });
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(target.id)}/password`, {
        method: "DELETE",
      });
      setUsers((current) => current.map((user) =>
        user.id === target.id ? { ...user, passwordEnabled: false } : user,
      ));
      setSelectedUser((current) =>
        current?.id === target.id ? { ...current, passwordEnabled: false } : current,
      );
      setNotice({ tone: "success", message: "登录密码已移除。" });
      await loadAudit();
    } catch (error) {
      setNotice({ tone: "error", message: messageFrom(error) });
    } finally {
      setPasswordBusy(false);
      setRemovePasswordTarget(null);
    }
  }
  return (
    <main className="admin-shell">
      <AmbientBackdrop variant="studio" />
      <header className="admin-header">
        <Link className="brand-lockup" href="/" aria-label="返回 Vidu 首页">
          <span className="brand-mark" aria-hidden="true">V</span>
          <span>Vidu 管理后台</span>
        </Link>
        <nav aria-label="管理后台导航">
          <Link href="/studio">返回创作台</Link>
          <SignOutLink className="ui-button ui-button-variant--ghost ui-button-size--sm">
            <Logout size={16} aria-hidden="true" />
            退出
          </SignOutLink>
        </nav>
      </header>

      <div className="admin-content">
        <section className="admin-heading" aria-labelledby="admin-title">
          <div>
            <p className="eyebrow">ACCESS &amp; CREDITS</p>
            <h1 id="admin-title">运营管理</h1>
            <p>
              管理服务 Key、邀请、管理员角色、账号状态与额度审计。录入的 Key 只在服务端解密使用且不会回显。
            </p>
          </div>
          <span className={`admin-role-badge is-${viewer.role}`}>
            <Shield size={15} aria-hidden="true" />
            {viewer.role === "admin" ? "管理员" : "支持人员 · 只读"}
          </span>
        </section>

        {!canWrite ? (
          <div className="admin-readonly-note" role="note">
            当前为支持人员只读模式。你可以查看 Key 状态、搜索用户和审计，但不能录入或切换 Key、分配角色或修改账号。
          </div>
        ) : null}

        {notice ? (
          <Toast
            key={`${notice.tone}:${notice.message}`}
            tone={notice.tone}
            message={notice.message}
            onDismiss={() => setNotice(null)}
          />
        ) : null}

        <section className="admin-overview" aria-label="当前结果概览">
          <MetricCard icon={<Users size={18} />} label="当前结果" value={overview.visible} />
          <MetricCard icon={<Check size={18} />} label="活跃账号" value={overview.active} />
          <MetricCard icon={<Shield size={18} />} label="已暂停" value={overview.suspended} />
          <MetricCard icon={<Activity size={18} />} label="运行任务" value={overview.activeTasks} />
        </section>

        <Card className="admin-action-card admin-provider-card">
          <CardHeader>
            <span className="admin-card-icon"><Key size={18} /></span>
            <div>
              <CardTitle>服务 Key</CardTitle>
              <CardDescription>
                可使用环境 secrets，也可由管理员安全录入；录入值加密保存且不会回显。
              </CardDescription>
            </div>
            <div className="admin-provider-header-actions">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  !canWrite ||
                  !providerKeys.some((provider) => provider.managedStorageReady)
                }
                onClick={() => {
                  const provider = providerKeys.find(
                    (item) => item.managedStorageReady,
                  );
                  if (provider) {
                    setProviderKeyDraft({
                      provider: provider.provider,
                      label: "",
                      apiKey: "",
                    });
                  }
                }}
              >
                <Plus size={16} aria-hidden="true" />
                添加 Key
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={loadingProviderKeys}
                onClick={() => void loadProviderKeys()}
              >
                <Refresh size={16} aria-hidden="true" />
                刷新
              </Button>
            </div>
          </CardHeader>
          <CardPanel
            className="admin-provider-grid"
            aria-busy={loadingProviderKeys}
          >
            {loadingProviderKeys && providerKeys.length === 0 ? (
              <AdminEmpty
                icon={<Refresh size={20} />}
                title="正在读取 Key 配置"
                description="正在核对环境 Key 与管理员录入的加密 Key。"
              />
            ) : (
              providerKeys.map((provider) => {
                const selectedOption = provider.options.find(
                  (option) => option.id === provider.selectedKeyId,
                );
                const selectedExists = Boolean(selectedOption);
                const selectedManagedUnavailable = Boolean(
                  selectedOption?.source === "managed" &&
                    !provider.managedStorageReady,
                );
                return (
                  <article className="admin-provider-item" key={provider.provider}>
                    <div className="admin-provider-heading">
                      <div>
                        <strong>{provider.label}</strong>
                        <span
                          className={`admin-provider-status ${
                            provider.configured ? "is-ready" : "is-missing"
                          }`}
                        >
                          {provider.missingSelectedKey
                            ? "已选 Key 不存在"
                            : selectedManagedUnavailable
                              ? "加密配置缺失"
                              : provider.configured
                                ? `活跃 · ${selectedOption?.label ?? provider.activeKeyId}`
                                : "尚未配置"}
                        </span>
                      </div>
                      <p>
                        {provider.options.length} 个可用 Key
                        {provider.updatedAt
                          ? ` · 上次切换 ${formatDate(provider.updatedAt)}`
                          : " · 当前使用默认选择"}
                      </p>
                      {!provider.managedStorageReady ? (
                        <p className="admin-provider-warning" role="note">
                          管理员录入暂未启用，仍可继续使用已有环境 Key。
                        </p>
                      ) : null}
                    </div>
                    <div className="admin-provider-controls">
                      <FormField
                        label="活跃 Key"
                        name={`provider-key-${provider.provider}`}
                      >
                        <select
                          value={provider.selectedKeyId ?? ""}
                          disabled={!canWrite || provider.options.length === 0}
                          onChange={(event) =>
                            setProviderKeys((current) =>
                              current.map((item) =>
                                item.provider === provider.provider
                                  ? {
                                      ...item,
                                      selectedKeyId: event.target.value,
                                      missingSelectedKey: false,
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          {provider.missingSelectedKey && provider.selectedKeyId ? (
                            <option value={provider.selectedKeyId} disabled>
                              {provider.selectedKeyId}（已不存在）
                            </option>
                          ) : null}
                          {provider.options.length === 0 ? (
                            <option value="">请添加 Key 或配置环境 secret</option>
                          ) : null}
                          {provider.options.map((option) => (
                            <option value={option.id} key={option.id}>
                              {option.source === "managed"
                                ? `${option.label} · ${option.hint}`
                                : `${option.label} · 环境变量`}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <div className="admin-provider-control-actions">
                        <Button
                          type="button"
                          variant="secondary"
                          loading={savingProvider === provider.provider}
                          disabled={
                            !canWrite ||
                            !provider.selectedKeyId ||
                            !selectedExists ||
                            selectedManagedUnavailable
                          }
                          onClick={() => void saveProviderKey(provider)}
                        >
                          设为活跃 Key
                        </Button>
                        {selectedOption?.source === "managed" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={
                              !canWrite ||
                              providerKeyBusy ||
                              selectedOption.id === provider.activeKeyId
                            }
                            onClick={() =>
                              setDeleteProviderKeyTarget({
                                provider: provider.provider,
                                providerLabel: provider.label,
                                option: selectedOption,
                              })
                            }
                          >
                            <Trash size={16} aria-hidden="true" />
                            删除
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </CardPanel>
        </Card>

        <Card className="admin-action-card admin-provider-insights-card">
          <CardHeader>
            <span className="admin-card-icon"><ChartBar size={18} /></span>
            <div>
              <CardTitle>活跃 Key 额度与消耗</CardTitle>
              <CardDescription>
                Vidu 显示服务端实时额度与并发；Gemini 配额归属 Google Cloud 项目，本站展示可用性与本地分析尝试。
              </CardDescription>
            </div>
          </CardHeader>
          <CardPanel className="admin-provider-insights">
            <div className="admin-quota-grid">
              {(["vidu", "gemini"] as const).map((provider) => {
                const quota = providerQuotas.find(
                  (item) => item.provider === provider,
                );
                const requests = providerUsage.reduce(
                  (sum, point) => sum + point.geminiRequests,
                  0,
                );
                return (
                  <article className="admin-quota-card" key={provider}>
                    <div className="admin-quota-heading">
                      <span className="admin-quota-icon" aria-hidden="true">
                        {provider === "vidu" ? (
                          <Coins size={18} />
                        ) : (
                          <Activity size={18} />
                        )}
                      </span>
                      <div>
                        <strong>{provider === "vidu" ? "Vidu" : "Gemini"}</strong>
                        <span
                          className={`admin-quota-state is-${
                            quota?.status ?? "unknown"
                          }`}
                        >
                          {quotaStatusLabel(quota?.status)}
                        </span>
                      </div>
                    </div>
                    <div className="admin-quota-value">
                      <strong>
                        {provider === "vidu"
                          ? formatQuotaValue(quota?.remainingCredits)
                          : `${requests} 次`}
                      </strong>
                      <span>
                        {provider === "vidu"
                          ? "当前剩余 credits"
                          : "最近 7 天本站分析尝试"}
                      </span>
                    </div>
                    {provider === "vidu" &&
                    quota?.concurrencyLimit !== null &&
                    quota?.concurrencyLimit !== undefined ? (
                      <div className="admin-quota-concurrency">
                        <div>
                          <span>并发占用</span>
                          <strong>
                            {quota.currentConcurrency ?? 0} /{" "}
                            {quota.concurrencyLimit}
                          </strong>
                        </div>
                        <Progress
                          value={quota.currentConcurrency ?? 0}
                          max={Math.max(quota.concurrencyLimit, 1)}
                          aria-label={`Vidu 并发占用 ${quota.currentConcurrency ?? 0} / ${quota.concurrencyLimit}`}
                        >
                          <ProgressTrack>
                            <ProgressIndicator />
                          </ProgressTrack>
                        </Progress>
                        <span>排队 {quota.queueCount ?? 0} 个任务</span>
                      </div>
                    ) : null}
                    <p>{quota?.message ?? "正在读取活跃 Key 状态。"}</p>
                    {quota?.checkedAt ? (
                      <time dateTime={quota.checkedAt}>
                        同步于 {formatDate(quota.checkedAt)}
                      </time>
                    ) : null}
                  </article>
                );
              })}
            </div>

            <div className="admin-usage-grid">
              <ProviderUsageChart
                title="Vidu credits 消耗"
                description="按任务终态返回的实际 credits 统计"
                points={providerUsage}
                valueKey="viduCredits"
                unit="credits"
              />
              <ProviderUsageChart
                title="Gemini 分析尝试"
                description="按本站实际发起的分析尝试次数统计"
                points={providerUsage}
                valueKey="geminiRequests"
                unit="次"
              />
            </div>
          </CardPanel>
        </Card>

        <section className="admin-grid admin-access-grid">
          <Card className="admin-action-card admin-access-card admin-create-code-card">
            <CardHeader>
              <span className="admin-card-icon"><UserAdd size={18} /></span>
              <div>
                <CardTitle>创建访问口令</CardTitle>
                <CardDescription>统一配置兑换方式，以及新用户的初始额度、并发、日额度、可用次数和有效期。</CardDescription>
              </div>
            </CardHeader>
            <CardPanel>
              <form className="admin-form" onSubmit={handleInvite}>
                <div className="admin-invite-fields">
                  <FormField label="访问口令" name="code">
                    <input
                      name="code"
                      type="text"
                      autoComplete="off"
                      minLength={6}
                      maxLength={64}
                      pattern="[A-Za-z0-9][A-Za-z0-9_-]{5,63}"
                      placeholder="例如 VIDU-START"
                      required
                      disabled={!canWrite}
                    />
                  </FormField>
                  <FormField label="绑定邮箱（邮箱链接启用时必填）" name="email">
                    <input
                      name="email"
                      type="email"
                      autoComplete="off"
                      maxLength={320}
                      placeholder="name@example.com"
                      required={allowEmailLink}
                      disabled={!canWrite}
                    />
                  </FormField>
                  <FormField label="初始 credits" name="initialCredits">
                    <input name="initialCredits" type="number" min="0" max="1000000" step="1" defaultValue="0" required disabled={!canWrite} />
                  </FormField>
                  <FormField label="初始并发数" name="initialConcurrencyLimit">
                    <input name="initialConcurrencyLimit" type="number" min="1" max="20" step="1" defaultValue="1" required disabled={!canWrite} />
                  </FormField>
                  <FormField label="每日额度上限" name="initialDailyCreditLimit">
                    <input name="initialDailyCreditLimit" type="number" min="0" max="1000000" step="1" defaultValue="500" required disabled={!canWrite} />
                  </FormField>
                  <FormField label="可用次数" name="maxUses">
                    <input name="maxUses" type="number" min="1" max="10000" step="1" defaultValue="1" required disabled={!canWrite} />
                  </FormField>
                  <FormField label="有效天数" name="expiresInDays">
                    <input name="expiresInDays" type="number" min="1" max="365" step="1" defaultValue="7" required disabled={!canWrite} />
                  </FormField>
                </div>
                <fieldset className="admin-channel-options">
                  <legend>使用方式</legend>
                  <label>
                    <span>
                      <strong>邮箱专属链接</strong>
                      <small>生成绑定邮箱的邀请链接</small>
                    </span>
                    <Switch
                      checked={allowEmailLink}
                      onCheckedChange={setAllowEmailLink}
                      disabled={!canWrite}
                      aria-label="允许邮箱专属链接"
                    />
                  </label>
                  <label>
                    <span>
                      <strong>手动输入口令</strong>
                      <small>允许用户在登录页输入同一口令</small>
                    </span>
                    <Switch
                      checked={allowManualCode}
                      onCheckedChange={setAllowManualCode}
                      disabled={!canWrite}
                      aria-label="允许手动输入口令"
                    />
                  </label>
                  {!allowEmailLink && !allowManualCode ? (
                    <small className="admin-field-error">至少启用一种使用方式。</small>
                  ) : null}
                </fieldset>
                <Button type="submit" loading={inviteBusy} disabled={!canWrite} className="admin-submit">
                  <Plus size={17} aria-hidden="true" />
                  创建访问口令
                </Button>
              </form>
              {inviteResult ? (
                <div className="invite-result" role="status">
                  <strong>请立即复制并安全保存</strong>
                  <div className="invite-result-line">
                    <span>口令</span>
                    <code>{inviteResult.code}</code>
                  </div>
                  {inviteResult.inviteUrl ? (
                    <div className="invite-result-line">
                      <span>邮箱链接</span>
                      <code>{inviteResult.inviteUrl}</code>
                    </div>
                  ) : null}
                  <small>
                    每次首次兑换发放 {inviteResult.initialCredits} credits · 并发 {inviteResult.initialConcurrencyLimit} · 日额度 {inviteResult.initialDailyCreditLimit} · 最多 {inviteResult.maxUses} 次
                  </small>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          [
                            `访问口令：${inviteResult.code}`,
                            inviteResult.inviteUrl
                              ? `邮箱链接：${inviteResult.inviteUrl}`
                              : "",
                          ]
                            .filter(Boolean)
                            .join("\n"),
                        );
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1800);
                      } catch {
                        setNotice({
                          tone: "error",
                          message: "无法访问剪贴板，请手动选择并复制邀请链接。",
                        });
                      }
                    }}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "已复制" : "复制口令与链接"}
                  </Button>
                </div>
              ) : null}
            </CardPanel>
          </Card>
          <Card className="admin-action-card admin-code-management-card">
            <CardHeader>
              <span className="admin-card-icon"><Key size={18} /></span>
              <div>
                <CardTitle>访问口令管理</CardTitle>
                <CardDescription>
                  查看使用进度，更新额度、次数、有效期与使用方式，或停用和删除口令。
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={loadingInvitations}
                onClick={() => void loadInvitations()}
                aria-label="刷新访问口令"
              >
                <Refresh size={16} aria-hidden="true" />
                刷新
              </Button>
            </CardHeader>
            <CardPanel>
              <div className="admin-code-toolbar">
                <label className="admin-code-search">
                  <span className="sr-only">搜索访问口令</span>
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="search"
                    value={invitationQuery}
                    onChange={(event) => setInvitationQuery(event.target.value)}
                    placeholder="搜索口令、邮箱或 ID"
                  />
                </label>
                <label>
                  <span className="sr-only">筛选口令状态</span>
                  <select
                    value={invitationStatus}
                    onChange={(event) =>
                      setInvitationStatus(
                        event.target.value as typeof invitationStatus,
                      )
                    }
                  >
                    <option value="all">全部状态</option>
                    <option value="active">可使用</option>
                    <option value="paused">已停用</option>
                    <option value="expired">已过期</option>
                    <option value="exhausted">次数用完</option>
                  </select>
                </label>
              </div>
              <div className="admin-code-list" aria-busy={loadingInvitations}>
                {loadingInvitations && invitations.length === 0 ? (
                  <AdminEmpty
                    icon={<Refresh size={20} />}
                    title="正在载入口令"
                    description="请稍候，正在读取最新访问配置。"
                  />
                ) : invitations.length === 0 ? (
                  <AdminEmpty
                    icon={<Key size={20} />}
                    title="还没有访问口令"
                    description="在左侧创建后，口令会出现在这里。"
                  />
                ) : filteredInvitations.length === 0 ? (
                  <AdminEmpty
                    icon={<Search size={20} />}
                    title="没有匹配口令"
                    description="尝试清空关键词或切换状态。"
                  />
                ) : (
                  filteredInvitations.map((invitation) => (
                    <InvitationRow
                      key={invitation.id}
                      invitation={invitation}
                      canWrite={canWrite}
                      busy={invitationBusyId === invitation.id}
                      onManage={() => {
                        setSelectedInvitation(invitation);
                        setInvitationEditor(editableInvitation(invitation));
                      }}
                    />
                  ))
                )}
              </div>
              <p className="admin-code-footnote">
                完整口令只在创建时显示一次；管理列表仅保留脱敏提示。
              </p>
            </CardPanel>
          </Card>
        </section>

        <Card className="admin-users-card">
          <CardHeader>
            <div>
              <CardTitle>用户与访问状态</CardTitle>
              <CardDescription>搜索邮箱、姓名或用户 ID，分配管理员角色并更新服务限制。</CardDescription>
            </div>
            <form
              className="admin-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                setSubmittedQuery(query.trim());
                void loadUsers({ search: query.trim() });
              }}
            >
              <label className="sr-only" htmlFor="admin-user-search">搜索用户</label>
              <Search size={17} aria-hidden="true" />
              <input
                id="admin-user-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={120}
                placeholder="搜索邮箱、姓名或 ID"
              />
              <Button type="submit" size="sm" variant="secondary" loading={loadingUsers}>搜索</Button>
            </form>
          </CardHeader>
          <CardPanel className="admin-user-list" aria-busy={loadingUsers}>
            {loadingUsers && users.length === 0 ? (
              <AdminEmpty icon={<Refresh size={20} />} title="正在载入用户" description="请稍候，正在读取最新账号状态。" />
            ) : users.length === 0 ? (
              <AdminEmpty icon={<Search size={20} />} title="没有匹配用户" description="尝试缩短关键词，或确认用户已经接受邀请。" />
            ) : (
              users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  canWrite={canWrite}
                  busy={savingUserId === user.id}
                  onManage={() => {
                    setEditing((current) => ({
                      ...current,
                      [user.id]: editableUser(user),
                    }));
                    setSelectedUser(user);
                  }}
                />
              ))
            )}
          </CardPanel>
          {nextUserCursor ? (
            <CardFooter className="admin-list-footer">
              <Button
                variant="outline"
                loading={loadingUsers}
                onClick={() =>
                  void loadUsers({
                    cursor: nextUserCursor,
                    append: true,
                    search: submittedQuery,
                  })
                }
              >
                加载更多
              </Button>
            </CardFooter>
          ) : null}
        </Card>

        <Card className="admin-ledger-card">
          <CardHeader>
            <span className="admin-card-icon"><CreditCard size={18} /></span>
            <div>
              <CardTitle>最近额度账本</CardTitle>
              <CardDescription>
                第 {ledgerPage + 1} 页，本页显示 {filteredLedgerEntries.length} / {ledgerEntries.length} 条，可按用户、说明或收支方向筛选。
              </CardDescription>
            </div>
            <div className="admin-ledger-filters" role="search">
              <label className="admin-ledger-search">
                <span className="sr-only">筛选额度账本</span>
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={ledgerQuery}
                  onChange={(event) => setLedgerQuery(event.target.value)}
                  placeholder="用户、邮箱或说明"
                />
              </label>
              <label>
                <span className="sr-only">收支方向</span>
                <select
                  value={ledgerDirection}
                  onChange={(event) =>
                    setLedgerDirection(
                      event.target.value as "all" | "credit" | "debit",
                    )
                  }
                >
                  <option value="all">全部收支</option>
                  <option value="credit">仅收入</option>
                  <option value="debit">仅支出</option>
                </select>
              </label>
            </div>
          </CardHeader>
          <CardPanel className="admin-ledger-list" aria-busy={loadingAudit}>
            {loadingAudit && ledgerEntries.length === 0 ? (
              <AdminEmpty icon={<Refresh size={20} />} title="正在载入额度账本" description="正在读取最近额度变化。" />
            ) : ledgerEntries.length === 0 ? (
              <AdminEmpty icon={<CreditCard size={20} />} title="暂无额度记录" description="发放额度或任务发生扣费后，记录会显示在这里。" />
            ) : filteredLedgerEntries.length === 0 ? (
              <AdminEmpty icon={<Search size={20} />} title="没有匹配记录" description="尝试清空关键词或切换收支方向。" />
            ) : (
              filteredLedgerEntries.map((entry) => {
                const user = users.find((candidate) => candidate.id === entry.userId);
                return (
                <article className="admin-ledger-entry" key={entry.id}>
                  <strong className={entry.amount >= 0 ? "is-positive" : "is-negative"}>
                    {formatCreditAmount(entry.amount)}
                  </strong>
                  <div>
                    <b>{entry.event} · {entry.source ?? "system"}</b>
                    <p>{entry.note || "无附加说明"}</p>
                    <small>
                      {user ? `${user.displayName} · ${user.email}` : `用户 ${entry.userId}`}
                      {entry.taskId ? ` · 任务 ${entry.taskId}` : ""}
                    </small>
                  </div>
                  <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                </article>
                );
              })
            )}
          </CardPanel>
          <CardFooter className="admin-pagination">
            <span aria-live="polite">第 {ledgerPage + 1} 页</span>
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loadingAudit || ledgerPage === 0}
                onClick={() => void changeActivityPage("ledger", "previous")}
              >
                上一页
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={loadingAudit || !nextLedgerCursor}
                onClick={() => void changeActivityPage("ledger", "next")}
              >
                下一页
              </Button>
            </div>
          </CardFooter>
        </Card>

        <Card className="admin-audit-card">
          <CardHeader>
            <span className="admin-card-icon"><History size={18} /></span>
            <div>
              <CardTitle>最近审计记录</CardTitle>
              <CardDescription>第 {auditPage + 1} 页，每页最多 8 条；仅展示操作元数据，不保存媒体地址、验证码或凭证。</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void loadAudit()} loading={loadingAudit}>
              <Refresh size={16} aria-hidden="true" />
              刷新
            </Button>
          </CardHeader>
          <CardPanel className="admin-audit-list" aria-busy={loadingAudit}>
            {loadingAudit && auditEntries.length === 0 ? (
              <AdminEmpty icon={<Refresh size={20} />} title="正在载入审计" description="正在读取最近操作记录。" />
            ) : auditEntries.length === 0 ? (
              <AdminEmpty icon={<History size={20} />} title="暂无审计记录" description="创建邀请或调整账号后，记录会显示在这里。" />
            ) : (
              auditEntries.map((entry) => (
                <article className="admin-audit-entry" key={entry.id}>
                  <span className="admin-audit-action">{entry.action}</span>
                  <div>
                    <strong>{entry.targetType} · {entry.targetId}</strong>
                    <p>{entry.reason}</p>
                  </div>
                  <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                </article>
              ))
            )}
          </CardPanel>
          <CardFooter className="admin-pagination">
            <span aria-live="polite">第 {auditPage + 1} 页</span>
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loadingAudit || auditPage === 0}
                onClick={() => void changeActivityPage("audit", "previous")}
              >
                上一页
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={loadingAudit || !nextAuditCursor}
                onClick={() => void changeActivityPage("audit", "next")}
              >
                下一页
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>

      <Dialog
        open={Boolean(providerKeyDraft)}
        onOpenChange={(open) => {
          if (!open && !providerKeyBusy) setProviderKeyDraft(null);
        }}
      >
        <DialogPopup className="admin-key-dialog" closeLabel="关闭添加 Key">
          {providerKeyDraft ? (
            <form className="admin-key-form" onSubmit={createProviderKey}>
              <DialogHeader>
                <div>
                  <p className="eyebrow">ENCRYPTED PROVIDER KEY</p>
                  <DialogTitle>添加服务 Key</DialogTitle>
                  <DialogDescription>
                    保存后立即设为活跃 Key。完整值不会再次显示。
                  </DialogDescription>
                </div>
              </DialogHeader>
              <DialogPanel>
                <div className="admin-key-security-note" role="note">
                  <Shield size={17} aria-hidden="true" />
                  <span>
                    Key 会在服务端使用 AES-GCM 加密；页面和 API 只显示名称与尾号。
                  </span>
                </div>
                <div className="admin-key-fields">
                  <FormField label="服务" name="provider-key-service">
                    <select
                      value={providerKeyDraft.provider}
                      disabled={providerKeyBusy}
                      onChange={(event) =>
                        setProviderKeyDraft((current) =>
                          current
                            ? {
                                ...current,
                                provider: event.target.value as ProviderKeyKind,
                              }
                            : current,
                        )
                      }
                    >
                      {providerKeys
                        .filter((provider) => provider.managedStorageReady)
                        .map((provider) => (
                          <option value={provider.provider} key={provider.provider}>
                            {provider.label}
                          </option>
                        ))}
                    </select>
                  </FormField>
                  <FormField label="Key 名称" name="provider-key-label">
                    <input
                      name="providerKeyLabel"
                      value={providerKeyDraft.label}
                      maxLength={40}
                      placeholder="例如：生产主 Key"
                      required
                      disabled={providerKeyBusy}
                      onChange={(event) =>
                        setProviderKeyDraft((current) =>
                          current
                            ? { ...current, label: event.target.value }
                            : current,
                        )
                      }
                    />
                  </FormField>
                  <FormField label="API Key" name="provider-api-key">
                    <input
                      name="providerApiKey"
                      type="password"
                      value={providerKeyDraft.apiKey}
                      minLength={8}
                      maxLength={512}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="粘贴完整 Key"
                      required
                      disabled={providerKeyBusy}
                      onChange={(event) =>
                        setProviderKeyDraft((current) =>
                          current
                            ? { ...current, apiKey: event.target.value }
                            : current,
                        )
                      }
                    />
                  </FormField>
                </div>
                <p className="admin-key-footnote">
                  需要轮换时，先添加新 Key；确认生效后再删除旧 Key。
                </p>
              </DialogPanel>
              <DialogFooter>
                <DialogClose render={<Button variant="ghost" />}>
                  取消
                </DialogClose>
                <Button type="submit" loading={providerKeyBusy}>
                  <Key size={16} aria-hidden="true" />
                  加密保存并启用
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogPopup>
      </Dialog>

      <Dialog
        open={Boolean(selectedUser)}
onOpenChange={(open) => {
          if (!open) {
            setSelectedUser(null);
            setPasswordDraft("");
            setPasswordConfirmation("");
          }
        }}
      >
        <DialogPopup
          className="admin-user-dialog"
          closeLabel="关闭用户管理"
        >
          {selectedUser ? (
            <>
              <DialogHeader>
                <span className="admin-dialog-avatar" aria-hidden="true">
                  {userInitial(selectedUser)}
                </span>
                <div>
                  <DialogTitle>管理 {selectedUser.displayName}</DialogTitle>
                  <DialogDescription>
                    {selectedUser.email} · {selectedUser.id}
                  </DialogDescription>
                </div>
              </DialogHeader>
              <DialogPanel>
                <section className="admin-dialog-summary" aria-label="用户额度摘要">
                  <div>
                    <span>当前余额</span>
                    <strong>{selectedUser.creditBalance}</strong>
                  </div>
                  <div>
                    <span>运行任务</span>
                    <strong>{selectedUser.activeTaskCount}</strong>
                  </div>
                  <div>
                    <span>账号状态</span>
                    <strong>{selectedUser.status === "active" ? "活跃" : "已暂停"}</strong>
                  </div>
                </section>

                <form
                  className="admin-dialog-section admin-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveUser(selectedUser);
                  }}
                >
                  <div className="admin-dialog-section-heading">
                    <div>
                      <strong>角色、访问与服务限制</strong>
                      <small>保存后立即生效；系统始终保留至少一名活跃管理员。</small>
                    </div>
                    <Settings size={17} aria-hidden="true" />
                  </div>
                  <div className="admin-form-row admin-form-row--four">
                    <FormField label="角色" name={`role-${selectedUser.id}`}>
                      <select
                        value={
                          editing[selectedUser.id]?.role ?? selectedUser.role
                        }
                        disabled={!canWrite || savingUserId === selectedUser.id}
                        onChange={(event) =>
                          setEditing((current) => ({
                            ...current,
                            [selectedUser.id]: {
                              ...(current[selectedUser.id] ??
                                editableUser(selectedUser)),
                              role: event.target.value as UserRole,
                            },
                          }))
                        }
                      >
                        <option value="user">普通用户</option>
                        <option value="support">支持人员 · 只读</option>
                        <option value="admin">管理员</option>
                      </select>
                    </FormField>
                    <FormField label="状态" name={`status-${selectedUser.id}`}>
                      <select
                        value={
                          editing[selectedUser.id]?.status ?? selectedUser.status
                        }
                        disabled={!canWrite || savingUserId === selectedUser.id}
                        onChange={(event) =>
                          setEditing((current) => ({
                            ...current,
                            [selectedUser.id]: {
                              ...(current[selectedUser.id] ??
                                editableUser(selectedUser)),
                              status: event.target.value as UserStatus,
                            },
                          }))
                        }
                      >
                        <option value="active">活跃</option>
                        <option value="suspended">暂停</option>
                      </select>
                    </FormField>
                    <FormField label="并发上限" name={`concurrency-${selectedUser.id}`}>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        step="1"
                        value={
                          editing[selectedUser.id]?.concurrencyLimit ??
                          String(selectedUser.concurrencyLimit)
                        }
                        disabled={!canWrite || savingUserId === selectedUser.id}
                        onChange={(event) =>
                          setEditing((current) => ({
                            ...current,
                            [selectedUser.id]: {
                              ...(current[selectedUser.id] ??
                                editableUser(selectedUser)),
                              concurrencyLimit: event.target.value,
                            },
                          }))
                        }
                      />
                    </FormField>
                    <FormField label="每日额度上限" name={`daily-${selectedUser.id}`}>
                      <input
                        type="number"
                        min="0"
                        max="1000000"
                        step="1"
                        value={
                          editing[selectedUser.id]?.dailyCreditLimit ??
                          String(selectedUser.dailyCreditLimit)
                        }
                        disabled={!canWrite || savingUserId === selectedUser.id}
                        onChange={(event) =>
                          setEditing((current) => ({
                            ...current,
                            [selectedUser.id]: {
                              ...(current[selectedUser.id] ??
                                editableUser(selectedUser)),
                              dailyCreditLimit: event.target.value,
                            },
                          }))
                        }
                      />
                    </FormField>
                  </div>
                  <Button
                    type="submit"
                    loading={savingUserId === selectedUser.id}
                    disabled={!canWrite}
                  >
                    保存账号设置
                  </Button>
</form>

                <form
                  className="admin-dialog-section admin-form"
                  onSubmit={savePassword}
                >
                  <div className="admin-dialog-section-heading">
                    <div>
                      <strong>登录密码</strong>
                      <small>
                        {selectedUser.passwordEnabled
                          ? "已设置密码；提交新密码会替换旧密码并撤销现有会话。"
                          : "尚未设置密码；创建后可用邮箱和密码登录。"}
                      </small>
                    </div>
                    <Key size={17} aria-hidden="true" />
                  </div>
                  <div className="admin-form-row">
                    <FormField label="新密码" name={`password-${selectedUser.id}`}>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        value={passwordDraft}
                        onChange={(event) => setPasswordDraft(event.target.value)}
                        required
                        disabled={!canWrite || passwordBusy}
                      />
                    </FormField>
                    <FormField label="确认新密码" name={`password-confirm-${selectedUser.id}`}>
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        maxLength={128}
                        value={passwordConfirmation}
                        onChange={(event) => setPasswordConfirmation(event.target.value)}
                        required
                        disabled={!canWrite || passwordBusy}
                      />
                    </FormField>
                  </div>
                  <div className="admin-dialog-inline-actions">
                    <Button
                      type="submit"
                      loading={passwordBusy}
                      disabled={!canWrite || passwordDraft.length < 8 || passwordConfirmation.length < 8}
                    >
                      <Key size={16} aria-hidden="true" />
                      {selectedUser.passwordEnabled ? "更新登录密码" : "创建登录密码"}
                    </Button>
                    {selectedUser.passwordEnabled ? (
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={!canWrite || passwordBusy}
                        onClick={() => setRemovePasswordTarget(selectedUser)}
                      >
                        <Trash size={16} aria-hidden="true" />
                        移除密码
                      </Button>
                    ) : null}
                  </div>
                </form>

                <form
                  className="admin-dialog-section admin-form"
                  onSubmit={handleCredit}
                >
                  <div className="admin-dialog-section-heading">
                    <div>
                      <strong>调整额度</strong>
                      <small>正数增加、负数扣减；原因会写入账本和审计。</small>
                    </div>
                    <CreditCard size={17} aria-hidden="true" />
                  </div>
                  <div className="admin-form-row">
                    <FormField label="调整数量" name={`amount-${selectedUser.id}`}>
                      <input
                        name="amount"
                        type="number"
                        min="-1000000"
                        max="1000000"
                        step="1"
                        placeholder="+100 或 -50"
                        required
                        disabled={!canWrite}
                      />
                    </FormField>
                    <FormField label="调整原因" name={`reason-${selectedUser.id}`}>
                      <input
                        name="reason"
                        type="text"
                        maxLength={500}
                        placeholder="例如：活动补发"
                        required
                        disabled={!canWrite}
                      />
                    </FormField>
                  </div>
                  <Button
                    type="submit"
                    variant="secondary"
                    loading={creditBusy}
                    disabled={!canWrite}
                  >
                    写入额度账本
                  </Button>
                </form>
              </DialogPanel>
              <DialogFooter className="admin-dialog-footer">
                <div className="admin-dialog-footer-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={!canWrite || savingUserId === selectedUser.id}
                    onClick={() => setRevokeTarget(selectedUser)}
                  >
                    撤销全部会话
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!canWrite || savingUserId === selectedUser.id}
                    onClick={() => {
                      setDeleteUserTarget(selectedUser);
                      setSelectedUser(null);
                      setPasswordDraft("");
                      setPasswordConfirmation("");
                    }}
                  >
                    <Trash size={16} aria-hidden="true" />
                    删除用户
                  </Button>
                </div>
                <DialogClose render={<Button variant="outline" />}>
                  关闭
                </DialogClose>
              </DialogFooter>
            </>
          ) : null}
        </DialogPopup>
      </Dialog>

      <Dialog
        open={Boolean(selectedInvitation)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedInvitation(null);
            setInvitationEditor(null);
          }
        }}
      >
        <DialogPopup
          className="admin-user-dialog admin-code-dialog"
          closeLabel="关闭访问口令管理"
        >
          {selectedInvitation && invitationEditor ? (
            <>
              <DialogHeader>
                <span className="admin-dialog-avatar" aria-hidden="true">
                  <Key size={19} />
                </span>
                <div>
                  <DialogTitle>管理 {selectedInvitation.codeHint}</DialogTitle>
                  <DialogDescription>
                    完整口令不保存明文；此处修改只影响后续兑换。
                  </DialogDescription>
                </div>
              </DialogHeader>
              <form className="contents" onSubmit={saveInvitation}>
                <DialogPanel>
                  <section
                    className="admin-dialog-summary"
                    aria-label="访问口令摘要"
                  >
                    <div>
                      <span>使用进度</span>
                      <strong>
                        {selectedInvitation.useCount}/{selectedInvitation.maxUses}
                      </strong>
                    </div>
                    <div>
                      <span>当前状态</span>
                      <strong>{invitationStateLabel(selectedInvitation)}</strong>
                    </div>
                    <div>
                      <span>创建时间</span>
                      <strong className="is-date">
                        {formatShortDate(selectedInvitation.createdAt)}
                      </strong>
                    </div>
                  </section>

                  <section className="admin-dialog-section admin-form">
                    <div className="admin-dialog-section-heading">
                      <div>
                        <strong>新用户权限与有效期</strong>
                        <small>
                          初始额度、并发和日额度只影响后续首次兑换；已注册用户不变。
                        </small>
                      </div>
                      <Edit size={17} aria-hidden="true" />
                    </div>
                    <div className="admin-form-row">
                      <FormField
                        label="绑定邮箱"
                        name={`invite-email-${selectedInvitation.id}`}
                      >
                        <input
                          type="email"
                          value={invitationEditor.email}
                          onChange={(event) =>
                            setInvitationEditor((current) =>
                              current
                                ? { ...current, email: event.target.value }
                                : current,
                            )
                          }
                          required={invitationEditor.allowEmailLink}
                          disabled={!canWrite}
                          placeholder="name@example.com"
                        />
                      </FormField>
                      <FormField
                        label="初始 credits"
                        name={`invite-credits-${selectedInvitation.id}`}
                      >
                        <input
                          type="number"
                          min="0"
                          max="1000000"
                          step="1"
                          value={invitationEditor.initialCredits}
                          onChange={(event) =>
                            setInvitationEditor((current) =>
                              current
                                ? {
                                    ...current,
                                    initialCredits: event.target.value,
                                  }
                                : current,
                            )
                          }
                          required
                          disabled={!canWrite}
                        />
                      </FormField>
                      <FormField
                        label="初始并发数"
                        name={`invite-concurrency-${selectedInvitation.id}`}
                      >
                        <input
                          type="number"
                          min="1"
                          max="20"
                          step="1"
                          value={invitationEditor.initialConcurrencyLimit}
                          onChange={(event) =>
                            setInvitationEditor((current) =>
                              current
                                ? {
                                    ...current,
                                    initialConcurrencyLimit: event.target.value,
                                  }
                                : current,
                            )
                          }
                          required
                          disabled={!canWrite}
                        />
                      </FormField>
                      <FormField
                        label="每日额度上限"
                        name={`invite-daily-limit-${selectedInvitation.id}`}
                      >
                        <input
                          type="number"
                          min="0"
                          max="1000000"
                          step="1"
                          value={invitationEditor.initialDailyCreditLimit}
                          onChange={(event) =>
                            setInvitationEditor((current) =>
                              current
                                ? {
                                    ...current,
                                    initialDailyCreditLimit: event.target.value,
                                  }
                                : current,
                            )
                          }
                          required
                          disabled={!canWrite}
                        />
                      </FormField>
                      <FormField
                        label={`可用次数（已使用 ${selectedInvitation.useCount}）`}
                        name={`invite-uses-${selectedInvitation.id}`}
                      >
                        <input
                          type="number"
                          min={Math.max(1, selectedInvitation.useCount)}
                          max="10000"
                          step="1"
                          value={invitationEditor.maxUses}
                          onChange={(event) =>
                            setInvitationEditor((current) =>
                              current
                                ? { ...current, maxUses: event.target.value }
                                : current,
                            )
                          }
                          required
                          disabled={!canWrite}
                        />
                      </FormField>
                      <FormField
                        label="到期时间"
                        name={`invite-expiry-${selectedInvitation.id}`}
                      >
                        <input
                          type="datetime-local"
                          value={invitationEditor.expiresAt}
                          onChange={(event) =>
                            setInvitationEditor((current) =>
                              current
                                ? { ...current, expiresAt: event.target.value }
                                : current,
                            )
                          }
                          required
                          disabled={!canWrite}
                        />
                      </FormField>
                    </div>
                  </section>

                  <section className="admin-dialog-section admin-form">
                    <div className="admin-dialog-section-heading">
                      <div>
                        <strong>使用方式与状态</strong>
                        <small>
                          停用后立即拒绝新的兑换，重新启用不会重置使用次数。
                        </small>
                      </div>
                      <Pause size={17} aria-hidden="true" />
                    </div>
                    <fieldset className="admin-channel-options admin-dialog-channel-options">
                      <legend>允许的入口</legend>
                      <label>
                        <span>
                          <strong>邮箱专属链接</strong>
                          <small>仅绑定邮箱可以使用邀请链接</small>
                        </span>
                        <Switch
                          checked={invitationEditor.allowEmailLink}
                          onCheckedChange={(checked) =>
                            setInvitationEditor((current) =>
                              current
                                ? { ...current, allowEmailLink: checked }
                                : current,
                            )
                          }
                          disabled={!canWrite}
                          aria-label="允许邮箱专属链接"
                        />
                      </label>
                      <label>
                        <span>
                          <strong>手动输入口令</strong>
                          <small>允许用户在登录页输入口令</small>
                        </span>
                        <Switch
                          checked={invitationEditor.allowManualCode}
                          onCheckedChange={(checked) =>
                            setInvitationEditor((current) =>
                              current
                                ? { ...current, allowManualCode: checked }
                                : current,
                            )
                          }
                          disabled={!canWrite}
                          aria-label="允许手动输入口令"
                        />
                      </label>
                      <label className="is-status-control">
                        <span>
                          <strong>启用访问口令</strong>
                          <small>
                            {invitationEditor.revoked
                              ? "当前已停用"
                              : "当前允许继续兑换"}
                          </small>
                        </span>
                        <Switch
                          checked={!invitationEditor.revoked}
                          onCheckedChange={(checked) =>
                            setInvitationEditor((current) =>
                              current
                                ? { ...current, revoked: !checked }
                                : current,
                            )
                          }
                          disabled={!canWrite}
                          aria-label="启用访问口令"
                        />
                      </label>
                    </fieldset>
                  </section>
                </DialogPanel>
                <DialogFooter className="admin-dialog-footer">
                  {canWrite ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        setDeleteInvitationTarget(selectedInvitation);
                        setSelectedInvitation(null);
                        setInvitationEditor(null);
                      }}
                      disabled={invitationBusyId === selectedInvitation.id}
                    >
                      <Trash size={16} aria-hidden="true" />
                      删除口令
                    </Button>
                  ) : <span />}
                  <div className="admin-dialog-footer-actions">
                    <DialogClose render={<Button variant="outline" />}>
                      关闭
                    </DialogClose>
                    {canWrite ? (
                      <Button
                        type="submit"
                        loading={invitationBusyId === selectedInvitation.id}
                      >
                        保存配置
                      </Button>
                    ) : null}
                  </div>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogPopup>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteProviderKeyTarget)}
        onOpenChange={(open) => !open && setDeleteProviderKeyTarget(null)}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这个服务 Key？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteProviderKeyTarget
                ? `${deleteProviderKeyTarget.providerLabel} Key「${deleteProviderKeyTarget.option.label}」${deleteProviderKeyTarget.option.hint ? `（${deleteProviderKeyTarget.option.hint}）` : ""}的加密记录将永久删除，审计记录会保留。`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              取消
            </AlertDialogClose>
            <Button
              variant="destructive"
              loading={providerKeyBusy}
              onClick={() => void deleteProviderKey()}
            >
              确认删除 Key
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteInvitationTarget)}
        onOpenChange={(open) => !open && setDeleteInvitationTarget(null)}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这个访问口令？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteInvitationTarget
                ? `${deleteInvitationTarget.codeHint} 将立即失效并从管理列表移除。已发放额度、用户与审计记录不会被删除；此口令值之后也不能重新创建。`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              取消
            </AlertDialogClose>
            <Button
              variant="destructive"
              loading={
                invitationBusyId === deleteInvitationTarget?.id
              }
              onClick={() => void deleteInvitation()}
            >
              确认删除
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteUserTarget)}
        onOpenChange={(open) => !open && setDeleteUserTarget(null)}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>删除此用户？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteUserTarget
                ? `${deleteUserTarget.email} 将立即无法登录并从用户列表隐藏。历史任务、额度账本、媒体索引和审计记录会保留。此操作不能在管理后台撤销。`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              取消
            </AlertDialogClose>
            <Button
              variant="destructive"
              loading={savingUserId === deleteUserTarget?.id}
              onClick={() => void deleteUser()}
            >
              确认删除用户
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      <AlertDialog
        open={Boolean(removePasswordTarget)}
        onOpenChange={(open) => !open && setRemovePasswordTarget(null)}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>移除此用户的登录密码？</AlertDialogTitle>
            <AlertDialogDescription>
              {removePasswordTarget
                ? `${removePasswordTarget.email} 将无法再使用密码登录；现有会话和创作数据不会被删除。`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>取消</AlertDialogClose>
            <Button
              variant="destructive"
              loading={passwordBusy}
              onClick={() => void removePassword()}
            >
              确认移除
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      <AlertDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>撤销此用户的全部活跃会话？</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget
                ? `${revokeTarget.email} 将需要重新登录。任务与历史数据不会被删除。`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>取消</AlertDialogClose>
            <Button variant="destructive" onClick={() => void revokeSessions()}>
              确认撤销
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card className="admin-metric">
      <CardHeader>
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </CardHeader>
      <CardPanel><strong>{value}</strong></CardPanel>
    </Card>
  );
}

function FormField({
  label,
  name,
  children,
}: {
  label: string;
  name: string;
  children: React.ReactElement;
}) {
  const id = `admin-${name}`;
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {cloneWithId(children, id)}
    </div>
  );
}

function cloneWithId(element: React.ReactElement, id: string) {
  return cloneElement(element, { id } as Record<string, unknown>);
}

function UserRow({
  user,
  canWrite,
  busy,
  onManage,
}: {
  user: AdminUserSummary;
  canWrite: boolean;
  busy: boolean;
  onManage: () => void;
}) {
  return (
    <article className="admin-user-row">
      <div className="admin-user-identity">
        <span className="admin-user-avatar" aria-hidden="true">
          {userInitial(user)}
        </span>
        <div>
          <strong>{user.displayName}</strong>
          <span>{user.email}</span>
        </div>
        <code>{user.id}</code>
      </div>
      <div className="admin-user-balance">
        <span>余额</span>
        <strong>{user.creditBalance}</strong>
      </div>
      <div className="admin-user-meta">
        <span className={`admin-user-status is-${user.status}`}>
          {user.status === "active" ? "活跃" : "已暂停"}
        </span>
        <span className={`admin-user-role is-${user.role}`}>
          {userRoleLabel(user.role)}
        </span>
        <span>并发 {user.concurrencyLimit}</span>
        <span>日上限 {user.dailyCreditLimit}</span>
        <span>{user.activeTaskCount} 个运行任务</span>
      </div>
      <div className="admin-user-actions">
        <Button
          size="sm"
          variant="outline"
          onClick={onManage}
          loading={busy}
          aria-label={`管理 ${user.displayName}`}
        >
          <Settings size={16} aria-hidden="true" />
          {canWrite ? "管理" : "查看"}
        </Button>
      </div>
    </article>
  );
}

function InvitationRow({
  invitation,
  canWrite,
  busy,
  onManage,
}: {
  invitation: AdminInvitationSummary;
  canWrite: boolean;
  busy: boolean;
  onManage: () => void;
}) {
  const state = invitationState(invitation);
  const progress = Math.min(
    100,
    Math.round((invitation.useCount / invitation.maxUses) * 100),
  );
  return (
    <article className="admin-code-row">
      <div className="admin-code-identity">
        <span className="admin-code-key" aria-hidden="true">
          <Key size={16} />
        </span>
        <div>
          <strong>{invitation.codeHint}</strong>
          <span>{invitation.email || "共享口令 · 不绑定邮箱"}</span>
        </div>
        <span className={`admin-code-status is-${state}`}>
          {invitationStateLabel(invitation)}
        </span>
      </div>
      <div className="admin-code-progress">
        <div>
          <span>使用进度</span>
          <strong>{invitation.useCount} / {invitation.maxUses}</strong>
        </div>
        <span
          className="admin-code-progress-track"
          role="progressbar"
          aria-label={`${invitation.codeHint} 使用进度`}
          aria-valuemin={0}
          aria-valuemax={invitation.maxUses}
          aria-valuenow={invitation.useCount}
        >
          <span style={{ width: `${progress}%` }} />
        </span>
      </div>
      <div className="admin-code-meta">
        <span>{invitation.initialCredits} credits</span>
        <span>并发 {invitation.initialConcurrencyLimit}</span>
        <span>日额度 {invitation.initialDailyCreditLimit}</span>
        <span>{invitation.allowEmailLink ? "邮箱链接" : "无邮箱链接"}</span>
        <span>{invitation.allowManualCode ? "手动口令" : "禁止手动"}</span>
        <span>到期 {formatShortDate(invitation.expiresAt)}</span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onManage}
        loading={busy}
        aria-label={`管理访问口令 ${invitation.codeHint}`}
      >
        <Settings size={16} aria-hidden="true" />
        {canWrite ? "管理" : "查看"}
      </Button>
    </article>
  );
}

function AdminEmpty({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="admin-empty" role="status">
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function editableUser(user: AdminUserSummary): EditableUser {
  return {
    role: user.role,
    status: user.status,
    concurrencyLimit: String(user.concurrencyLimit),
    dailyCreditLimit: String(user.dailyCreditLimit),
  };
}

function editableInvitation(
  invitation: AdminInvitationSummary,
): EditableInvitation {
  return {
    email: invitation.email,
    initialCredits: String(invitation.initialCredits),
    initialConcurrencyLimit: String(invitation.initialConcurrencyLimit),
    initialDailyCreditLimit: String(invitation.initialDailyCreditLimit),
    maxUses: String(invitation.maxUses),
    expiresAt: toLocalDateTimeInput(invitation.expiresAt),
    allowEmailLink: invitation.allowEmailLink,
    allowManualCode: invitation.allowManualCode,
    revoked: Boolean(invitation.revokedAt),
  };
}

function invitationState(
  invitation: AdminInvitationSummary,
): "active" | "paused" | "expired" | "exhausted" {
  if (invitation.revokedAt) return "paused";
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) return "expired";
  if (invitation.useCount >= invitation.maxUses) return "exhausted";
  return "active";
}

function invitationStateLabel(invitation: AdminInvitationSummary): string {
  const labels = {
    active: "可使用",
    paused: "已停用",
    expired: "已过期",
    exhausted: "次数用完",
  } as const;
  return labels[invitationState(invitation)];
}

function toLocalDateTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function userRoleLabel(role: UserRole) {
  return {
    user: "普通用户",
    support: "支持人员",
    admin: "管理员",
  }[role];
}

function userInitial(user: Pick<AdminUserSummary, "displayName" | "email">) {
  return (user.displayName.trim() || user.email.trim()).slice(0, 1).toUpperCase();
}

function mergeUsers(
  current: AdminUserSummary[],
  next: AdminUserSummary[],
): AdminUserSummary[] {
  const result = new Map(current.map((user) => [user.id, user]));
  for (const user of next) result.set(user.id, user);
  return [...result.values()];
}

async function apiFetch<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "请求失败，请稍后重试。";
    throw new Error(message);
  }
  return payload as T;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}

function providerKeyNotice(
  completedAction: string,
  validation: ProviderKeyAvailability,
): Notice {
  return {
    tone: validation.status === "available" ? "success" : "warning",
    message:
      validation.status === "available"
        ? `${completedAction}，${validation.message}`
        : `${completedAction}；${validation.message} 保存或切换结果不受影响。`,
  };
}

function quotaStatusLabel(
  status: ProviderQuotaSnapshot["status"] | undefined,
) {
  if (status === "available") return "可用";
  if (status === "unavailable") return "不可用";
  return "待确认";
}

function formatQuotaValue(value: number | null | undefined) {
  return typeof value === "number"
    ? new Intl.NumberFormat("zh-CN").format(value)
    : "—";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function formatCreditAmount(value: number): string {
  const amount = new Intl.NumberFormat("zh-CN").format(Math.abs(value));
  return `${value >= 0 ? "+" : "−"}${amount}`;
}
