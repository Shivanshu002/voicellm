import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, PhoneCall, Search } from "lucide-react";
import { api, type CallLog } from "../../lib/api";
import { useLoad } from "../../lib/useLoad";
import TranscriptDrawer from "../../components/TranscriptDrawer";
import { Card, ContactBadge, ErrorBox, Spinner, formatDuration, timeAgo } from "../../components/ui";

const PAGE = 25;
const FILTERS = [
  { value: "", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "On call" },
  { value: "not_reached", label: "Not reached" },
];

export default function Calls() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<CallLog | null>(null);

  // search after the user stops typing
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(input);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data, error, loading } = useLoad(
    () => api.calls({ q, status, limit: PAGE, offset: page * PAGE }),
    [q, status, page],
    5000,
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Call logs</h1>
        <p className="text-sm text-slate-600">Every call from every campaign. Search by number, name or anything that was said.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search calls…" value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setStatus(f.value);
                setPage(0);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                status === f.value ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <ErrorBox message={error} />

      {loading && !data ? (
        <Spinner />
      ) : data?.items.length ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="hidden px-5 py-3 md:table-cell">Campaign</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="hidden px-5 py-3 sm:table-cell">Duration</th>
                  <th className="hidden px-5 py-3 lg:table-cell">First thing they said</th>
                  <th className="px-5 py-3 text-right">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((c) => (
                  <tr key={c.id} onClick={() => setOpen(c)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-medium">{c.name || <span className="font-mono">{c.phone}</span>}</p>
                      {c.name && <p className="font-mono text-xs text-slate-500">{c.phone}</p>}
                    </td>
                    <td className="hidden px-5 py-3 md:table-cell">
                      <Link to={`/app/campaigns/${c.campaign_id}`} onClick={(e) => e.stopPropagation()} className="hover:text-brand-600 hover:underline">
                        {c.campaign_name}
                      </Link>
                    </td>
                    <td className="px-5 py-3"><ContactBadge status={c.status} /></td>
                    <td className="hidden px-5 py-3 tabular-nums sm:table-cell">{formatDuration(c.duration_seconds)}</td>
                    <td className="hidden max-w-xs truncate px-5 py-3 text-slate-600 lg:table-cell">{c.transcript[0]?.user || "–"}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-slate-500">{timeAgo(c.called_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
            <span>{data.total} calls</span>
            <div className="flex items-center gap-2">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}
                      className="rounded p-1 hover:bg-slate-100 disabled:opacity-40" aria-label="Previous page">
                <ChevronLeft size={18} />
              </button>
              <span>Page {page + 1} of {pages}</span>
              <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}
                      className="rounded p-1 hover:bg-slate-100 disabled:opacity-40" aria-label="Next page">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="px-6 py-16 text-center">
          <PhoneCall className="mx-auto text-slate-400" size={32} />
          <p className="mt-3 text-sm text-slate-600">{q || status ? "No calls match your search." : "No calls yet – run a campaign to see them here."}</p>
        </Card>
      )}

      {open && (
        <TranscriptDrawer contact={open} campaign={{ id: open.campaign_id, name: open.campaign_name }} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
