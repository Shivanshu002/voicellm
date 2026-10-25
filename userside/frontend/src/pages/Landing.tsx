import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  Building2,
  CalendarClock,
  ChevronDown,
  FileSpreadsheet,
  Github,
  Headphones,
  Lock,
  Menu,
  MessageSquareText,
  PhoneCall,
  PhoneOff,
  Play,
  ServerCog,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Logo } from "../components/ui";
import GithubStar from "../components/GithubStar";
import { GITHUB_URL } from "../config";
import { useAuth } from "../lib/auth";

const STEPS = [
  {
    icon: Building2,
    title: "Register your company",
    text: "Create a private workspace. Add your business facts – hours, offers, policies – so the agent answers correctly.",
  },
  {
    icon: FileSpreadsheet,
    title: "Upload your numbers",
    text: "Drop in an Excel or CSV sheet, or paste numbers. Duplicates and invalid numbers are cleaned up automatically.",
  },
  {
    icon: Play,
    title: "Press Run",
    text: "The AI agent starts calling, talks naturally, and every conversation appears on your dashboard as it happens.",
  },
];

const FEATURES = [
  {
    icon: ServerCog,
    title: "Self-hosted AI",
    text: "Speech recognition, the language model and the voice all run on your own server. No third-party AI API sees your calls.",
  },
  {
    icon: MessageSquareText,
    title: "Live transcripts",
    text: "Read what each customer said and how the agent replied, call by call, the moment the call ends.",
  },
  {
    icon: Users,
    title: "Separate company accounts",
    text: "Every company gets its own workspace, campaigns, numbers and results. Nobody sees anyone else's data.",
  },
  {
    icon: PhoneOff,
    title: "Do-not-call built in",
    text: "If someone asks not to be called again, their number goes on your do-not-call list automatically.",
  },
  {
    icon: CalendarClock,
    title: "Calling hours",
    text: "Calls are only placed inside the hours you set – 9 AM to 9 PM by default.",
  },
  {
    icon: Headphones,
    title: "Short, natural replies",
    text: "The agent speaks one or two short sentences at a time and starts answering within a few seconds.",
  },
];

const USE_CASES = [
  { icon: BellRing, title: "Payment & EMI reminders", text: "Remind customers before the due date and answer basic questions." },
  { icon: CalendarClock, title: "Appointment confirmations", text: "Confirm, reschedule or remind – clinics, salons, service centres." },
  { icon: MessageSquareText, title: "Feedback calls", text: "Ask how the last purchase or visit went and collect the answers." },
  { icon: PhoneCall, title: "Offers & follow-ups", text: "Tell existing customers about a sale and invite them to visit." },
];

// measured on an i5-8250U laptop without a GPU (see project/README.md, "Benchmarks")
const PROOF = [
  { value: "~3 s", label: "from caller's last word to the agent's reply" },
  { value: "0", label: "third-party AI APIs" },
  { value: "100%", label: "runs on your own server" },
  { value: "Excel", label: "upload, press Run, done" },
];

const STACK = [
  { name: "Asterisk", role: "phone calls (SIP)" },
  { name: "whisper.cpp", role: "speech to text" },
  { name: "Llama 3.2 via Ollama", role: "the conversation" },
  { name: "Piper", role: "text to speech" },
  { name: "FastAPI + SQLite", role: "accounts, campaigns, dialer" },
  { name: "React", role: "this website and dashboard" },
];

const FAQ = [
  {
    q: "Do I need a phone number?",
    a: "Yes, to call real customers you need a SIP trunk / virtual number from a telecom provider. Until then you can test everything with a softphone on your own computer.",
  },
  {
    q: "Which languages does it speak?",
    a: "English today. Hindi works in beta but is slower and less accurate on small servers.",
  },
  {
    q: "Where is my data stored?",
    a: "On the server where VoiceLLM is installed – your numbers, transcripts and business details never leave it.",
  },
  {
    q: "Is automated calling allowed?",
    a: "Only call people who agreed to hear from you, respect DND registrations and calling hours, and follow your telecom regulator's rules (in India, TRAI's commercial communication regulations). VoiceLLM gives you the do-not-call list and calling-hour controls; compliance is your responsibility.",
  },
];

function CallPreview() {
  return (
    <div className="card relative mx-auto w-full max-w-md overflow-hidden p-5 text-left">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
            <PhoneCall size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold">Ravi · +91 98•••• 3210</p>
            <p className="text-xs text-slate-500">Diwali offer campaign</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-600" /> On call
        </span>
      </div>
      <div className="space-y-3 text-sm">
        <Bubble who="agent">Hi Ravi, this is Sharma Electronics. Do you have a minute?</Bubble>
        <Bubble who="user">Yes, what is this about?</Bubble>
        <Bubble who="agent">We have a Diwali sale with 20 percent off all phones, until 5 November.</Bubble>
        <Bubble who="user">Nice, are you open on Sunday?</Bubble>
        <Bubble who="agent">Yes, Sunday 11 AM to 5 PM. Would you like to visit?</Bubble>
      </div>
    </div>
  );
}

