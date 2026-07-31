import { AppError } from "@/lib/errors";

const DEFAULT_TIMEOUT_MS = 10_000;

export type SupabaseAuthConfig = {
  url: string;
  publishableKey: string;
};

type SupabaseUser = {
  id?: unknown;
  email?: unknown;
  email_confirmed_at?: unknown;
  confirmed_at?: unknown;
};

type SupabaseVerifyResponse = {
  user?: SupabaseUser;
};

export class SupabaseAuthError extends AppError {
  constructor(
    public readonly code:
      | "configuration"
      | "timeout"
      | "upstream"
      | "invalid_response"
      | "invalid_code",
    message: string,
    status: number,
  ) {
    super(message, status);
    this.name = "SupabaseAuthError";
  }
}

export async function requestSupabaseEmailOtp(
  input: { email: string; captchaToken: string },
  options: {
    config: SupabaseAuthConfig;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<void> {
  const response = await supabaseFetch(
    "/auth/v1/otp",
    {
      email: input.email,
      create_user: true,
      gotrue_meta_security: {
        captcha_token: input.captchaToken,
      },
    },
    options,
  );
  if (!response.ok) {
    throw new SupabaseAuthError(
      "upstream",
      "验证码服务暂时不可用，请稍后重试。",
      502,
    );
  }
}

export async function verifySupabaseEmailOtp(
  input: { email: string; code: string },
  options: {
    config: SupabaseAuthConfig;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<{ subject: string; email: string }> {
  const response = await supabaseFetch(
    "/auth/v1/verify",
    {
      type: "email",
      email: input.email,
      token: input.code,
    },
    options,
  );
  if (!response.ok) {
    throw new SupabaseAuthError(
      "invalid_code",
      "验证码无效或已过期。",
      response.status === 429 ? 429 : 401,
    );
  }

  let payload: SupabaseVerifyResponse;
  try {
    payload = (await response.json()) as SupabaseVerifyResponse;
  } catch {
    throw invalidResponseError();
  }

  const subject =
    typeof payload.user?.id === "string" ? payload.user.id.trim() : "";
  const email =
    typeof payload.user?.email === "string"
      ? payload.user.email.trim().toLowerCase()
      : "";
  const verified =
    typeof payload.user?.email_confirmed_at === "string" ||
    typeof payload.user?.confirmed_at === "string";
  if (!subject || subject.length > 256 || !email || !verified) {
    throw invalidResponseError();
  }
  return { subject, email };
}

async function supabaseFetch(
  pathname: string,
  body: Record<string, unknown>,
  options: {
    config: SupabaseAuthConfig;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  },
) {
  const baseUrl = validatedSupabaseUrl(options.config.url);
  const key = options.config.publishableKey.trim();
  if (!key || key.length > 4_096 || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new SupabaseAuthError(
      "configuration",
      "邮箱登录服务配置无效。",
      503,
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    return await fetchImpl(new URL(pathname, baseUrl), {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeout(error)) {
      throw new SupabaseAuthError(
        "timeout",
        "验证码服务响应超时，请稍后重试。",
        504,
      );
    }
    throw new SupabaseAuthError(
      "upstream",
      "验证码服务暂时不可用，请稍后重试。",
      502,
    );
  }
}

function validatedSupabaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw invalidConfigurationError();
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw invalidConfigurationError();
  }
  return url;
}

function invalidConfigurationError() {
  return new SupabaseAuthError(
    "configuration",
    "邮箱登录服务配置无效。",
    503,
  );
}

function invalidResponseError() {
  return new SupabaseAuthError(
    "invalid_response",
    "验证码服务返回了无效响应。",
    502,
  );
}

function isTimeout(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}
