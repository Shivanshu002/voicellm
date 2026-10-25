import { useEffect, useState } from "react";
import { Github, Star } from "lucide-react";
import { GITHUB_REPO, GITHUB_URL } from "../config";

const CACHE_KEY = "voicellm_stars";

/** "Star on GitHub" button with the live star count (cached for an hour; hidden on failure). */
export default function GithubStar({ dark = false }: { dark?: boolean }) {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached && Date.now() - cached.at < 3600_000) {
        setStars(cached.stars);
        return;
      }
    } catch {
      /* storage unavailable */
    }
    fetch(`https://api.github.com/repos/${GITHUB_REPO}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (typeof d?.stargazers_count !== "number") return;
        setStars(d.stargazers_count);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ stars: d.stargazers_count, at: Date.now() }));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, []);

  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center overflow-hidden rounded-lg border text-sm font-semibold shadow-sm ${
        dark ? "border-white/20 bg-white/10 text-white hover:bg-white/20" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span className="inline-flex items-center gap-2 px-3 py-2">
        <Github size={16} /> Star on GitHub
      </span>
      {stars !== null && (
        <span className={`inline-flex items-center gap-1 border-l px-3 py-2 tabular-nums ${dark ? "border-white/20" : "border-slate-300"}`}>
          <Star size={14} className="fill-amber-400 text-amber-400" /> {stars.toLocaleString("en-IN")}
        </span>
      )}
    </a>
  );
}
