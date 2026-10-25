// Public GitHub repository shown on the landing page (override with VITE_GITHUB_URL in .env).
export const GITHUB_URL: string =
  import.meta.env.VITE_GITHUB_URL || "https://github.com/Shivanshu002/lama-calling-agent";

/** "owner/repo" from GITHUB_URL, for the star counter. */
export const GITHUB_REPO = GITHUB_URL.replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
