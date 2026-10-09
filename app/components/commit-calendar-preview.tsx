"use client";

import { useState } from "react";
import type { CommitCalendar } from "@/lib/commit-calendar";

const colors = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

export function CommitCalendarPreview({
  calendar,
  onRegenerate,
}: {
  calendar: CommitCalendar;
  onRegenerate: () => void;
}) {
  const [selected, setSelected] = useState("");
  const max = Math.max(1, ...calendar.days.map((day) => day.count));
  const years = [...new Set(calendar.days.map((day) => day.date.slice(0, 4)))];
  const selectedDays = new Map(
    calendar.days.map((day) => [day.date, day.count]),
  );
  return (
    <section
      className="mt-6 rounded-xl border border-zinc-200 bg-white p-4"
      aria-label="Generated commit calendar"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Calendar preview</h3>
          <p className="mt-1 text-sm text-zinc-600">
            {calendar.total.toLocaleString("en-US")} commits ·{" "}
            {calendar.activeDays} active days
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Simulated activity · {calendar.timeZone}
          </p>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
        >
          Regenerate
        </button>
      </div>
      {years.map((year) => {
        const days: { date: string; count: number; inRange: boolean }[] = [];
        const nextYear = `${Number(year) + 1}-01-01`;
        for (
          const cursor = new Date(`${year}-01-01T00:00:00Z`);
          cursor.toISOString().slice(0, 10) < nextYear;
          cursor.setUTCDate(cursor.getUTCDate() + 1)
        ) {
          const date = cursor.toISOString().slice(0, 10);
          days.push({
            date,
            count: selectedDays.get(date) ?? 0,
            inRange: selectedDays.has(date),
          });
        }
        const leading = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
        const cells = [...Array.from({ length: leading }, () => null), ...days];
        const columns = Math.ceil(cells.length / 7);
        return (
          <div key={year} className="mt-5">
            <h4 className="mb-2 text-sm font-medium">{year}</h4>
            <div className="overflow-x-auto pb-2">
              <div style={{ width: columns * 15 + 28 }}>
                <div
                  className="ml-7 mb-1 grid gap-[3px] text-[10px] text-zinc-500"
                  style={{ gridTemplateColumns: `repeat(${columns}, 12px)` }}
                >
                  {Array.from({ length: columns }, (_, column) => {
                    const week = cells.slice(column * 7, column * 7 + 7);
                    const first = week.find(
                      (day) =>
                        day && (day.date.endsWith("-01") || day === days[0]),
                    );
                    return (
                      <span
                        key={column}
                        className="overflow-visible whitespace-nowrap"
                      >
                        {first
                          ? new Date(
                              `${first.date}T00:00:00Z`,
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              timeZone: "UTC",
                            })
                          : ""}
                      </span>
                    );
                  })}
                </div>
                <div className="flex gap-1">
                  <div className="grid w-6 grid-rows-7 gap-[3px] text-[9px] leading-3 text-zinc-400">
                    <span />
                    <span>Mon</span>
                    <span />
                    <span>Wed</span>
                    <span />
                    <span>Fri</span>
                    <span />
                  </div>
                  <div
                    className="grid grid-flow-col grid-rows-7 gap-[3px]"
                    style={{ gridTemplateColumns: `repeat(${columns}, 12px)` }}
                  >
                    {cells.map((day, index) => {
                      if (!day)
                        return (
                          <span key={`pad-${index}`} className="h-3 w-3" />
                        );
                      const label = `${day.date}: ${day.count} ${day.count === 1 ? "commit" : "commits"}${day.inRange ? "" : " (outside selected range)"}`;
                      const level =
                        day.count === 0
                          ? 0
                          : Math.min(4, Math.ceil((day.count / max) * 4));
                      return (
                        <button
                          key={day.date}
                          type="button"
                          title={label}
                          aria-label={label}
                          onFocus={() => setSelected(label)}
                          onMouseEnter={() => setSelected(label)}
                          onClick={() => setSelected(label)}
                          className="h-3 w-3 rounded-[2px] border border-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
                          style={{ backgroundColor: colors[level] }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div
        className="mt-3 flex justify-end gap-1"
        aria-label="Color scale from zero to more commits"
      >
        {colors.map((color, index) => (
          <span
            key={color}
            title={index === 0 ? "No commits" : `Activity level ${index}`}
            className="h-3 w-3 rounded-[2px]"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <p role="status" className="mt-2 min-h-5 text-xs text-zinc-600">
        {selected || "Hover, tap, or focus a day to see its count."}
      </p>
      <p className="mt-2 break-all text-xs text-zinc-500">
        Seed: {calendar.seed}. The preview updates automatically when settings
        change. Nothing has been published.
      </p>
    </section>
  );
}
