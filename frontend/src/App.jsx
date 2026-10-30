import { useEffect, useState } from "react";
import Insights from "./Insights.jsx";
import DiseaseScan from "./DiseaseScan.jsx";
import Schemes from "./Schemes.jsx";
import Mandi from "./Mandi.jsx";
import { logout, currentUser } from "./Auth.jsx";
const T = {
  en: { farms: "Farms", twin: "Digital Twin", whatif: "What-if", hist: "History", ins: "Insights", scan: "Disease scan", sch: "Schemes", add: "Add farm", name: "Farm name", crop: "Crop", soil: "Soil",
    sow: "Sowing date", area: "Area (ha)", lat: "Latitude", lon: "Longitude", pump: "Pump flow (L/hr)", eff: "Irrigation efficiency (0-1)", sel: "Open twin",
    del: "Delete", pick: "Add or select a farm first.", stage: "Growth stage", kc: "Crop coefficient (Kc)", moist: "Soil moisture", nextI: "Next irrigation",
    none: "None in 7 days", mm: "Water needed (mm)", ltr: "Water needed (litres)", solar: "Solar pump", run: "Pump runtime (h)", sun: "Usable sun",
    yld: "Expected relative yield", rain: "Rain factor (1 = forecast)", imm: "Irrigation per event (mm)", intv: "Every N days (0 = none)", run2: "Run scenario",
    log: "Log irrigation", day: "Date", tot: "Total water used", base: "Baseline yield", scen: "Scenario yield", stress: "Stress days", used: "Water used (L)", last30: "Last 30 days: rain (blue) and irrigation (green)" },
  hi: { farms: "खेत", twin: "डिजिटल ट्विन", whatif: "अगर ऐसा हो तो", hist: "इतिहास", ins: "सलाह", scan: "बीमारी जाँच", sch: "योजनाएँ", add: "खेत जोड़ें", name: "खेत का नाम", crop: "फसल", soil: "मिट्टी",
    sow: "बुवाई की तारीख", area: "क्षेत्रफल (हेक्टेयर)", lat: "अक्षांश", lon: "देशांतर", pump: "पंप प्रवाह (लीटर/घंटा)", eff: "सिंचाई दक्षता (0-1)", sel: "ट्विन खोलें",
    del: "हटाएं", pick: "पहले खेत जोड़ें या चुनें।", stage: "वृद्धि अवस्था", kc: "फसल गुणांक (Kc)", moist: "मिट्टी की नमी", nextI: "अगली सिंचाई",
    none: "7 दिन में नहीं", mm: "पानी की ज़रूरत (मिमी)", ltr: "पानी की ज़रूरत (लीटर)", solar: "सोलर पंप", run: "पंप चलने का समय (घंटे)", sun: "उपयोगी धूप",
    yld: "अनुमानित सापेक्ष उपज", rain: "बारिश गुणक (1 = पूर्वानुमान)", imm: "प्रति सिंचाई (मिमी)", intv: "हर N दिन (0 = नहीं)", run2: "परिदृश्य चलाएं",
    log: "सिंचाई दर्ज करें", day: "तारीख", tot: "कुल पानी उपयोग", base: "मौजूदा उपज", scen: "परिदृश्य उपज", stress: "तनाव के दिन", used: "पानी उपयोग (लीटर)", last30: "पिछले 30 दिन: बारिश (नीला), सिंचाई (हरा)" },
};
const api = (p, o) => fetch("/api" + p, o).then(async r => { if (!r.ok) throw new Error((await r.json()).detail || r.statusText); return r.json(); });
const post = (p, b) => api(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const Stat = ({ v, l }) => <div className="stat"><b>{v}</b><span>{l}</span></div>;

function FarmForm({ t, meta, onDone }) {
  const [f, setF] = useState({ name: "", lat: 21.25, lon: 81.63, crop: "rice", sowing_date: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), area_ha: 1, soil: "clay", efficiency: 0.75, pump_lph: 20000 });
  const [err, setErr] = useState("");
  const s = k => e => setF({ ...f, [k]: e.target.type === "number" ? +e.target.value : e.target.value });
  const submit = e => { e.preventDefault(); post("/farms", f).then(onDone).catch(x => setErr(x.message)); };
  return <form className="panel farm-form" onSubmit={submit}><h2>{t.add}</h2><div className="grid">
    <label>{t.name}<input required value={f.name} onChange={s("name")} /></label>
    <label>{t.crop}<select value={f.crop} onChange={s("crop")}>{Object.keys(meta.crops).map(c => <option key={c} value={c}>{c} / {meta.crops[c]}</option>)}</select></label>
    <label>{t.soil}<select value={f.soil} onChange={s("soil")}>{meta.soils.map(c => <option key={c}>{c}</option>)}</select></label>
    <label>{t.sow}<input type="date" value={f.sowing_date} onChange={s("sowing_date")} /></label>
    <label>{t.area}<input type="number" step="0.1" value={f.area_ha} onChange={s("area_ha")} /></label>
    <label>{t.lat}<input type="number" step="any" value={f.lat} onChange={s("lat")} /></label>
    <label>{t.lon}<input type="number" step="any" value={f.lon} onChange={s("lon")} /></label>
    <label>{t.pump}<input type="number" value={f.pump_lph} onChange={s("pump_lph")} /></label>
    <label>{t.eff}<input type="number" step="0.05" min="0.3" max="1" value={f.efficiency} onChange={s("efficiency")} /></label></div>
    <button className="btn">{t.add}</button>{err && <p className="err">{err}</p>}</form>;
}

