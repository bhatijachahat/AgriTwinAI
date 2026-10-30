import { useEffect, useState } from "react";
export default function DiseaseScan({ lang, id }) {
  const hi = lang === "hi", [file, setFile] = useState(null), [prev, setPrev] = useState(""), [res, setRes] = useState(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [hist, setHist] = useState([]);
  const load = () => fetch(`/api/farms/${id}/disease-scans`).then(r => r.json()).then(setHist).catch(() => {});
  useEffect(() => { load(); setRes(null); }, [id]);
  const pick = e => { const f = e.target.files[0]; setFile(f); setRes(null); setErr(""); setPrev(f ? URL.createObjectURL(f) : ""); };
  const send = async () => {
    setBusy(true); setErr(""); const fd = new FormData(); fd.append("file", file);
    try { const r = await fetch(`/api/farms/${id}/disease-photo?lang=${lang}`, { method: "POST", body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.detail || r.statusText); setRes(j); load(); }
    catch (x) { setErr(x.message); } setBusy(false);
  };
  const col = res && (res.healthy ? "var(--leaf)" : res.urgent ? "var(--dry)" : "var(--grain)");
  return <>
    <div className="panel"><h3>{hi ? "पत्ते की फोटो से बीमारी पहचानें" : "Detect disease from a leaf photo"}</h3>
      <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={pick} />
      {prev && <img src={prev} alt="leaf" style={{ maxWidth: "100%", maxHeight: 260, marginTop: ".8rem", borderRadius: 8 }} />}
      <button className="btn" disabled={!file || busy} onClick={send}>{busy ? "…" : hi ? "जाँच करें" : "Analyse"}</button>
      {err && <p className="err">{err}</p>}</div>
    {res && <div className="panel" style={{ borderLeft: `6px solid ${col}` }}>
      <h3>{res.healthy ? (hi ? "पौधा स्वस्थ दिखता है" : "Plant looks healthy") : res.disease}</h3>
      <p>{hi ? "भरोसा" : "Confidence"}: {res.confidence}% · {hi ? "गंभीरता" : "Severity"}: {res.severity}{res.weather_risk && ` · ${hi ? "मौसम जोखिम" : "Weather risk"}: ${res.weather_risk}`}</p>
      {res.urgent && <p className="err">{hi ? "⚠ बीमारी और मौसम दोनों अनुकूल हैं, जल्दी कदम उठाएँ।" : "⚠ Disease and weather both favour spread. Act soon."}</p>}
      <p>{res.symptoms}</p><p><b>{res.advice}</b></p><small>{res.disclaimer}</small></div>}
    {hist.length > 0 && <div className="panel"><h3>{hi ? "पिछली जाँचें" : "Previous scans"}</h3><table><tbody>{hist.map(h => <tr key={h.id}><td>{h.day}</td><td>{h.disease}</td><td>{h.confidence}%</td><td>{h.severity}</td></tr>)}</tbody></table></div>}</>;
}
