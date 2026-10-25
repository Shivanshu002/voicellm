import { useCallback, useEffect, useRef, useState } from "react";

/** Loads data with `fn`, re-loads every `pollMs` (when > 0) and on reload(). */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!pollMs) return;
    const t = setInterval(() => {
      if (!document.hidden) reload();
    }, pollMs);
    return () => clearInterval(t);
  }, [pollMs, reload]);

  return { data, error, loading, reload, setData };
}
