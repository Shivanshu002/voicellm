import { useRef, useState, type DragEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileSpreadsheet,
  MessageSquareText,
  Pause,
  Play,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { api, downloadBlob, type Campaign, type Contact, type ContactStatus, type ImportResult } from "../../lib/api";
import { useLoad } from "../../lib/useLoad";
import TranscriptDrawer from "../../components/TranscriptDrawer";
import {
  Button,
  CampaignBadge,
  Card,
  CONTACT_LABELS,
  ContactBadge,
  ErrorBox,
  Spinner,
  formatDuration,
} from "../../components/ui";
import { OPENING_HINT } from "./Campaigns";

function downloadTemplate() {
  // "﻿" so Excel opens it as UTF-8
  const csv = "﻿phone,name\n9876543210,Ravi Kumar\n+91 91234 56789,Asha\n";
  downloadBlob(new Blob([csv], { type: "text/csv" }), "voicellm_numbers_template.csv");
}

function ImportSummary({ r }: { r: ImportResult }) {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
      <strong>{r.added}</strong> added
      {r.duplicates > 0 && <> · {r.duplicates} already in the list</>}
      {r.invalid > 0 && (
        <> · {r.invalid} not valid numbers{r.invalid_samples.length > 0 && <> (e.g. {r.invalid_samples.join(", ")})</>}</>
      )}
    </div>
  );
}

