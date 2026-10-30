import { useState } from "react";

const KEY = "agritwin_auth";

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
};

// Attach login token to API requests.
const nativeFetch = window.fetch.bind(window);

window.fetch = (url, opts = {}) => {
  const a = read();
  const api = typeof url === "string" && url.startsWith("/api");

  if (a && api) {
    opts = {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        Authorization: "Bearer " + a.token,
      },
    };
  }

  return nativeFetch(url, opts).then((r) => {
    if (
      r.status === 401 &&
      api &&
      !url.startsWith("/api/auth/") &&
      read()
    ) {
      wipe();
    }

    return r;
  });
};

function wipe() {
  localStorage.removeItem(KEY);
  localStorage.removeItem("agritwin_queue");

  const done = () => window.location.reload();

  if ("caches" in window) {
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((key) => caches.delete(key)))
      )
      .then(done, done);
  } else {
    done();
  }
}

export const logout = wipe;
export const currentUser = () => read()?.user;

const TXT = {
  en: {
    phone: "Phone OTP",
    email: "Email",
    login: "Log in",
    signup: "Create account",
    name: "Full name",
    mob: "Mobile number",
    em: "Email address",
    pw: "Password",
    hint: "At least 8 characters",
    getOtp: "Send OTP",
    otp: "Enter 6-digit OTP",
    verify: "Verify & continue",
    change: "Change number",
    sent: "OTP sent to",
    no: "New to AgriTwinAI?",
    have: "Already have an account?",
    sub: "Smart farming, simply",
    wait: "Please wait…",
    newName: "Your name (new account)",
    welcome: "Grow smarter. Farm better.",
    description:
      "Your farm, weather and irrigation — brought together in one simple place.",
    secure: "A smarter future for every farm",
  },

  hi: {
    phone: "फ़ोन OTP",
    email: "ईमेल",
    login: "लॉग इन",
    signup: "खाता बनाएँ",
    name: "पूरा नाम",
    mob: "मोबाइल नंबर",
    em: "ईमेल पता",
    pw: "पासवर्ड",
    hint: "कम से कम 8 अक्षर",
    getOtp: "OTP भेजें",
    otp: "6 अंकों का OTP डालें",
    verify: "जाँचें और आगे बढ़ें",
    change: "नंबर बदलें",
    sent: "OTP भेजा गया:",
    no: "AgriTwinAI पर नए हैं?",
    have: "पहले से खाता है?",
    sub: "स्मार्ट खेती, आसान तरीक़े से",
    wait: "कृपया प्रतीक्षा करें…",
    newName: "आपका नाम (नया खाता)",
    welcome: "खेती बने और भी स्मार्ट।",
    description:
      "आपका खेत, मौसम और सिंचाई — सब कुछ एक आसान जगह पर।",
    secure: "हर खेत के लिए बेहतर भविष्य",
  },
};

const post = async (path, body) => {
  const r = await fetch("/api/auth/" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const j = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(j.detail || "Something went wrong");
  }

  return j;
};

