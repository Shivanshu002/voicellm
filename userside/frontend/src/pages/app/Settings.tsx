import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useLoad } from "../../lib/useLoad";
import { Button, Card, ErrorBox } from "../../components/ui";

const HOURS = Array.from({ length: 25 }, (_, h) => h);
const hourLabel = (h: number) => (h === 0 || h === 24 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`);

function CompanyForm() {
  const { company, setCompany } = useAuth();
  const [form, setForm] = useState({
    name: company!.name,
    business_info: company!.business_info,
    max_concurrent_calls: company!.max_concurrent_calls,
    call_window_start: company!.call_window_start,
    call_window_end: company!.call_window_end,
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setCompany(await api.updateCompany(form));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="label" htmlFor="cname">Company name</label>
          <input id="cname" required minLength={2} className="input" value={form.name}
                 onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <p className="mt-1 text-xs text-slate-500">The agent introduces itself with this name.</p>
        </div>
        <div>
          <label className="label" htmlFor="info">Business details the agent may use</label>
          <textarea id="info" rows={8} className="input"
                    placeholder={"Hours: Monday to Saturday 10 AM to 8 PM, Sunday 11 AM to 5 PM.\nAddress: Shop 12, Main Market.\nPayment: cash, UPI, cards.\nReturns: within 7 days with the bill."}
                    value={form.business_info} onChange={(e) => setForm({ ...form, business_info: e.target.value })} />
          <p className="mt-1 text-xs text-slate-500">
            The agent only answers from these facts and the campaign's description. Keep it short and factual.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="from">Call from</label>
            <select id="from" className="input" value={form.call_window_start}
                    onChange={(e) => setForm({ ...form, call_window_start: Number(e.target.value) })}>
              {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="to">Until</label>
            <select id="to" className="input" value={form.call_window_end}
                    onChange={(e) => setForm({ ...form, call_window_end: Number(e.target.value) })}>
              {HOURS.slice(1).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="conc">Calls at the same time</label>
            <input id="conc" type="number" min={1} max={20} className="input" value={form.max_concurrent_calls}
                   onChange={(e) => setForm({ ...form, max_concurrent_calls: Number(e.target.value) })} />
          </div>
        </div>
        <p className="text-xs text-slate-500">Times are Indian Standard Time. The server may allow fewer parallel calls than set here.</p>
        <ErrorBox message={error} />
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-green-700">Saved</span>}
          <Button type="submit" loading={busy}>Save</Button>
        </div>
      </form>
    </Card>
  );
}

function DndList() {
  const { data, error, reload } = useLoad(api.dnd, []);
  const [phone, setPhone] = useState("");
  const [addError, setAddError] = useState("");

  async function add(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    try {
      await api.addDnd(phone);
      setPhone("");
      reload();
    } catch (err) {
      setAddError((err as Error).message);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="font-semibold">Do-not-call list</h2>
      <p className="mt-1 text-sm text-slate-600">
        These numbers are never called. People who ask the agent not to call again are added automatically.
      </p>
      <form onSubmit={add} className="mt-4 flex gap-2">
        <input className="input" placeholder="9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!phone.trim()}>Add</Button>
      </form>
      <div className="mt-2">
        <ErrorBox message={addError || error} />
      </div>
      {data && data.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {data.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>
                <span className="font-mono">{d.phone}</span>
                <span className="ml-2 text-slate-500">{d.reason}</span>
              </span>
              <button onClick={() => api.deleteDnd(d.id).then(reload)} className="text-slate-400 hover:text-red-600" aria-label="Remove">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const welcome = params.get("welcome") === "1";
  useEffect(() => {
    if (welcome) window.scrollTo(0, 0);
  }, [welcome]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-600">Your company details, calling hours and do-not-call list.</p>
      </div>
      {welcome && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
          <p>
            <strong>Welcome!</strong> Start by describing your business below – the agent uses it to answer questions.
            Then create a campaign and add numbers.
          </p>
          <button onClick={() => setParams({})} className="font-semibold hover:underline">Dismiss</button>
        </div>
      )}
      <CompanyForm />
      <DndList />
    </div>
  );
}