function Bars({ rows }) {
  const mx = Math.max(10, ...rows.map(r => Math.max(r.rain, r.irr)));
  return <div className="bars" role="img" aria-label="rain and irrigation">{rows.map(r => <div key={r.date} title={`${r.date}: ${r.rain} mm rain, ${r.irr} mm irrigation`} className={r.irr > 0 ? "irr" : ""} style={{ height: `${Math.max(2, (Math.max(r.rain, r.irr) / mx) * 100)}%` }} />)}</div>;
}

function Twin({ t, lang, id }) {
  const [d, setD] = useState(null), [e, setE] = useState("");
  useEffect(() => { setD(null); api(`/farms/${id}/twin?lang=${lang}`).then(setD).catch(x => setE(x.message)); }, [id, lang]);
  if (e) return <p className="err">{e}</p>; if (!d) return <p>…</p>;
  return <>
    <div className="advice">{d.recommendation}</div>
    <div className="panel grid" style={{ alignItems: "center" }}>
      <div className="tank" role="img" aria-label={`${t.moist} ${d.moisture_pct}%`}><i style={{ height: d.moisture_pct + "%" }} /></div>
      <Stat v={d.moisture_pct + "%"} l={t.moist} /><Stat v={lang === "hi" ? d.stage_hi : d.stage} l={`${t.stage} (GDD ${d.gdd})`} />
      <Stat v={d.kc} l={t.kc} /><Stat v={d.next_irrigation || t.none} l={t.nextI} /><Stat v={d.irrigation_mm} l={t.mm} />
      <Stat v={d.liters.toLocaleString()} l={t.ltr} /><Stat v={d.relative_yield_pct + "%"} l={t.yld} /></div>
    <div className="panel"><h3>{t.solar}</h3><div className="grid">
      <Stat v={d.solar.window || "–"} l={`${t.sun} (${d.solar.day})`} /><Stat v={d.solar.runtime_h} l={t.run} /></div>
      <p>{d.solar.fits ? "✔" : "⚠"} {d.solar.sun_hours}h sun / {d.solar.runtime_h}h needed</p></div>
    <div className="panel"><p>{t.last30}</p><Bars rows={d.series} /></div></>;
}

function WhatIf({ t, lang, id }) {
  const [w, setW] = useState({ rain_factor: 1, irrigation_mm: 30, interval_days: 5 }), [r, setR] = useState(null), [e, setE] = useState("");
  const s = k => ev => setW({ ...w, [k]: +ev.target.value });
  const run = () => post(`/farms/${id}/whatif?lang=${lang}`, w).then(x => { setR(x); setE(""); }).catch(x => setE(x.message));
  return <div className="panel"><div className="grid">
    <label>{t.rain}<input type="number" step="0.5" min="0" value={w.rain_factor} onChange={s("rain_factor")} /></label>
    <label>{t.imm}<input type="number" value={w.irrigation_mm} onChange={s("irrigation_mm")} /></label>
    <label>{t.intv}<input type="number" min="0" value={w.interval_days} onChange={s("interval_days")} /></label></div>
    <button className="btn" onClick={run}>{t.run2}</button>{e && <p className="err">{e}</p>}
    {r && <div className="grid" style={{ marginTop: "1rem" }}><Stat v={r.baseline_yield_pct + "%"} l={t.base} /><Stat v={r.scenario_yield_pct + "%"} l={t.scen} />
      <Stat v={`${r.baseline_stressed_days} → ${r.scenario_stressed_days}`} l={t.stress} /><Stat v={r.liters_used.toLocaleString()} l={t.used} /></div>}</div>;
}

