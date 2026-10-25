import { useEffect } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import type { Contact } from "../lib/api";
import { ContactBadge, formatDuration } from "./ui";

/** Side panel with one call's conversation. */
export default function TranscriptDrawer({ contact, campaign, onClose }: {
  contact: Contact;
  campaign?: { id: number; name: string };
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const live = contact.status === "dialing" || contact.status === "in_progress";
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Conversation"
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold">{contact.name || contact.phone}</h2>
            {contact.name && <p className="font-mono text-sm text-slate-500">{contact.phone}</p>}
            {campaign && (
              <Link to={`/app/campaigns/${campaign.id}`} className="text-sm text-brand-600 hover:underline">
                {campaign.name}
              </Link>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <ContactBadge status={contact.status} />
          <span>Duration {formatDuration(contact.duration_seconds)}</span>
          <span>Attempts {contact.attempts}</span>
        </div>
        {contact.error && <p className="mt-3 text-sm text-red-700">{contact.error}</p>}
        <div className="mt-6 space-y-3 text-sm">
          {contact.transcript.length === 0 && (
            <p className="text-slate-500">{live ? "The call is in progress…" : "Nothing was said on this call."}</p>
          )}
          {contact.transcript.map((t, i) => (
            <div key={i} className="space-y-3">
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-slate-900 px-3.5 py-2 text-white">{t.user}</p>
              </div>
              <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-brand-50 px-3.5 py-2 text-slate-800">{t.agent}</p>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
