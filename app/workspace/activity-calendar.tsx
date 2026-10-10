"use client";

import { useState } from "react";
import type { CommitCalendar } from "@/lib/commit-calendar";

export function ActivityCalendar({ calendar }: { calendar: CommitCalendar }) {
  const [selected, setSelected] = useState("");
  const max = Math.max(1, ...calendar.days.map((day) => day.count));
  const sections =
    calendar.days.length <= 370
      ? [{ label: "", days: calendar.days }]
      : [...new Set(calendar.days.map((day) => day.date.slice(0, 4)))].map(
          (year) => ({
            label: year,
            days: calendar.days.filter((day) => day.date.startsWith(year)),
          }),
        );
  return (
    <>
      {sections.map(({ label, days }) => {
        const leading = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
        const cells = [...Array.from({ length: leading }, () => null), ...days];
        const columns = Math.ceil(cells.length / 7);
        return (
          <div key={label} className="activity-calendar-section">
            {label && <h3>{label}</h3>}
            <div
              className="activity-calendar-scroll"
              tabIndex={0}
              aria-label={
                label
                  ? `${label} activity calendar, scroll to view all dates`
                  : "Activity calendar, scroll to view all dates"
              }
            >
              <div
                className="activity-calendar-inner"
                style={{ width: columns * 12 + (columns - 1) * 4 + 38 }}
              >
                <div
                  className="activity-months"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, 12px)`,
                  }}
                >
                  {Array.from({ length: columns }, (_, index) => {
                    const first = cells
                      .slice(index * 7, index * 7 + 7)
                      .find(
                        (day) =>
                          day && (day.date.endsWith("-01") || day === days[0]),
                      );
                    return (
                      <span key={index}>
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
                <div className="activity-calendar-body">
                  <div className="activity-weekdays" aria-hidden="true">
                    <span />
                    <span>Mon</span>
                    <span />
                    <span>Wed</span>
                    <span />
                    <span>Fri</span>
                    <span />
                  </div>
                  <div
                    className="activity-cells"
                    style={{
                      gridTemplateColumns: `repeat(${columns}, 12px)`,
                    }}
                  >
                    {cells.map((day, index) => {
                      if (!day) return <span key={`pad-${index}`} />;
                      const level = day.count
                        ? Math.min(4, Math.ceil((day.count / max) * 4))
                        : 0;
                      const text = `${day.date} · ${day.count} ${day.count === 1 ? "commit" : "commits"}`;
                      return (
                        <button
                          key={day.date}
                          type="button"
                          className={`activity-cell activity-level-${level}`}
                          title={text}
                          aria-label={text}
                          onMouseEnter={() => setSelected(text)}
                          onFocus={() => setSelected(text)}
                          onClick={() => setSelected(text)}
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
      <div className="activity-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className={`activity-cell activity-level-${level}`}
            aria-hidden="true"
          />
        ))}
        <span>More</span>
      </div>
      <p className="activity-day-detail" role="status">
        {selected || "Hover, tap, or focus a day to see its count."}
      </p>
    </>
  );
}