function History({ t, id }) {
  const [h, setH] = useState(null), [mm, setMm] = useState(30), [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const load = () => api(`/farms/${id}/history`).then(setH); useEffect(() => { load(); }, [id]);
  return <div className="panel"><div className="grid"><label>{t.day}<input type="date" value={day} onChange={e => setDay(e.target.value)} /></label>
    <label>mm<input type="number" value={mm} onChange={e => setMm(+e.target.value)} /></label></div>
    <button className="btn" onClick={() => post(`/farms/${id}/log`, { day, mm }).then(load)}>{t.log}</button>
    {h && <><p><b>{t.tot}:</b> {h.total_mm} mm · {h.total_liters.toLocaleString()} L</p>
      <table><tbody>{h.entries.map(x => <tr key={x.id}><td>{x.day}</td><td>{x.mm} mm</td><td>{Math.round(x.liters).toLocaleString()} L</td></tr>)}</tbody></table></>}</div>;
}

export default function App() {
  const [lang, setLang] = useState("hi"), [tab, setTab] = useState("farms"), [farms, setFarms] = useState([]), [sel, setSel] = useState(null), [meta, setMeta] = useState(null);
  const t = T[lang];
  const load = async (preferId = null) => {
    try {
      const list = await api("/farms");
      setFarms(list);
      const preferred = preferId === undefined ? sel : preferId;
      if (preferred && list.some(f => f.id === preferred)) {
        setSel(preferred);
      } else {
        setSel(list[0]?.id ?? null);
      }
    } catch (error) {
      console.error("Could not load farms:", error);
    }
  };
  useEffect(() => { api("/meta").then(setMeta).catch(error => console.error("Could not load metadata:", error)); load(); }, []);

  const tabs = [
    { key: "farms", icon: "⌂", label: t.farms },
    { key: "twin", icon: "◈", label: t.twin },
    { key: "whatif", icon: "⇄", label: t.whatif },
    { key: "hist", icon: "▤", label: t.hist },
    { key: "ins", icon: "✦", label: t.ins },
    { key: "scan", icon: "✿", label: t.scan },
    { key: "sch", icon: "▧", label: t.sch },
    { key: "mandi", icon: "₹", label: lang === "hi" ? "मंडी भाव" : "Mandi prices" },
  ];
  const selectedFarm = farms.find(f => f.id === sel);
  const pageDescriptions = {
    farms: lang === "hi" ? "अपने खेतों को एक जगह से संभालें और उनकी जानकारी अपडेट रखें।" : "Manage your farms and keep essential field information in one place.",
    twin: lang === "hi" ? "मौसम, मिट्टी और फसल की अवस्था से सिंचाई संबंधी जानकारी देखें।" : "Explore crop stage, soil-water status and irrigation guidance.",
    whatif: lang === "hi" ? "बारिश और सिंचाई में बदलाव करके संभावित असर की तुलना करें।" : "Compare how changes in rainfall and irrigation may affect your farm.",
    hist: lang === "hi" ? "पहले दर्ज की गई सिंचाई और पानी के उपयोग को देखें।" : "Review recorded irrigation events and estimated water use.",
    ins: lang === "hi" ? "खेत के लिए उपलब्ध सलाह और जानकारी देखें।" : "Explore farm insights and advisory tools.",
    scan: lang === "hi" ? "फसल की तस्वीर से संभावित लक्षणों की शुरुआती जाँच करें।" : "Check a crop photo for possible visible symptoms.",
    mandi: lang === "hi" ? "अपनी फसल के आसपास की मंडियों के ताज़ा भाव देखें।" : "See today's prices for your crop in nearby mandis.",
    sch: lang === "hi" ? "अपनी जानकारी के अनुसार संबंधित सरकारी योजनाएँ देखें।" : "Explore government schemes that may be relevant to your profile.",
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">🌱</span>
        <span className="brand-copy"><strong>AgriTwinAI</strong><small>Smart farming, simply</small></span>
      </div>
      <div className="sidebar-caption">{lang === "hi" ? "वर्कस्पेस" : "WORKSPACE"}</div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {tabs.map(item => <button key={item.key} className={`nav-item ${tab === item.key ? "active" : ""}`} onClick={() => setTab(item.key)}>
          <span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>{tab === item.key && <span className="nav-active-dot" />}
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-tip"><span className="tip-icon">✦</span><div><strong>{lang === "hi" ? "बेहतर खेती, बेहतर फैसले" : "Better farming decisions"}</strong><p>{lang === "hi" ? "डेटा से समझें, सोच-समझकर कदम लें।" : "Use farm data to make informed decisions."}</p></div></div>
        <div className="sidebar-status"><span className="status-dot" /><span>{lang === "hi" ? "फार्म वर्कस्पेस" : "Farm workspace"}</span></div>
        <div className="user-chip"><span>👤 {currentUser()?.name}</span><button onClick={logout}>{lang === "hi" ? "लॉग आउट" : "Log out"}</button></div>
      </div>
    </aside>

    <div className="app-main">
      <header className="topbar">
        <div className="topbar-title">
          <div className="breadcrumbs"><span>AgriTwinAI</span><span className="crumb-divider">/</span><span>{tabs.find(item => item.key === tab)?.label}</span></div>
          <h1>{tabs.find(item => item.key === tab)?.label}</h1>
          <p>{pageDescriptions[tab]}</p>
        </div>
        <div className="topbar-actions">
          {selectedFarm && <div className="selected-farm"><span className="selected-farm-icon">🌾</span><div><small>{lang === "hi" ? "चुना हुआ खेत" : "SELECTED FARM"}</small><strong>{selectedFarm.name}</strong></div></div>}
          <button className="language-toggle" onClick={() => setLang(lang === "hi" ? "en" : "hi")} aria-label="Switch language">
            <span>文</span>{lang === "hi" ? "English" : "हिंदी"}
          </button>
        </div>
      </header>

      <main className="content">
        {tab === "farms" && meta && <>
          <section className="welcome-banner">
            <div className="welcome-copy">
              <span className="banner-kicker">{lang === "hi" ? "आपका स्मार्ट फार्म साथी" : "YOUR SMART FARM COMPANION"}</span>
              <h2>{lang === "hi" ? "नमस्ते, किसान! 👋" : "Hello, farmer! 👋"}</h2>
              <p>{lang === "hi" ? "फसल, मौसम और सिंचाई की जानकारी को एक ही जगह पर समझें।" : "Bring crop, weather and irrigation information together in one place."}</p>
              <button className="banner-action" onClick={() => document.getElementById("farm-create-form")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                {lang === "hi" ? "＋ नया खेत जोड़ें" : "＋ Add a new farm"} <span>→</span>
              </button>
            </div>
            <div className="welcome-art" aria-hidden="true">
              <div className="sun-disc" />
              <div className="hill hill-back" />
              <div className="hill hill-front" />
              <div className="plant plant-one">🌾</div>
              <div className="plant plant-two">🌱</div>
            </div>
          </section>

          <section className="overview-grid" aria-label="Farm overview">
            <div className="overview-card"><span className="overview-icon green">⌂</span><div><span>{lang === "hi" ? "कुल खेत" : "Total farms"}</span><strong>{farms.length}</strong><small>{lang === "hi" ? "आपके वर्कस्पेस में" : "In your workspace"}</small></div></div>
            <div className="overview-card"><span className="overview-icon blue">◈</span><div><span>{lang === "hi" ? "समर्थित फसलें" : "Supported crops"}</span><strong>{Object.keys(meta.crops).length}</strong><small>{lang === "hi" ? "प्रोटोटाइप में उपलब्ध" : "Available in this prototype"}</small></div></div>
            <div className="overview-card"><span className="overview-icon gold">文</span><div><span>{lang === "hi" ? "भाषा" : "Language"}</span><strong>{lang === "hi" ? "हिंदी" : "English"}</strong><small>{lang === "hi" ? "एक क्लिक में बदलें" : "Switch anytime"}</small></div></div>
          </section>

          <section className="section-heading">
            <div><h2>{lang === "hi" ? "आपके खेत" : "Your farms"}</h2><p>{lang === "hi" ? "खेत चुनकर उसका डिजिटल ट्विन खोलें।" : "Select a farm to open its digital twin."}</p></div>
            <span className="count-pill">{farms.length} {lang === "hi" ? "खेत" : farms.length === 1 ? "farm" : "farms"}</span>
          </section>

          {farms.length ? <div className="farms-grid">{farms.map(f => <article className={`farm-card ${sel === f.id ? "farm-card-selected" : ""}`} key={f.id}>
            <div className="farm-card-top"><span className="farm-card-icon">🌿</span><span className="farm-id">FARM #{String(f.id).padStart(2, "0")}</span></div>
            <h3>{f.name}</h3><p className="farm-location">⌖ {Number(f.lat).toFixed(2)}, {Number(f.lon).toFixed(2)}</p>
            <div className="farm-card-meta"><span><small>{lang === "hi" ? "फसल" : "Crop"}</small><strong>{meta.crops[f.crop] || f.crop}</strong></span><span><small>{lang === "hi" ? "क्षेत्रफल" : "Area"}</small><strong>{f.area_ha} ha</strong></span><span><small>{lang === "hi" ? "मिट्टी" : "Soil"}</small><strong>{f.soil}</strong></span></div>
            <div className="farm-card-actions"><button className="btn" onClick={() => { setSel(f.id); setTab("twin"); }}>{t.sel} <span>→</span></button><button className="icon-button danger" title={t.del} aria-label={`${t.del} ${f.name}`} onClick={async () => { if (!window.confirm(lang === "hi" ? `क्या आप "${f.name}" हटाना चाहते हैं?` : `Delete "${f.name}"?`)) return; await api(`/farms/${f.id}`, { method: "DELETE" }); await load(sel === f.id ? null : sel); }}>{/* simple bin icon */}⌫</button></div>
          </article>)}</div> : <div className="empty-state"><span>🌱</span><h3>{lang === "hi" ? "अभी कोई खेत नहीं है" : "No farms added yet"}</h3><p>{lang === "hi" ? "शुरू करने के लिए नीचे अपनी पहली farm details जोड़ें।" : "Add your first farm details below to get started."}</p></div>}

          <section id="farm-create-form" className="create-farm-section">
            <div className="section-heading"><div><h2>{lang === "hi" ? "नया खेत जोड़ें" : "Add a farm"}</h2><p>{lang === "hi" ? "अपने खेत की बुनियादी जानकारी भरें।" : "Enter the basic details of your farm."}</p></div><span className="section-step">01 / SETUP</span></div>
            <FarmForm t={t} meta={meta} onDone={async created => { await load(created?.id ?? null); setTab("farms"); }} />
          </section>
        </>}

        {tab !== "farms" && (sel ? <div className="feature-content">
          {tab === "twin" && <Twin t={t} lang={lang} id={sel} />}
          {tab === "whatif" && <WhatIf t={t} lang={lang} id={sel} />}
          {tab === "hist" && <History t={t} id={sel} />}
          {tab === "ins" && <Insights lang={lang} id={sel} />}
          {tab === "scan" && <DiseaseScan lang={lang} id={sel} />}
          {tab === "sch" && <Schemes lang={lang} id={sel} />}
          {tab === "mandi" && <Mandi lang={lang} farm={selectedFarm} />}
        </div> : <div className="empty-state"><span>🌱</span><h3>{t.pick}</h3><p>{lang === "hi" ? "पहले खेत जोड़ें या खेतों की सूची से एक चुनें।" : "Add a farm or choose one from the farm list first."}</p><button className="btn" onClick={() => setTab("farms")}>{lang === "hi" ? "खेतों पर जाएँ" : "Go to farms"} →</button></div>)}
      </main>
      <footer className="app-footer"><span>🌱 AgriTwinAI</span><span>{lang === "hi" ? "स्मार्ट खेती के लिए बनाया गया" : "Built for smarter farming decisions"}</span><span className="footer-version">Prototype · v1.0</span></footer>
    </div>
  </div>;
}
