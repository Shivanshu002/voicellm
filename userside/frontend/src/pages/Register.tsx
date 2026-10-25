import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, ErrorBox } from "../components/ui";
import AuthShell from "./AuthShell";

export default function Register() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ company_name: "", name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      signIn(await api.register(form));
      navigate("/app/settings?welcome=1", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your company account"
      subtitle="Your own private workspace for campaigns, numbers and results."
      footer={<>Already registered? <Link to="/login" className="font-semibold text-brand-600 hover:underline">Log in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="company">Company name</label>
          <input id="company" required minLength={2} className="input" placeholder="Sharma Electronics"
                 value={form.company_name} onChange={set("company_name")} />
        </div>
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input id="name" required minLength={2} autoComplete="name" className="input"
                 value={form.name} onChange={set("name")} />
        </div>
        <div>
          <label className="label" htmlFor="email">Work email</label>
          <input id="email" type="email" required autoComplete="email" className="input"
                 value={form.email} onChange={set("email")} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" required minLength={8} autoComplete="new-password" className="input"
                 value={form.password} onChange={set("password")} />
          <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
        </div>
        <ErrorBox message={error} />
        <Button type="submit" loading={busy} className="w-full">Create account</Button>
      </form>
    </AuthShell>
  );
}
