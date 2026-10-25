import { useState } from "react";
import type { ActivityDay } from "../lib/api";

// validated pair (dataviz validator, light surface): CVD ΔE 39, normal ΔE 47.
// Amber is < 3:1 on white, so the chart always ships the table view below.
const SERIES = [
  { key: "answered", label: "Answered", color: "#2550eb" },
  { key: "not_reached", label: "Not reached", color: "#f59e0b" },
] as const;

const HEIGHT = 160;

function niceMax(n: number) {
  if (n <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(n)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= n) return m * step;
  return 10 * step;
}

const dayLabel = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function ActivityChart({ days }: { days: ActivityDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = niceMax(Math.max(...days.map((d) => d.answered + d.not_reached), 0));
  const ticks = [0, max / 2, max];
  const total = days.reduce((a, d) => a + d.answered + d.not_reached, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs text-slate-600">
          {SERIES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
        <button onClick={() => setTable(!table)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
          {table ? "Show chart" : "Show as table"}
        </button>
      </div>

      {table ? (
        <div className="max-h-56 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="py-1">Day</th><th className="py-1 text-right">Answered</th><th className="py-1 text-right">Not reached</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {days.slice().reverse().map((d) => (
                <tr key={d.date}>
                  <td className="py-1.5">{dayLabel(d.date)}</td>
                  <td className="py-1.5 text-right tabular-nums">{d.answered}</td>
                  <td className="py-1.5 text-right tabular-nums">{d.not_reached}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative pl-8">
          {/* recessive grid + y labels */}
          {ticks.map((t) => (
            <div key={t} className="absolute left-0 right-0 flex items-center" style={{ bottom: 20 + (t / max) * HEIGHT }}>
              <span className="w-7 pr-1 text-right text-[10px] tabular-nums text-slate-400">{t}</span>
              <span className={`flex-1 border-t ${t === 0 ? "border-slate-300" : "border-dashed border-slate-100"}`} />
            </div>
          ))}
          <div className="relative flex items-end gap-1" style={{ height: HEIGHT + 20 }}>
            {days.map((d, i) => {
              const sum = d.answered + d.not_reached;
              return (
                <div
                  key={d.date}
                  className="relative flex h-full flex-1 flex-col justify-end pb-5"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  {hover === i && <div className="absolute inset-x-0 bottom-5 top-0 rounded bg-slate-100/70" />}
                  <div className="relative mx-auto flex w-full max-w-[22px] flex-col-reverse gap-[2px]">
                    {SERIES.map((s, si) => {
                      const v = d[s.key];
                      if (!v) return null;
                      const isTop = si === SERIES.length - 1 || !d[SERIES[si + 1].key];
                      return (
                        <div
                          key={s.key}
                          style={{ height: Math.max(3, (v / max) * HEIGHT), background: s.color }}
                          className={isTop ? "rounded-t" : ""}
                        />
                      );
                    })}
                  </div>
                  <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-slate-400 ${
                    i % 2 === (days.length - 1) % 2 ? "" : "hidden sm:inline"}`}>
                    {dayLabel(d.date).split(" ")[0]}
                  </span>
                  {hover === i && (
                    <div className={`pointer-events-none absolute bottom-full z-10 mb-1 w-36 rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-lg ${
                      i > days.length / 2 ? "right-0" : "left-0"}`}>
                      <p className="font-semibold text-slate-900">{dayLabel(d.date)}</p>
                      {SERIES.map((s) => (
                        <p key={s.key} className="mt-1 flex items-center justify-between text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} /> {s.label}
                          </span>
                          <span className="font-semibold tabular-nums text-slate-900">{d[s.key]}</span>
                        </p>
                      ))}
                      <p className="mt-1 border-t border-slate-100 pt-1 text-slate-500">Total {sum}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {total === 0 && (
            <p className="absolute inset-0 flex items-center justify-center pb-6 text-sm text-slate-400">No calls in this period yet</p>
          )}
        </div>
      )}
    </div>
  );
}
