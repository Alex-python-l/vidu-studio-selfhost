import type {
  ProviderKeyAvailability,
  ProviderKeyKind,
  ProviderQuotaSnapshot,
} from "@/lib/account-contracts";
import { resolveGeminiApiUrl } from "@/lib/gemini-interactions-contract";

const PROVIDER_CHECKS: Record<
  ProviderKeyKind,
  {
    label: string;
    url: string;
    headers: (apiKey: string) => Record<string, string>;
  }
> = {
  vidu: {
    label: "Vidu",
    url: "https://api.vidu.com/ent/v2/credits?show_detail=true",
    headers: (apiKey) => ({
      "Content-Type": "application/json",
      Authorization: `Token ${apiKey}`,
    }),
  },
  gemini: {
    label: "Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
    headers: (apiKey) => ({
      "x-goog-api-key": apiKey,
    }),
  },
};

export async function checkProviderKeyAvailability(
  provider: ProviderKeyKind,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<ProviderKeyAvailability> {
  const snapshot = await inspectProviderKey(provider, apiKey, fetcher);
  return {
    status: snapshot.status,
    message:
      snapshot.status === "available"
        ? `${PROVIDER_CHECKS[provider].label} Key 可用性检测通过。`
        : snapshot.message,
  };
}

export async function inspectProviderKey(
  provider: ProviderKeyKind,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<ProviderQuotaSnapshot> {
  const check = PROVIDER_CHECKS[provider];
  const checkedAt = new Date().toISOString();

  try {
    const url =
      provider === "gemini"
        ? resolveGeminiApiUrl(
            "/v1beta/models?pageSize=1",
            process.env.GEMINI_API_BASE_URL,
          )
        : check.url;
    const response = await fetcher(url, {
      method: "GET",
      headers: check.headers(apiKey),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      if (provider === "vidu") {
        const payload = (await response.json().catch(() => ({}))) as unknown;
        const quota = viduQuotaFrom(payload);
        const quotaParsed =
          quota.remainingCredits !== null ||
          quota.concurrencyLimit !== null;
        return {
          provider,
          status: "available",
          message: quotaParsed
            ? "Vidu Key 可用，额度与并发已同步。"
            : "Vidu Key 可用，但接口未返回可识别的额度明细。",
          checkedAt,
          ...quota,
        };
      }

      return {
        provider,
        status: "available",
        message:
          "Gemini Key 可用；配额由 Google Cloud 项目统一管理，API Key 没有独立余额。",
        checkedAt,
        remainingCredits: null,
        concurrencyLimit: null,
        currentConcurrency: null,
        queueCount: null,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        provider,
        status: "unavailable",
        message: `${check.label} Key 鉴权失败（HTTP ${response.status}），请检查 Key 是否失效、被禁用或缺少权限。`,
        checkedAt,
        remainingCredits: null,
        concurrencyLimit: null,
        currentConcurrency: null,
        queueCount: null,
      };
    }

    return {
      provider,
      status: "unknown",
      message: `${check.label} 服务返回 HTTP ${response.status}，暂时无法确认 Key 是否可用。`,
      checkedAt,
      remainingCredits: null,
      concurrencyLimit: null,
      currentConcurrency: null,
      queueCount: null,
    };
  } catch {
    return {
      provider,
      status: "unknown",
      message: `${check.label} 可用性检测超时或网络不可用，请稍后再试。`,
      checkedAt,
      remainingCredits: null,
      concurrencyLimit: null,
      currentConcurrency: null,
      queueCount: null,
    };
  }
}

function viduQuotaFrom(payload: unknown): Pick<
  ProviderQuotaSnapshot,
  | "remainingCredits"
  | "concurrencyLimit"
  | "currentConcurrency"
  | "queueCount"
> {
  if (!payload || typeof payload !== "object") return emptyQuota();
  const remains = findNamedValue(payload, ["remains", "remaining_credits"]);
  const generalRemains = findNamedValue(payload, ["general_remains"]);
  const exclusiveRemains = findNamedValue(payload, ["exclusive_remains"]);
  const packages = findNamedValue(payload, ["packages"]);
  const detailedRemains = [generalRemains, exclusiveRemains];
  const creditCollections = [
    remains,
    generalRemains,
    exclusiveRemains,
    packages,
  ].filter(Array.isArray);
  const explicitlyEmptyCredits =
    creditCollections.length > 0 &&
    creditCollections.every((collection) => collection.length === 0);

  return {
    remainingCredits:
      sumNamedNumbers(remains, ["credit_remain"]) ??
      finiteNumber(remains) ??
      sumNamedNumbers(detailedRemains, ["credit_remain"]) ??
      sumNamedNumbers(packages, ["credit_remain"]) ??
      findNamedNumber(payload, [
        "credit_remain",
        "available_credits",
        "credit_balance",
        "credits_balance",
        "credits_remaining",
        "remain_credits",
      ]) ??
      (explicitlyEmptyCredits ? 0 : null),
    concurrencyLimit:
      sumNamedNumbers(remains, ["concurrency_limit"]) ??
      sumNamedNumbers(detailedRemains, ["concurrency_limit"]) ??
      sumNamedNumbers(packages, ["concurrency"]) ??
      findNamedNumber(payload, ["concurrency_limit"]),
    currentConcurrency:
      sumNamedNumbers(remains, ["current_concurrency"]) ??
      sumNamedNumbers(detailedRemains, ["current_concurrency"]) ??
      findNamedNumber(payload, ["current_concurrency"]),
    queueCount:
      sumNamedNumbers(remains, ["queue_count"]) ??
      findNamedNumber(payload, ["queue_count"]),
  };
}

function findNamedValue(payload: unknown, names: string[]): unknown {
  const queue = [payload];
  const visited = new Set<object>();
  while (queue.length && visited.size < 200) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object") continue;
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    if (!Array.isArray(candidate)) {
      const record = candidate as Record<string, unknown>;
      for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(record, name)) {
          return record[name];
        }
      }
    }
    queue.push(...Object.values(candidate));
  }
  return null;
}

function findNamedNumber(payload: unknown, names: string[]): number | null {
  const value = findNamedValue(payload, names);
  return finiteNumber(value) ?? sumNamedNumbers(value, names);
}

function sumNamedNumbers(payload: unknown, names: string[]): number | null {
  if (!payload || typeof payload !== "object") return null;
  const values: number[] = [];
  const queue = [payload];
  const visited = new Set<object>();
  while (queue.length && visited.size < 200) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object") continue;
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    if (!Array.isArray(candidate)) {
      const record = candidate as Record<string, unknown>;
      for (const name of names) {
        const number = finiteNumber(record[name]);
        if (number !== null) values.push(number);
      }
    }
    queue.push(...Object.values(candidate));
  }
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function finiteNumber(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }
  const normalized =
    typeof value === "string" ? value.replaceAll(",", "").trim() : value;
  const number = typeof normalized === "number" ? normalized : Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function emptyQuota() {
  return {
    remainingCredits: null,
    concurrencyLimit: null,
    currentConcurrency: null,
    queueCount: null,
  };
}

