import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, ErrorBox } from "../components/ui";
import AuthShell from "./AuthShell";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from || "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      signIn(await api.login({ email, password }));
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your company workspace."
      footer={<>New here? <Link to="/register" className="font-semibold text-brand-600 hover:underline">Create an account</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Work email</label>
          <input id="email" type="email" required autoComplete="email" className="input"
                 value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" required autoComplete="current-password" className="input"
                 value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <ErrorBox message={error} />
        <Button type="submit" loading={busy} className="w-full">Log in</Button>
      </form>
    </AuthShell>
  );
}
