import { useState } from "react";
export default function Schemes({ lang, id }) {
  const hi = lang === "hi", [p, setP] = useState({ category: "general", owns_land: true, has_grid: false, irrigation: "flood", state: "Chhattisgarh", land_ha: "" }), [r, setR] = useState(null), [err, setErr] = useState("");
  const set = k => e => setP({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const go = async () => {
    setErr(""); const body = { ...p, land_ha: p.land_ha === "" ? null : +p.land_ha };
    try { const x = await fetch(`/api/farms/${id}/schemes?lang=${lang}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await x.json(); if (!x.ok) throw new Error(j.detail); setR(j); } catch (e) { setErr(e.message); }
  };
  return <>
    <div className="panel"><h3>{hi ? "आपके लिए सरकारी योजनाएँ" : "Government schemes for you"}</h3><div className="grid">
      <label>{hi ? "ज़मीन (हेक्टेयर, खाली = खेत का क्षेत्रफल)" : "Land (ha, blank = farm area)"}<input type="number" step="0.1" value={p.land_ha} onChange={set("land_ha")} /></label>
      <label>{hi ? "श्रेणी" : "Category"}<select value={p.category} onChange={set("category")}>{["general", "obc", "sc", "st"].map(x => <option key={x}>{x}</option>)}</select></label>
      <label>{hi ? "सिंचाई का तरीका" : "Irrigation method"}<select value={p.irrigation} onChange={set("irrigation")}>{["flood", "drip", "sprinkler"].map(x => <option key={x}>{x}</option>)}</select></label>
      <label>{hi ? "राज्य" : "State"}<input value={p.state} onChange={set("state")} /></label>
      <label><input type="checkbox" checked={p.owns_land} onChange={set("owns_land")} style={{ width: "auto" }} /> {hi ? "खुद की ज़मीन" : "I own the land"}</label>
      <label><input type="checkbox" checked={p.has_grid} onChange={set("has_grid")} style={{ width: "auto" }} /> {hi ? "पंप पर बिजली कनेक्शन है" : "Pump has grid connection"}</label></div>
      <button className="btn" onClick={go}>{hi ? "योजनाएँ देखें" : "Find schemes"}</button>{err && <p className="err">{err}</p>}</div>
    {r && <><p><b>{hi ? "किसान प्रकार" : "Farmer type"}:</b> {r.farmer_type} ({r.land_ha} ha)</p>
      {r.schemes.map(s => <div className="panel" key={s.id} style={{ opacity: s.eligible ? 1 : .6, borderLeft: `6px solid ${s.eligible ? (s.priority === "high" ? "var(--leaf)" : "var(--grain)") : "var(--line)"}` }}>
        <h3>{s.name} {s.eligible ? "✔" : "—"}</h3><p>{s.why}</p><p><b>{hi ? "लाभ" : "Benefit"}:</b> {s.benefit}</p>
        <p><b>{hi ? "दस्तावेज़" : "Documents"}:</b> {s.documents.join(", ")}</p><p><b>{hi ? "कहाँ आवेदन करें" : "Apply at"}:</b> {s.apply_at} · <a href={s.link} target="_blank" rel="noreferrer">{s.link.replace("https://", "")}</a></p></div>)}
      <small>{r.disclaimer}</small></>}</>;
}
