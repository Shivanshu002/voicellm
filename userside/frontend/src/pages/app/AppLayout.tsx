import { Suspense, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Megaphone, Menu, PhoneCall, Settings, X } from "lucide-react";
import { Logo, Spinner } from "../../components/ui";
import { useAuth } from "../../lib/auth";

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/campaigns", label: "Campaigns", icon: Megaphone, end: false },
  { to: "/app/calls", label: "Call logs", icon: PhoneCall, end: false },
  { to: "/app/settings", label: "Settings", icon: Settings, end: false },
];

export default function AppLayout() {
  const { user, company, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="space-y-1">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
              isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`
          }
        >
          <n.icon size={18} /> {n.label}
        </NavLink>
      ))}
    </nav>
  );

  const account = (
    <div className="border-t border-slate-200 pt-4">
      <p className="truncate text-sm font-semibold">{company?.name}</p>
      <p className="truncate text-xs text-slate-500">{user?.email}</p>
      <button
        onClick={() => {
          signOut();
          navigate("/");
        }}
        className="mt-3 flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
      >
        <LogOut size={16} /> Log out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col justify-between border-r border-slate-200 bg-white p-4 lg:flex">
        <div>
          <Link to="/" className="mb-8 block px-1">
            <Logo />
          </Link>
          {nav}
        </div>
        {account}
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Logo />
        <button onClick={() => setOpen(!open)} aria-label="Menu" className="rounded-lg p-2 hover:bg-slate-100">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>
      {open && (
        <div className="space-y-4 border-b border-slate-200 bg-white p-4 lg:hidden">
          {nav}
          {account}
        </div>
      )}

      <main className="px-4 py-6 lg:ml-60 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">
          {/* inner boundary: switching pages keeps the sidebar on screen */}
          <Suspense fallback={<Spinner />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