// Custom AgriTwinAI leaf logo.
function BrandMark() {
  return (
    <span className="auth-logo-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <path
          d="M24 39V23"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />

        <path
          d="M24 27C10 27 8 17 9 9c11 0 19 4 19 14"
          fill="currentColor"
        />

        <path
          d="M24 21C24 10 32 5 41 5c1 12-5 21-17 21"
          fill="currentColor"
          opacity=".72"
        />

        <path
          d="M13 39h22"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export default function AuthGate({ children }) {
  const [auth, setAuth] = useState(read);

  const [way, setWay] = useState("phone");
  const [mode, setMode] = useState("login");
  const [lang, setLang] = useState("hi");

  const [f, setF] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    code: "",
  });

  const [step, setStep] = useState(1);
  const [isNew, setIsNew] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const t = TXT[lang];

  const s = (k) => (e) =>
    setF((old) => ({
      ...old,
      [k]: e.target.value,
    }));

  // Show the dashboard after successful authentication.
  if (auth) return children;

  const finish = (j) => {
    localStorage.setItem(KEY, JSON.stringify(j));
    setAuth(j);
  };

  const run = (fn) => async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);

    try {
      await fn();
    } catch (x) {
      setErr(x.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = run(async () => {
    const j = await post("otp/request", {
      phone: f.phone,
    });

    setIsNew(j.new_user);
    setStep(2);
  });

  const verify = run(async () => {
    finish(
      await post("otp/verify", {
        phone: f.phone,
        code: f.code,
        name: f.name,
      })
    );
  });

  const emailGo = run(async () => {
    const body =
      mode === "login"
        ? {
            email: f.email,
            password: f.password,
          }
        : {
            name: f.name,
            email: f.email,
            password: f.password,
          };

    finish(await post(mode, body));
  });

  const switchWay = (w) => {
    setWay(w);
    setErr("");
    setStep(1);
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setErr("");
  };

  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />

      {/* Language button */}
      <button
        className="language-toggle auth-lang"
        type="button"
        onClick={() =>
          setLang(lang === "hi" ? "en" : "hi")
        }
      >
        <span>文</span>
        {lang === "hi" ? "English" : "हिंदी"}
      </button>

      <div className="auth-layout">
        {/* LEFT BRANDING PANEL */}
        <section className="auth-showcase">
          <div className="auth-brand-lockup">
            <BrandMark />

            <div className="auth-wordmark">
              <strong>
                AgriTwin<span>AI</span>
              </strong>
              <small>{t.sub}</small>
            </div>
          </div>

          <div className="auth-showcase-copy">
            <span className="auth-eyebrow">
              <i />
              SMART FARMING PLATFORM
            </span>

            <h1>{t.welcome}</h1>

            <p>{t.description}</p>
          </div>

          {/* Decorative farming landscape */}
          <div className="auth-landscape" aria-hidden="true">
            <div className="auth-sun" />

            <div className="auth-cloud auth-cloud-one" />
            <div className="auth-cloud auth-cloud-two" />

            <div className="auth-hill auth-hill-back" />
            <div className="auth-hill auth-hill-front" />

            <div className="auth-field-lines">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>

            <div className="auth-sprout">🌱</div>
          </div>

          <div className="auth-showcase-foot">
            <span className="auth-foot-icon">✦</span>

            <span>{t.secure}</span>

            <span className="auth-foot-line" />
          </div>
        </section>

        {/* RIGHT LOGIN PANEL */}
        <section className="auth-form-side">
          <div className="auth-card panel">
            {/* Mobile logo */}
            <div className="auth-mobile-brand">
              <BrandMark />

              <div className="auth-wordmark">
                <strong>
                  AgriTwin<span>AI</span>
                </strong>
                <small>{t.sub}</small>
              </div>
            </div>

            <div className="auth-heading">
              <span className="auth-step-label">
                {mode === "login"
                  ? "WELCOME BACK"
                  : "GET STARTED"}
              </span>

              <h2>
                {way === "email" && mode === "signup"
                  ? t.signup
                  : way === "email"
                  ? t.login
                  : step === 1
                  ? t.login
                  : t.verify}
              </h2>

              <p>
                {way === "email"
                  ? mode === "login"
                    ? "Sign in to continue to your farm dashboard."
                    : "Create your account and start farming smarter."
                  : step === 1
                  ? "Enter your mobile number to get a secure OTP."
                  : "Enter the code we sent to your phone."}
              </p>
            </div>

            {/* Phone / Email tabs */}
            <div
              className="auth-tabs"
              role="tablist"
              aria-label="Sign in method"
            >
              <button
                type="button"
                role="tab"
                aria-selected={way === "phone"}
                className={way === "phone" ? "on" : ""}
                onClick={() => switchWay("phone")}
              >
                <span>▣</span>
                {t.phone}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={way === "email"}
                className={way === "email" ? "on" : ""}
                onClick={() => switchWay("email")}
              >
                <span>✉</span>
                {t.email}
              </button>
            </div>

            {/* PHONE NUMBER */}
            {way === "phone" && step === 1 && (
              <form
                className="auth-form"
                onSubmit={sendOtp}
              >
                <label>
                  {t.mob}

                  <div className="phone-row">
                    <span className="phone-country">
                      🇮🇳 +91
                    </span>

                    <input
                      required
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={10}
                      pattern="[6-9][0-9]{9}"
                      value={f.phone}
                      onChange={(e) =>
                        setF((old) => ({
                          ...old,
                          phone: e.target.value.replace(
                            /\D/g,
                            ""
                          ),
                        }))
                      }
                      placeholder="98765 43210"
                      aria-label={t.mob}
                    />
                  </div>
                </label>

                {err && (
                  <div className="auth-error" role="alert">
                    ⚠ {err}
                  </div>
                )}

                <button
                  className="btn auth-submit"
                  disabled={busy}
                >
                  {busy ? (
                    t.wait
                  ) : (
                    <>
                      {t.getOtp}
                      <span>→</span>
                    </>
                  )}
                </button>

                <p className="auth-legal">
                  By continuing, you agree to use AgriTwinAI
                  responsibly.
                </p>
              </form>
            )}

            {/* VERIFY OTP */}
            {way === "phone" && step === 2 && (
              <form
                className="auth-form"
                onSubmit={verify}
              >
                <div className="auth-sent-note">
                  <span>✉</span>

                  <p>
                    {t.sent}{" "}
                    <strong>+91 {f.phone}</strong>
                  </p>
                </div>

                <label>
                  {t.otp}

                  <input
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    value={f.code}
                    onChange={(e) =>
                      setF((old) => ({
                        ...old,
                        code: e.target.value.replace(
                          /\D/g,
                          ""
                        ),
                      }))
                    }
                    placeholder="• • • • • •"
                    autoFocus
                  />
                </label>

                {isNew && (
                  <label>
                    {t.newName}

                    <input
                      required
                      autoComplete="name"
                      value={f.name}
                      onChange={s("name")}
                      placeholder="e.g. Ramesh Kumar"
                    />
                  </label>
                )}

                {err && (
                  <div className="auth-error" role="alert">
                    ⚠ {err}
                  </div>
                )}

                <button
                  className="btn auth-submit"
                  disabled={busy}
                >
                  {busy ? (
                    t.wait
                  ) : (
                    <>
                      {t.verify}
                      <span>→</span>
                    </>
                  )}
                </button>

                <p className="auth-switch">
                  <a
                    href="#change-number"
                    onClick={(e) => {
                      e.preventDefault();
                      setErr("");
                      setStep(1);

                      setF((old) => ({
                        ...old,
                        code: "",
                      }));
                    }}
                  >
                    {t.change}
                  </a>
                </p>
              </form>
            )}

            {/* EMAIL LOGIN / SIGNUP */}
            {way === "email" && (
              <>
                <div
                  className="auth-mode-switch"
                  aria-label="Account type"
                >
                  <button
                    type="button"
                    className={
                      mode === "login" ? "selected" : ""
                    }
                    onClick={() => switchMode("login")}
                  >
                    {t.login}
                  </button>

                  <button
                    type="button"
                    className={
                      mode === "signup" ? "selected" : ""
                    }
                    onClick={() => switchMode("signup")}
                  >
                    {t.signup}
                  </button>
                </div>

                <form
                  className="auth-form"
                  onSubmit={emailGo}
                >
                  {mode === "signup" && (
                    <label>
                      {t.name}

                      <input
                        required
                        autoComplete="name"
                        value={f.name}
                        onChange={s("name")}
                        placeholder="e.g. Diya Sharma"
                      />
                    </label>
                  )}

                  <label>
                    {t.em}

                    <input
                      required
                      type="email"
                      autoComplete="email"
                      value={f.email}
                      onChange={s("email")}
                      placeholder="you@example.com"
                    />
                  </label>

                  <label>
                    {t.pw}

                    <input
                      required
                      type="password"
                      minLength={
                        mode === "signup" ? 8 : 1
                      }
                      autoComplete={
                        mode === "login"
                          ? "current-password"
                          : "new-password"
                      }
                      value={f.password}
                      onChange={s("password")}
                      placeholder={
                        mode === "signup"
                          ? t.hint
                          : "Enter your password"
                      }
                    />
                  </label>

                  {err && (
                    <div className="auth-error" role="alert">
                      ⚠ {err}
                    </div>
                  )}

                  <button
                    className="btn auth-submit"
                    disabled={busy}
                  >
                    {busy ? (
                      t.wait
                    ) : (
                      <>
                        {mode === "login"
                          ? t.login
                          : t.signup}
                        <span>→</span>
                      </>
                    )}
                  </button>

                  <p className="auth-switch">
                    {mode === "login" ? t.no : t.have}{" "}

                    <button
                      type="button"
                      onClick={() =>
                        switchMode(
                          mode === "login"
                            ? "signup"
                            : "login"
                        )
                      }
                    >
                      {mode === "login"
                        ? t.signup
                        : t.login}
                    </button>
                  </p>
                </form>
              </>
            )}

            <div className="auth-bottom-note">
              <span className="auth-lock">✓</span>
              Your farming workspace, all in one place
            </div>
          </div>

          <p className="auth-copyright">
            © {new Date().getFullYear()} AgriTwinAI ·
            Built for smarter farming
          </p>
        </section>
      </div>
    </main>
  );
}