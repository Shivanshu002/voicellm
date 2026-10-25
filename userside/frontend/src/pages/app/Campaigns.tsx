import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Megaphone, Plus, X } from "lucide-react";
import { api } from "../../lib/api";
import { useLoad } from "../../lib/useLoad";
import { Button, CampaignBadge, Card, ErrorBox, Spinner } from "../../components/ui";

export const OPENING_HINT = "Use {name} for the customer's name and {company} for your company name.";

function NewCampaign({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    opening_message: "Hello {name}, this is {company}. Do you have a minute?",
    instructions: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const c = await api.createCampaign(form);
      navigate(`/app/campaigns/${c.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">New campaign</h2>
            <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div>
            <label className="label" htmlFor="cname">Campaign name</label>
            <input id="cname" required minLength={2} className="input" placeholder="Diwali offer"
                   value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="opening">First sentence the agent says</label>
            <input id="opening" className="input" value={form.opening_message}
                   onChange={(e) => setForm({ ...form, opening_message: e.target.value })} />
            <p className="mt-1 text-xs text-slate-500">{OPENING_HINT}</p>
          </div>
          <div>
            <label className="label" htmlFor="goal">What is the call about?</label>
            <textarea id="goal" rows={4} className="input"
                      placeholder="Tell the customer about our Diwali sale (20% off phones until 5 November) and ask if they would like to visit the store."
                      value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
          </div>
          <ErrorBox message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={busy}>Create campaign</Button>
          </div>
        </form>
      </Card>
      </div>
    </div>
  );
}

export default function Campaigns() {
  const { data, error, loading } = useLoad(api.campaigns, [], 5000);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm text-slate-600">Each campaign is one list of numbers and one reason to call.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> New campaign
        </Button>
      </div>
      <ErrorBox message={error} />
      {loading && !data ? (
        <Spinner />
      ) : data?.length ? (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Status</th>
                <th className="hidden px-5 py-3 sm:table-cell">Numbers</th>
                <th className="hidden px-5 py-3 md:table-cell">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((c) => {
                const total = Object.values(c.counts).reduce((a, b) => a + b, 0);
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <Link to={`/app/campaigns/${c.id}`} className="font-medium text-slate-900 hover:text-brand-600">{c.name}</Link>
                    </td>
                    <td className="px-5 py-4"><CampaignBadge status={c.status} /></td>
                    <td className="hidden px-5 py-4 sm:table-cell">{total}</td>
                    <td className="hidden px-5 py-4 md:table-cell">{c.counts.completed ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card className="px-6 py-16 text-center">
          <Megaphone className="mx-auto text-slate-400" size={32} />
          <h2 className="mt-3 font-semibold">No campaigns yet</h2>
          <p className="mt-1 text-sm text-slate-600">Create one, add numbers, and press Run.</p>
          <Button className="mt-5" onClick={() => setCreating(true)}>
            <Plus size={16} /> New campaign
          </Button>
        </Card>
      )}
      {creating && <NewCampaign onClose={() => setCreating(false)} />}
    </div>
  );
}
