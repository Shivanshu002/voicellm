import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Megaphone,
  MessageSquareText,
  PhoneCall,
  PhoneMissed,
  PhoneOutgoing,
} from "lucide-react";
import { api, type CallLog } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useLoad } from "../../lib/useLoad";
import ActivityChart from "../../components/ActivityChart";
import TranscriptDrawer from "../../components/TranscriptDrawer";
import { CampaignBadge, Card, ContactBadge, ErrorBox, Spinner, formatDuration, timeAgo } from "../../components/ui";

function Stat({ icon: Icon, label, value, hint }: { icon: typeof PhoneCall; label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <Icon size={16} /> {label}
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

function Checklist({ steps }: { steps: { done: boolean; label: string; to: string }[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Get your first campaign calling</h2>
        <span className="text-sm text-slate-500">{done} of {steps.length} done</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.label}>
            <Link to={s.to} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
              s.done ? "text-slate-400 line-through" : "font-medium text-slate-800 hover:bg-slate-50"}`}>
              {s.done ? <CheckCircle2 size={18} className="text-green-600" /> : <Circle size={18} className="text-slate-300" />}
              {s.label}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default function Dashboard() {
  const { company, user } = useAuth();
  const stats = useLoad(api.stats, [], 5000);
  const campaigns = useLoad(api.campaigns, [], 10000);
  const activity = useLoad(() => api.activity(14), [], 30000);
  const recent = useLoad(() => api.calls({ limit: 6 }), [], 5000);
  const [open, setOpen] = useState<CallLog | null>(null);

  if (stats.loading && !stats.data) return <Spinner />;
  const s = stats.data;
  const by = s?.by_status ?? {};
  const answered = (by.completed ?? 0) + (by.in_progress ?? 0);
  const missed = (by.no_answer ?? 0) + (by.busy ?? 0) + (by.failed ?? 0);
  const rate = answered + missed ? Math.round((answered / (answered + missed)) * 100) : null;
  const firstCampaign = campaigns.data?.[campaigns.data.length - 1];

  const steps = [
    { done: Boolean(company?.business_info.trim()), label: "Describe your business", to: "/app/settings" },
    { done: (campaigns.data?.length ?? 0) > 0, label: "Create a campaign", to: "/app/campaigns" },
    { done: (s?.contacts ?? 0) > 0, label: "Add numbers", to: firstCampaign ? `/app/campaigns/${firstCampaign.id}` : "/app/campaigns" },
    { done: answered + missed > 0, label: "Press Run", to: firstCampaign ? `/app/campaigns/${firstCampaign.id}` : "/app/campaigns" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hello, {user?.name.split(" ")[0]}</h1>
        <p className="text-sm text-slate-600">Here is how {company?.name}'s calls are going.</p>
      </div>
      <ErrorBox message={stats.error} />

      {s?.dialer.last_error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" /> {s.dialer.last_error}
        </div>
      )}
      {s && !s.in_call_window && s.running_campaigns > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Clock size={18} className="mt-0.5 shrink-0" />
          <span>
            Outside your calling hours – running campaigns continue at {company?.call_window_start}:00.{" "}
            <Link to="/app/settings" className="font-semibold underline">Change hours</Link>
          </span>
        </div>
      )}

      <Checklist steps={steps} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={PhoneOutgoing} label="Numbers" value={s?.contacts ?? 0} hint={`${by.pending ?? 0} waiting to be called`} />
        <Stat icon={PhoneCall} label="Answered" value={answered}
              hint={rate === null ? "no calls yet" : `${rate}% answer rate · ${by.in_progress ?? 0} on call now`} />
        <Stat icon={PhoneMissed} label="Not reached" value={missed} hint="no answer, busy or failed" />
        <Stat icon={Clock} label="Talk time" value={formatDuration(s?.talk_seconds ?? 0)}
              hint={answered ? `avg ${formatDuration(Math.round((s?.talk_seconds ?? 0) / answered))} per call` : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <h2 className="font-semibold">Calls in the last 14 days</h2>
          <div className="mt-4">
            {activity.data ? <ActivityChart days={activity.data} /> : <Spinner />}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Latest conversations</h2>
            <Link to="/app/calls" className="text-sm font-semibold text-brand-600 hover:underline">All calls</Link>
          </div>
          {recent.data?.items.length ? (
            <ul className="divide-y divide-slate-100">
              {recent.data.items.map((c) => (
                <li key={c.id}>
                  <button onClick={() => setOpen(c)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-slate-50">
                    <MessageSquareText size={16} className="mt-0.5 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{c.name || c.phone}</span>
                        <ContactBadge status={c.status} />
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {c.transcript[0]?.user ? `“${c.transcript[0].user}”` : c.campaign_name} · {timeAgo(c.called_at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-500">Conversations appear here after the first call.</p>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold">Campaigns</h2>
          <Link to="/app/campaigns" className="text-sm font-semibold text-brand-600 hover:underline">View all</Link>
        </div>
        {campaigns.data?.length ? (
          <ul className="divide-y divide-slate-100">
            {campaigns.data.slice(0, 5).map((c) => {
              const total = Object.values(c.counts).reduce((a, b) => a + b, 0);
              const done = total - (c.counts.pending ?? 0) - (c.counts.dialing ?? 0) - (c.counts.in_progress ?? 0);
              return (
                <li key={c.id}>
                  <Link to={`/app/campaigns/${c.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <div className="mt-1.5 flex items-center gap-3">
                        <div className="h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-brand-600" style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
                        </div>
                        <span className="whitespace-nowrap text-xs text-slate-500">{done}/{total}</span>
                      </div>
                    </div>
                    <CampaignBadge status={c.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-5 py-12 text-center">
            <Megaphone className="mx-auto text-slate-400" />
            <p className="mt-2 text-sm text-slate-600">No campaigns yet.</p>
            <Link to="/app/campaigns" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
              Create your first campaign <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </Card>

      {open && (
        <TranscriptDrawer contact={open} campaign={{ id: open.campaign_id, name: open.campaign_name }} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