function AddNumbers({ campaign, onAdded }: { campaign: Campaign; onAdded: () => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(p: Promise<ImportResult>) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await p);
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function upload(file: File | undefined) {
    if (file) run(api.uploadContacts(campaign.id, file));
    if (fileRef.current) fileRef.current.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    upload(e.dataTransfer.files[0]);
  }

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Add numbers</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
            drag ? "border-brand-500 bg-brand-50" : "border-slate-300 hover:border-brand-400 hover:bg-slate-50"
          }`}
        >
          <FileSpreadsheet className="text-brand-600" />
          <p className="mt-2 text-sm font-semibold">Upload Excel or CSV</p>
          <p className="mt-1 text-xs text-slate-500">
            A column named <em>phone</em> / <em>mobile</em> (and optionally <em>name</em>), or numbers in the first column
          </p>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        </div>
        <div className="flex flex-col">
          <textarea
            rows={5}
            className="input flex-1 font-mono"
            placeholder={"9876543210, Ravi\n+91 91234 56789\n7000000001"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button
            variant="secondary"
            className="mt-2 self-end"
            disabled={!text.trim()}
            loading={busy}
            onClick={() => run(api.addContacts(campaign.id, text).then((r) => (setText(""), r)))}
          >
            <Upload size={16} /> Add pasted numbers
          </Button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {result && <ImportSummary r={result} />}
        <ErrorBox message={error} />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Not sure about the format?{" "}
        <button onClick={downloadTemplate} className="font-semibold text-brand-600 hover:underline">Download a sample sheet</button>.
        Only call people who agreed to be contacted; numbers on your do-not-call list are skipped automatically.
      </p>
    </Card>
  );
}

function Script({ campaign, onSaved }: { campaign: Campaign; onSaved: (c: Campaign) => void }) {
  const [form, setForm] = useState({ opening_message: campaign.opening_message, instructions: campaign.instructions });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const dirty = form.opening_message !== campaign.opening_message || form.instructions !== campaign.instructions;

  async function save() {
    setBusy(true);
    setError("");
    try {
      onSaved(await api.updateCampaign(campaign.id, form));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="font-semibold">What the agent says</h2>
      <div className="mt-4 space-y-4">
        <div>
          <label className="label" htmlFor="opening">First sentence</label>
          <input id="opening" className="input" value={form.opening_message}
                 onChange={(e) => setForm({ ...form, opening_message: e.target.value })} />
          <p className="mt-1 text-xs text-slate-500">{OPENING_HINT}</p>
        </div>
        <div>
          <label className="label" htmlFor="instructions">What is the call about?</label>
          <textarea id="instructions" rows={4} className="input" value={form.instructions}
                    onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
        </div>
        <ErrorBox message={error} />
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-green-700">Saved</span>}
          <Button variant="secondary" disabled={!dirty} loading={busy} onClick={save}>Save changes</Button>
        </div>
      </div>
    </Card>
  );
}

export default function CampaignDetail() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const campaign = useLoad(() => api.campaign(id), [id], 3000);
  const contacts = useLoad(() => api.contacts(id), [id], 3000);
  const [filter, setFilter] = useState<ContactStatus | "">("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Contact | null>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");

  const c = campaign.data;
  if (campaign.loading && !c) return <Spinner />;
  if (!c) return <ErrorBox message={campaign.error || "Campaign not found"} />;

  const counts = c.counts;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const left = (counts.pending ?? 0) + (counts.dialing ?? 0) + (counts.in_progress ?? 0);
  const retryable = (counts.no_answer ?? 0) + (counts.busy ?? 0) + (counts.failed ?? 0);
  const pct = total ? Math.round(((total - left) / total) * 100) : 0;
  const needle = search.trim().toLowerCase();
  const list = (contacts.data ?? []).filter(
    (x) => (!filter || x.status === filter) &&
      (!needle || x.phone.includes(needle) || x.name.toLowerCase().includes(needle)),
  );
  const live = open && contacts.data?.find((x) => x.id === open.id);

  async function act(name: string, fn: () => Promise<Campaign | void>) {
    setBusy(name);
    setActionError("");
    try {
      const r = await fn();
      if (r) campaign.setData(r);
      contacts.reload();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/app/campaigns" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft size={16} /> Campaigns
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
            <CampaignBadge status={c.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">{total} numbers · {left} left to call</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.status === "running" ? (
            <Button variant="secondary" loading={busy === "pause"} onClick={() => act("pause", () => api.pauseCampaign(id))}>
              <Pause size={16} /> Pause
            </Button>
          ) : (
            <Button loading={busy === "start"} disabled={!counts.pending} onClick={() => act("start", () => api.startCampaign(id))}>
              <Play size={16} /> Run
            </Button>
          )}
          {total > 0 && (
            <Button variant="secondary" loading={busy === "export"} onClick={() => act("export", () => api.exportCsv(id))}>
              <Download size={16} /> Export results
            </Button>
          )}
          {retryable > 0 && c.status !== "running" && (
            <Button variant="secondary" loading={busy === "retry"} onClick={() => act("retry", () => api.retryCampaign(id))}>
              <RotateCcw size={16} /> Retry {retryable} unreached
            </Button>
          )}
          <Button
            variant="ghost"
            loading={busy === "delete"}
            onClick={() => {
              if (confirm(`Delete "${c.name}" and all its numbers and transcripts?`))
                act("delete", async () => {
                  await api.deleteCampaign(id);
                  navigate("/app/campaigns");
                });
            }}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>
      <ErrorBox message={actionError} />
      {c.notice && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>
            {c.notice}{" "}
            {c.notice.startsWith("Outside") && (
              <Link to="/app/settings" className="font-semibold underline">Open Settings</Link>
            )}
          </span>
        </div>
      )}

      {total > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Progress</span>
            <span className="text-slate-600">{pct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["", ...Object.keys(CONTACT_LABELS)] as (ContactStatus | "")[])
              .filter((s) => !s || counts[s])
              .map((s) => (
                <button
                  key={s || "all"}
                  onClick={() => setFilter(s)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    filter === s ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {s ? CONTACT_LABELS[s] : "All"} {s ? counts[s] : total}
                </button>
              ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <AddNumbers campaign={c} onAdded={() => { campaign.reload(); contacts.reload(); }} />
        <Script key={c.id} campaign={c} onSaved={(x) => campaign.setData(x)} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold">Numbers</h2>
          <div className="flex items-center gap-4">
            {(counts.pending ?? 0) > 0 && c.status !== "running" && (
              <button
                className="whitespace-nowrap text-sm font-medium text-slate-500 hover:text-red-600"
                onClick={() => confirm("Remove all numbers that have not been called yet?") &&
                  act("clear", () => api.clearPending(id))}
              >
                Remove uncalled
              </button>
            )}
            {total > 0 && (
              <div className="relative w-full sm:w-56">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input py-1.5 pl-8" placeholder="Search number or name"
                       value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            )}
          </div>
        </div>
        {list.length ? (
          <div className="max-h-[32rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Number</th>
                  <th className="hidden px-5 py-3 sm:table-cell">Name</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="hidden px-5 py-3 md:table-cell">Duration</th>
                  <th className="px-5 py-3 text-right">Conversation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((x) => (
                  <tr key={x.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono">{x.phone}</td>
                    <td className="hidden px-5 py-3 sm:table-cell">{x.name || "–"}</td>
                    <td className="px-5 py-3"><ContactBadge status={x.status} /></td>
                    <td className="hidden px-5 py-3 md:table-cell">{formatDuration(x.duration_seconds)}</td>
                    <td className="px-5 py-3 text-right">
                      {x.status !== "pending" && x.status !== "skipped_dnd" ? (
                        <button onClick={() => setOpen(x)} className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
                          <MessageSquareText size={14} /> View
                        </button>
                      ) : x.status === "pending" && c.status !== "running" ? (
                        <button onClick={() => act("del", () => api.deleteContact(id, x.id))}
                                className="text-slate-400 hover:text-red-600" aria-label="Remove number">
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            {total ? "No numbers match." : "No numbers yet – upload a sheet or paste numbers above."}
          </p>
        )}
      </Card>

      {open && <TranscriptDrawer contact={live || open} onClose={() => setOpen(null)} />}
    </div>
  );
}