function Bubble({ who, children }: { who: "agent" | "user"; children: string }) {
  const agent = who === "agent";
  return (
    <div className={`flex ${agent ? "justify-start" : "justify-end"}`}>
      <p
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${
          agent ? "rounded-bl-sm bg-brand-50 text-slate-800" : "rounded-br-sm bg-slate-900 text-white"
        }`}
      >
        {children}
      </p>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 py-4">
      <button className="flex w-full items-center justify-between text-left font-semibold" onClick={() => setOpen(!open)}>
        {q}
        <ChevronDown size={18} className={`shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="mt-2 text-sm leading-relaxed text-slate-600">{a}</p>}
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const [menu, setMenu] = useState(false);
  const cta = user ? { to: "/app", label: "Open dashboard" } : { to: "/register", label: "Create free account" };

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#how" className="hover:text-slate-900">How it works</a>
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#use-cases" className="hover:text-slate-900">Use cases</a>
            <a href="#open-source" className="hover:text-slate-900">Open source</a>
            <a href="#faq" className="hover:text-slate-900">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="GitHub"
               className="hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:block">
              <Github size={18} />
            </a>
            {!user && (
              <Link to="/login" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:block">
                Log in
              </Link>
            )}
            <Link to={cta.to} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
              {user ? "Dashboard" : "Get started"}
            </Link>
            <button onClick={() => setMenu(!menu)} aria-label="Menu" className="rounded-lg p-2 hover:bg-slate-100 md:hidden">
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menu && (
          <nav className="space-y-1 border-t border-slate-100 bg-white px-4 py-3 text-sm font-medium md:hidden" onClick={() => setMenu(false)}>
            {[["#how", "How it works"], ["#features", "Features"], ["#use-cases", "Use cases"], ["#open-source", "Open source"], ["#faq", "FAQ"]].map(([href, label]) => (
              <a key={href} href={href} className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">{label}</a>
            ))}
            {!user && <Link to="/login" className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">Log in</Link>}
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">GitHub</a>
          </nav>
        )}
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-100 via-white to-white" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <a href="#open-source" className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700 hover:border-brand-300">
              <Lock size={12} /> Open source · your calls never leave your server
            </a>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              AI voice agents that <span className="text-brand-600">call your customers</span> for you
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              Upload your customer list, write what the call is about, press Run. VoiceLLM dials each number, holds a
              natural conversation, and shows you every transcript.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={cta.to} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-brand-700">
                {cta.label} <ArrowRight size={18} />
              </Link>
              <GithubStar />
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={16} className="text-green-600" /> No third-party AI API</span>
              <span className="inline-flex items-center gap-1.5"><FileSpreadsheet size={16} className="text-green-600" /> Excel & CSV import</span>
              <span className="inline-flex items-center gap-1.5"><PhoneOff size={16} className="text-green-600" /> Do-not-call list</span>
            </div>
          </div>
          <CallPreview />
        </div>
      </section>

      <section className="border-t border-slate-100">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 md:grid-cols-4">
          {PROOF.map((p) => (
            <div key={p.label} className="flex flex-col text-center">
              <dt className="order-2 mt-1 text-sm text-slate-500">{p.label}</dt>
              <dd className="text-3xl font-extrabold tracking-tight text-slate-900">{p.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="how" className="border-t border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight">Up and calling in three steps</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">No code, no call-centre software to learn.</p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="card p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white">
                    <s.icon size={20} />
                  </span>
                  <span className="text-sm font-semibold text-brand-600">Step {i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight">Built for businesses that care about their data</h2>
          <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <f.icon size={20} />
                </span>
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="use-cases" className="border-t border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight">What companies use it for</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {USE_CASES.map((u) => (
              <div key={u.title} className="card p-5">
                <u.icon size={22} className="text-brand-600" />
                <h3 className="mt-3 font-semibold">{u.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{u.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="open-source" className="py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 lg:grid-cols-2">
          <div>
            <span className="text-sm font-semibold text-brand-600">Open source</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Run the whole thing on your own machine</h2>
            <p className="mt-4 leading-relaxed text-slate-600">
              Every part of VoiceLLM is open-source software you can install, inspect and change. Nothing is sent to an
              AI company – the only outside service is the phone line itself.
            </p>
            <ul className="mt-6 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {STACK.map((s) => (
                <li key={s.name} className="flex items-start gap-2 text-sm">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-green-600" />
                  <span><span className="font-semibold">{s.name}</span> <span className="text-slate-500">– {s.role}</span></span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <GithubStar />
              <a href={`${GITHUB_URL}#readme`} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50">
                Read the setup guide <ArrowRight size={16} />
              </a>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl bg-slate-900 text-sm shadow-lg">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-red-400" />
              <span className="h-3 w-3 rounded-full bg-amber-400" />
              <span className="h-3 w-3 rounded-full bg-green-400" />
              <span className="ml-2 text-xs text-slate-400">PowerShell</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-6 text-slate-200">
              <span className="text-slate-500"># 1. get the code</span>{"\n"}
              git clone {GITHUB_URL}.git{"\n\n"}
              <span className="text-slate-500"># 2. voice agent: WSL + Asterisk + models</span>{"\n"}
              .\project\scripts\install_wsl.ps1{"\n\n"}
              <span className="text-slate-500"># 3. start everything</span>{"\n"}
              .\project\scripts\start_all.ps1{"\n"}
              .\userside\start.ps1{"\n\n"}
              <span className="text-green-400">→ http://localhost:5173</span>
            </pre>
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight">Questions</h2>
          <div className="mt-8">
            {FAQ.map((f) => (
              <FaqItem key={f.q} {...f} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-6xl rounded-2xl bg-slate-900 px-6 py-14 text-center text-white">
          <h2 className="text-3xl font-bold tracking-tight">Let your first AI agent make the calls</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">Create a company account and run a test campaign in a few minutes.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to={cta.to} className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-semibold text-slate-900 hover:bg-slate-100">
              {cta.label} <ArrowRight size={18} />
            </Link>
            <GithubStar dark />
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-slate-500 sm:flex-row">
          <Logo />
          <p className="flex items-center gap-4">
            <span>© {new Date().getFullYear()} VoiceLLM · self-hosted voice AI</span>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-slate-900">
              <Github size={14} /> GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
