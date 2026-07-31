import { AppError } from "@/lib/errors";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const DEFAULT_TIMEOUT_MS = 8_000;

type TurnstileResponse = {
  success?: unknown;
};

export class TurnstileError extends AppError {
  constructor(
    public readonly code: "invalid" | "timeout" | "upstream",
    message: string,
    status: number,
  ) {
    super(message, status);
    this.name = "TurnstileError";
  }
}

export async function verifyTurnstile(
  input: { token: string; secret: string; idempotencyKey: string },
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<void> {
  const form = new FormData();
  form.set("secret", input.secret);
  form.set("response", input.token);
  form.set("idempotency_key", input.idempotencyKey);

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeout(error)) {
      throw new TurnstileError(
        "timeout",
        "人机验证服务响应超时，请重试。",
        504,
      );
    }
    throw new TurnstileError(
      "upstream",
      "人机验证服务暂时不可用，请稍后重试。",
      502,
    );
  }

  if (!response.ok) {
    throw new TurnstileError(
      "upstream",
      "人机验证服务暂时不可用，请稍后重试。",
      502,
    );
  }

  let payload: TurnstileResponse;
  try {
    payload = (await response.json()) as TurnstileResponse;
  } catch {
    throw new TurnstileError(
      "upstream",
      "人机验证服务返回了无效响应。",
      502,
    );
  }
  if (payload.success !== true) {
    throw new TurnstileError("invalid", "人机验证失败，请重试。", 400);
  }
}

function isTimeout(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}
