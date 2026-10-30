import { useEffect, useState } from "react";

const CROPS = { rice: ["धान", "Rice (paddy)"], wheat: ["गेहूं", "Wheat"], gram: ["चना", "Gram"], maize: ["मक्का", "Maize"], tomato: ["टमाटर", "Tomato"] };

export default function Mandi({ lang, farm }) {
  const hi = lang === "hi";
  const [crop, setCrop] = useState(farm?.crop || "wheat"), [state, setState] = useState("Madhya Pradesh"), [district, setDistrict] = useState("");
  const [d, setD] = useState(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/mandi?crop=${crop}&state=${encodeURIComponent(state)}&district=${encodeURIComponent(district)}`);
      const j = await r.json(); if (!r.ok) throw new Error(j.detail || r.statusText); setD(j);
    } catch (x) { setErr(x.message); setD(null); } finally { setBusy(false); }
  };
  useEffect(() => { go(); }, [crop]);
  const speak = () => {
    if (!d?.best || !("speechSynthesis" in window)) return;
    const txt = hi ? `${CROPS[crop][0]} का औसत भाव ${d.avg_modal} रुपये प्रति क्विंटल है। सबसे अच्छा भाव ${d.best.market} मंडी में ${d.best.modal} रुपये है।`
                   : `Average ${CROPS[crop][1]} price is ${d.avg_modal} rupees per quintal. Best price is in ${d.best.market} at ${d.best.modal} rupees.`;
    window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(txt); u.lang = hi ? "hi-IN" : "en-IN"; window.speechSynthesis.speak(u);
  };
  return <div>
    <div className="panel"><div className="grid">
      <label>{hi ? "फसल" : "Crop"}<select value={crop} onChange={e => setCrop(e.target.value)}>{Object.keys(CROPS).map(k => <option key={k} value={k}>{CROPS[k][hi ? 0 : 1]}</option>)}</select></label>
      <label>{hi ? "राज्य" : "State"}<input value={state} onChange={e => setState(e.target.value)} /></label>
      <label>{hi ? "जिला (खाली = पूरा राज्य)" : "District (blank = whole state)"}<input value={district} onChange={e => setDistrict(e.target.value)} placeholder="Betul" /></label>
    </div><button className="btn" style={{ marginTop: 12 }} onClick={go} disabled={busy}>{busy ? "…" : hi ? "भाव देखें" : "Show prices"}</button></div>
    {err && <div className="panel"><div className="chat-row error"><div className="chat-bubble">{err}</div></div></div>}
    {d && d.count === 0 && <div className="panel">{hi ? "आज इस फसल का भाव नहीं मिला। जिला खाली छोड़कर देखें।" : "No prices found today. Try leaving the district blank."}</div>}
    {d && d.count > 0 && <>
      <div className="panel"><div className="grid">
        <div className="stat"><b>₹{d.avg_modal.toLocaleString()}</b><span>{hi ? "औसत भाव / क्विंटल" : "Average / quintal"}</span></div>
        <div className="stat"><b>₹{d.best.modal.toLocaleString()}</b><span>{hi ? "सबसे अच्छा: " : "Best: "}{d.best.market}</span></div>
        <div className="stat"><b>{d.trend ? (d.trend.pct > 0 ? "▲ " : d.trend.pct < 0 ? "▼ " : "") + Math.abs(d.trend.pct) + "%" : "—"}</b><span>{d.trend ? (hi ? `${d.trend.days} दिन पहले से` : `vs ${d.trend.days} days ago`) : hi ? "तुलना कुछ दिन बाद दिखेगी" : "Trend appears after a few days"}</span></div>
      </div><button className="text-action" onClick={speak}>🔊 {hi ? "सुनें" : "Read aloud"}</button></div>
      <div className="panel"><h3>{hi ? "मंडी के अनुसार भाव (₹ प्रति क्विंटल)" : "By market (₹ per quintal)"}</h3><div style={{ overflowX: "auto" }}><table><thead><tr><th>{hi ? "मंडी" : "Market"}</th><th>{hi ? "किस्म" : "Variety"}</th><th>Min</th><th>Max</th><th>Modal</th><th>{hi ? "तारीख" : "Date"}</th></tr></thead>
        <tbody>{d.rows.map((r, i) => <tr key={i}><td>{r.market}{r.district && r.district !== r.market ? `, ${r.district}` : ""}</td><td>{r.variety}</td><td>{r.min}</td><td>{r.max}</td><td><b>{r.modal}</b></td><td>{r.date}</td></tr>)}</tbody></table></div>
        <p style={{ fontSize: 11, color: "var(--muted)" }}>{hi ? "स्रोत: सरकारी Agmarknet डेटा। बेचने से पहले मंडी में भाव की पुष्टि करें।" : "Source: Government Agmarknet data. Confirm the price at the mandi before selling."}</p></div>
    </>}
  </div>;
}
