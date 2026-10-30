import { useEffect, useState } from "react";

const api = (p, o) => fetch("/api" + p, o).then(async r => {
  if (!r.ok) throw new Error((await r.json()).detail || r.statusText);
  return r.json();
});
const Row = ({ k, v }) => <p style={{ margin: ".2rem 0" }}><b>{k}:</b> {v}</p>;

export default function Insights({ lang, id }) {
  const hi = lang === "hi";
  const [d, setD] = useState(null), [e, setE] = useState("");
  const [q, setQ] = useState(""), [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false), [listening, setListening] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setD(null); setE(""); setMessages([]);
    api(`/farms/${id}/insights?lang=${lang}`).then(setD).catch(x => setE(x.message));
  }, [id, lang]);

  const ask = async () => {
    const question = q.trim();
    if (!question || busy) return;
    setMessages(prev => [...prev, { role: "user", text: question }]);
    setQ(""); setBusy(true);
    try {
      const result = await api(`/farms/${id}/chat?lang=${lang}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      setMessages(prev => [...prev, { role: "assistant", text: result.answer }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: "error", text: error.message }]);
    } finally {
      setBusy(false);
    }
  };

  const startVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMsg(hi ? "इस ब्राउज़र में voice input उपलब्ध नहीं है।" : "Voice input is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = hi ? "hi-IN" : "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { setListening(true); setMsg(""); };
    recognition.onresult = event => setQ(event.results?.[0]?.[0]?.transcript || "");
    recognition.onerror = () => setMsg(hi ? "आवाज़ समझ नहीं आई। फिर कोशिश करें।" : "Could not recognise speech. Please try again.");
    recognition.onend = () => setListening(false);
    recognition.start();
  };

  const speakLatest = () => {
    const latest = [...messages].reverse().find(item => item.role === "assistant");
    if (!latest?.text || !("speechSynthesis" in window)) {
      setMsg(hi ? "आवाज़ में जवाब उपलब्ध नहीं है।" : "Speech playback is not available.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(latest.text);
    utterance.lang = hi ? "hi-IN" : "en-IN";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
    setMsg("");
  };

  const alert_ = async () => {
    try {
      const result = await api(`/farms/${id}/alert?lang=${lang}`, { method: "POST" });
      setMsg(result.sent ? "✔ Telegram alert sent" : "Telegram is not configured on the backend.");
    } catch (error) { setMsg(error.message); }
  };

  if (e) return <p className="err">{e}</p>;
  if (!d) return <div className="panel loading-panel">🌱 {hi ? "सलाह लोड हो रही है…" : "Loading farm insights…"}</div>;

  const risk = { high: "var(--dry)", medium: "var(--grain)", low: "var(--leaf)" }[d.disease.level];
  return <>
    <div className="insights-grid">
      <div className="panel insight-panel" style={{ borderTop: `4px solid ${risk}` }}>
        <div className="panel-eyebrow">{hi ? "फसल सुरक्षा" : "CROP PROTECTION"}</div>
        <h3>{hi ? "रोग जोखिम" : "Disease risk"}</h3>
        <span className={`risk-pill risk-${d.disease.level}`}>{d.disease.level}</span>
        <p>{d.disease.advice}</p>
      </div>
      <div className="panel insight-panel">
        <div className="panel-eyebrow">{hi ? "फसल पोषण" : "CROP NUTRITION"}</div>
        <h3>{hi ? "इस अवस्था में खाद" : "Fertilizer for this stage"}</h3>
        <div className="nutrient-grid">
          <div><span>N</span><b>{d.fertilizer.N_kg} kg</b></div>
          <div><span>P</span><b>{d.fertilizer.P_kg} kg</b></div>
          <div><span>K</span><b>{d.fertilizer.K_kg} kg</b></div>
        </div>
        <small>{d.fertilizer.note}</small>
      </div>
      <div className="panel insight-panel">
        <div className="panel-eyebrow">{hi ? "मौसमी सलाह" : "SEASONAL ADVISORY"}</div>
        <h3>{hi ? "इस मौसम की फसलें" : "Crops for this season"} ({d.crop_reco.season})</h3>
        <div className="crop-chips">{d.crop_reco.ranked.map(crop => <span key={crop}>{crop}</span>)}</div>
      </div>
      <div className="panel insight-panel">
        <div className="panel-eyebrow">{hi ? "संसाधन प्रभाव" : "RESOURCE IMPACT"}</div>
        <h3>{hi ? "अनुमानित बचत" : "Estimated savings"}</h3>
        <div className="savings-grid">
          <div><span>💧 {hi ? "पानी" : "Water"}</span><b>{d.savings.water_saved_l.toLocaleString()} L</b></div>
          <div><span>💰 {hi ? "पैसा" : "Money"}</span><b>₹{d.savings.money_saved_inr}</b></div>
          <div><span>🌿 CO₂</span><b>{d.savings.co2_saved_kg} kg</b></div>
        </div>
        <small>{d.savings.note}</small>
      </div>
    </div>

    <div className="panel schemes-summary">
      <div><div className="panel-eyebrow">{hi ? "सहायता और लाभ" : "SUPPORT & BENEFITS"}</div><h3>{hi ? "सरकारी योजनाएँ" : "Government schemes"}</h3></div>
      <div className="scheme-mini-list">{d.schemes.schemes.map(s => <div className="scheme-mini" key={s.name}><span className="scheme-mini-icon">↗</span><div><b>{s.name}</b><p>{s.why}</p></div></div>)}</div>
      <small>{d.schemes.note}</small>
    </div>

    <div className="panel assistant-panel">
      <div className="assistant-heading">
        <div className="assistant-avatar">✦</div>
        <div><div className="panel-eyebrow">{hi ? "आपका कृषि सहायक" : "YOUR FARM ASSISTANT"}</div><h3>{hi ? "AgriTwinAI सहायक" : "AgriTwinAI Assistant"}</h3><p>{hi ? "अपने खेत के बारे में हिंदी में पूछें।" : "Ask a question about your farm in English or Hindi."}</p></div>
        <span className="assistant-status"><i /> {hi ? "तैयार" : "Ready"}</span>
      </div>
      <div className="chat-messages" aria-live="polite">
        {messages.length === 0 && <div className="chat-welcome"><span>🌾</span><p>{hi ? "उदाहरण: आज सिंचाई करनी चाहिए?" : "Try asking: Should I irrigate today?"}</p></div>}
        {messages.map((item, index) => <div key={`${index}-${item.role}`} className={`chat-row ${item.role}`}>
          {item.role === "assistant" && <span className="chat-avatar">✦</span>}
          <div className="chat-bubble">{item.text}</div>
        </div>)}
        {busy && <div className="chat-row assistant"><span className="chat-avatar">✦</span><div className="chat-bubble typing">{hi ? "सोच रहा है…" : "Thinking…"}</div></div>}
      </div>
      <form className="chat-compose" onSubmit={event => { event.preventDefault(); ask(); }}>
        <input value={q} onChange={event => setQ(event.target.value)} placeholder={hi ? "अपने खेत के बारे में पूछें…" : "Ask about your farm…"} aria-label={hi ? "अपना सवाल लिखें" : "Type your question"} />
        <button type="button" className={`icon-button ${listening ? "listening" : ""}`} onClick={startVoiceInput} aria-label={hi ? "आवाज़ से सवाल पूछें" : "Use voice input"} title={hi ? "आवाज़ से पूछें" : "Voice input"}>{listening ? "●" : "🎙"}</button>
        <button type="submit" className="btn" disabled={!q.trim() || busy}>{hi ? "पूछें" : "Ask"} <span>→</span></button>
      </form>
      <div className="assistant-actions"><button className="text-action" onClick={speakLatest}>🔊 {hi ? "जवाब सुनें" : "Read latest answer aloud"}</button><button className="text-action" onClick={alert_}>🔔 {hi ? "Telegram अलर्ट" : "Telegram alert"}</button></div>
      {msg && <p className="helper-message">{msg}</p>}
      <small className="advisory-disclaimer">{hi ? "सलाह को शुरुआती जानकारी की तरह लें। महत्वपूर्ण कृषि निर्णयों के लिए स्थानीय कृषि विशेषज्ञ से पुष्टि करें।" : "Treat this as preliminary guidance. Verify important crop decisions with a local agricultural expert."}</small>
    </div>
  </>;
}
