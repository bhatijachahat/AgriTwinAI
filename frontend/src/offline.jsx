import { useEffect, useState } from "react";

const QK = "agritwin_queue";
const getQ = () => { try { return JSON.parse(localStorage.getItem(QK)) || []; } catch { return []; } };
const setQ = q => { localStorage.setItem(QK, JSON.stringify(q)); window.dispatchEvent(new Event("agritwin-queue")); };
const QUEUEABLE = (m, u) => m === "POST" && /^\/api\/farms(\/\d+\/log)?$/.test(u);   // add farm, log irrigation

const inner = window.fetch;   // already carries the login token
window.fetch = (url, opts = {}) => {
  const method = (opts.method || "GET").toUpperCase();
  if (!(typeof url === "string" && QUEUEABLE(method, url))) return inner(url, opts);
  return inner(url, opts).catch(err => {
    if (!(err instanceof TypeError)) throw err;          // network failure only
    setQ([...getQ(), { url, method, body: opts.body, ct: "application/json" }]);
    return new Response(JSON.stringify({ ok: true, queued: true, id: null }), { status: 202, headers: { "Content-Type": "application/json" } });
  });
};

let flushing = false;
export async function flush() {
  if (flushing) return 0; flushing = true; let done = 0;
  try {
    for (let q = getQ(); q.length; q = getQ()) {
      const it = q[0];
      try {
        const r = await inner(it.url, { method: it.method, headers: { "Content-Type": it.ct }, body: it.body });
        if (r.status === 401) break;                     // logged out: keep for later
      } catch { break; }                                 // still offline
      setQ(getQ().slice(1)); done++;
    }
  } finally { flushing = false; }
  return done;
}
export const clearOfflineData = () => { localStorage.removeItem(QK); if ("caches" in window) caches.keys().then(ks => ks.forEach(k => caches.delete(k))); };

export function OfflineBar({ lang = "hi" }) {
  const hi = lang === "hi";
  const [online, setOnline] = useState(navigator.onLine), [n, setN] = useState(getQ().length), [synced, setSynced] = useState(0);
  useEffect(() => {
    const upd = () => setN(getQ().length), on = async () => { setOnline(true); const d = await flush(); if (d) setSynced(d); };
    const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off); window.addEventListener("agritwin-queue", upd);
    if (navigator.onLine && getQ().length) on();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); window.removeEventListener("agritwin-queue", upd); };
  }, []);
  if (online && !n && !synced) return null;
  return <div className={`offline-bar ${online ? "ok" : ""}`} role="status">
    {!online && <span>📴 {hi ? "ऑफ़लाइन — पुराना डेटा दिख रहा है" : "Offline — showing saved data"}</span>}
    {n > 0 && <span>⏳ {n} {hi ? "एंट्री नेट आने पर सेव होंगी" : "entries will sync when online"}</span>}
    {online && !n && synced > 0 && <><span>✅ {synced} {hi ? "एंट्री सेव हो गईं" : "entries synced"}</span><button onClick={() => window.location.reload()}>{hi ? "रिफ्रेश" : "Refresh"}</button></>}
  </div>;
}
