"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProviderUsagePoint } from "@/lib/account-contracts";

type UsageValueKey = "viduCredits" | "geminiRequests";

export function ProviderUsageChart({
  title,
  description,
  points,
  valueKey,
  unit,
}: {
  title: string;
  description: string;
  points: ProviderUsagePoint[];
  valueKey: UsageValueKey;
  unit: string;
}) {
  const total = points.reduce((sum, point) => sum + point[valueKey], 0);
  const accessibleSummary = points
    .map((point) => `${formatUsageDate(point.date)} ${point[valueKey]} ${unit}`)
    .join("，");

  return (
    <article className="admin-usage-chart">
      <div className="admin-usage-heading">
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <span>
          {total.toLocaleString("zh-CN")} {unit}
        </span>
      </div>
      {points.length ? (
        <div
          className="admin-usage-chart-canvas"
          role="img"
          aria-label={`${title}最近 7 天柱状图：${accessibleSummary}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              accessibilityLayer
              data={points}
              margin={{ top: 8, right: 4, bottom: 0, left: -14 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--line)"
                strokeDasharray="3 5"
              />
              <XAxis
                axisLine={false}
                dataKey="date"
                tick={{ fill: "var(--faint)", fontSize: 9 }}
                tickFormatter={formatUsageDate}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tick={{ fill: "var(--faint)", fontSize: 9 }}
                tickLine={false}
                width={42}
              />
              <Tooltip
                cursor={{ fill: "var(--surface-soft)" }}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--line-strong)",
                  borderRadius: "9px",
                  boxShadow: "0 12px 30px rgb(0 0 0 / 0.16)",
                  color: "var(--ink)",
                  fontSize: "10px",
                }}
                formatter={(value) => [
                  `${Number(value).toLocaleString("zh-CN")} ${unit}`,
                  title,
                ]}
                labelFormatter={(label) => formatUsageDate(String(label))}
              />
              <Bar
                activeBar={{ fill: "var(--success)" }}
                dataKey={valueKey}
                fill="var(--accent)"
                isAnimationActive={false}
                maxBarSize={38}
                radius={[6, 6, 2, 2]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="admin-usage-empty">正在读取最近 7 天消耗…</p>
      )}
    </article>
  );
}

function formatUsageDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
