export type AuthProvider = "supabase_email" | "password";
export type UserRole = "user" | "support" | "admin";
export type UserStatus = "active" | "suspended";
export type ProviderKeyKind = "vidu" | "gemini";

export type IdentityClaims = {
  provider: AuthProvider;
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  fullName: string | null;
};

export type AppUserProfile = {
  id: string;
  email: string;
  displayName: string;
  fullName: string | null;
  role: UserRole;
  status: UserStatus;
  authProvider: AuthProvider;
};

export type AppSessionSummary = {
  authenticated: boolean;
  user: AppUserProfile | null;
};

export type AdminUserSummary = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  creditBalance: number;
  concurrencyLimit: number;
  activeTaskCount: number;
  dailyCreditLimit: number;
  passwordEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminAuditEntry = {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  requestId: string;
  createdAt: string;
};

export type AdminLedgerEntry = {
  id: string;
  userId: string;
  taskId: string | null;
  amount: number;
  event: string;
  note: string;
  actorUserId: string | null;
  source: string;
  createdAt: string;
};

export type AdminInvitationResult = {
  id: string;
  email: string;
  code: string;
  inviteUrl: string | null;
  initialCredits: number;
  initialConcurrencyLimit: number;
  initialDailyCreditLimit: number;
  maxUses: number;
  allowEmailLink: boolean;
  allowManualCode: boolean;
  expiresAt: string;
};

export type AdminInvitationSummary = {
  id: string;
  email: string;
  codeHint: string;
  initialCredits: number;
  initialConcurrencyLimit: number;
  initialDailyCreditLimit: number;
  maxUses: number;
  useCount: number;
  allowEmailLink: boolean;
  allowManualCode: boolean;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};

export type AdminCreditAdjustmentInput = {
  userId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
};

export type ProviderKeyOption = {
  id: string;
  label: string;
  source: "environment" | "managed";
  hint: string | null;
};

export type ProviderKeyAvailability = {
  status: "available" | "unavailable" | "unknown";
  message: string;
};

export type ProviderQuotaSnapshot = {
  provider: ProviderKeyKind;
  status: ProviderKeyAvailability["status"];
  message: string;
  checkedAt: string;
  remainingCredits: number | null;
  concurrencyLimit: number | null;
  currentConcurrency: number | null;
  queueCount: number | null;
};

export type ProviderUsagePoint = {
  date: string;
  viduCredits: number;
  geminiRequests: number;
};

export type ProviderKeyStatus = {
  provider: ProviderKeyKind;
  label: string;
  configured: boolean;
  activeKeyId: string | null;
  selectedKeyId: string | null;
  selectionPersisted: boolean;
  missingSelectedKey: boolean;
  managedStorageReady: boolean;
  options: ProviderKeyOption[];
  updatedAt: string | null;
};
