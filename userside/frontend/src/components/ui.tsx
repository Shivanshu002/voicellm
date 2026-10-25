import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AudioLines, Loader2 } from "lucide-react";
import type { CampaignStatus, ContactStatus } from "../lib/api";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-bold tracking-tight">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <AudioLines size={18} />
      </span>
      <span className={light ? "text-white" : "text-slate-900"}>
        Voice<span className="text-brand-600">LLM</span>
      </span>
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
};

const VARIANTS = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  ghost: "text-slate-600 hover:bg-slate-100",
};

export function Button({ variant = "primary", loading, className = "", children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition
        disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Spinner() {
  return <Loader2 className="animate-spin text-brand-600" size={28} />;
}

export function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

const CAMPAIGN_STYLES: Record<CampaignStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  running: "bg-green-100 text-green-800",
  paused: "bg-amber-100 text-amber-800",
  completed: "bg-brand-100 text-brand-800",
};

export function CampaignBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${CAMPAIGN_STYLES[status]}`}>
      {status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-600" />}
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}

export const CONTACT_LABELS: Record<ContactStatus, string> = {
  pending: "Waiting",
  dialing: "Ringing",
  in_progress: "On call",
  completed: "Completed",
  no_answer: "No answer",
  busy: "Busy",
  failed: "Failed",
  skipped_dnd: "Do not call",
};

const CONTACT_STYLES: Record<ContactStatus, string> = {
  pending: "bg-slate-100 text-slate-700",
  dialing: "bg-amber-100 text-amber-800",
  in_progress: "bg-green-100 text-green-800",
  completed: "bg-brand-100 text-brand-800",
  no_answer: "bg-orange-100 text-orange-800",
  busy: "bg-orange-100 text-orange-800",
  failed: "bg-red-100 text-red-700",
  skipped_dnd: "bg-slate-200 text-slate-600",
};

export function ContactBadge({ status }: { status: ContactStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${CONTACT_STYLES[status]}`}>
      {CONTACT_LABELS[status]}
    </span>
  );
}

export function timeAgo(iso: string | null) {
  if (!iso) return "";
  // the API sends UTC without a zone suffix
  const t = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z").getTime();
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function formatDuration(seconds: number) {
  if (!seconds) return "–";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}
