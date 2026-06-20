"use client";

import { HISTORY_PERIODS, type CustomRange, type HistoryPeriod } from "@/lib/market/history";

export function PeriodSelector({
  period,
  customRange,
  onPeriodChange,
  onCustomRangeChange,
}: {
  period: HistoryPeriod;
  customRange: CustomRange;
  onPeriodChange: (period: HistoryPeriod) => void;
  onCustomRangeChange: (range: CustomRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-[8px]">
      <div className="inline-flex rounded-[8px] border border-[var(--border)] bg-[var(--surface3)] p-[3px]">
        {HISTORY_PERIODS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`rounded-[6px] px-[10px] py-[6px] text-[12px] font-semibold transition ${
              period === item.value
                ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow)]"
                : "text-[var(--text2)] hover:text-[var(--text)]"
            }`}
            onClick={() => onPeriodChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {period === "custom" ? (
        <div className="flex flex-wrap items-center gap-[7px]">
          <input
            className="input h-[34px] w-[142px] px-[10px] py-0 text-[12px]"
            type="date"
            value={customRange.from ?? ""}
            onChange={(event) => onCustomRangeChange({ ...customRange, from: event.target.value })}
          />
          <input
            className="input h-[34px] w-[142px] px-[10px] py-0 text-[12px]"
            type="date"
            value={customRange.to ?? ""}
            onChange={(event) => onCustomRangeChange({ ...customRange, to: event.target.value })}
          />
        </div>
      ) : null}
    </div>
  );
}
