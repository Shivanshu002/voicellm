import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../components/ui";

export default function AuthShell({ title, subtitle, children, footer }: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Link to="/" className="mb-8">
        <Logo />
      </Link>
      <div className="card w-full max-w-md p-8">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-6 text-sm text-slate-600">{footer}</p>
    </div>
  );
}
