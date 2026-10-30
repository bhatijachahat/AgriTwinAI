"""Simple signup/login: PBKDF2 password hashing + HMAC-signed bearer tokens (stdlib only)."""
import os, hmac, hashlib, base64, json, time, secrets, re, httpx
from contextvars import ContextVar
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

SECRET = os.getenv("AUTH_SECRET", "dev-only-change-me").encode()
TTL = 7 * 24 * 3600
current_uid: ContextVar = ContextVar("current_uid", default=None)

class Signup(BaseModel):
    name: str; email: str; password: str
class Login(BaseModel):
    email: str; password: str

class OtpReq(BaseModel):
    phone: str
class OtpVerify(BaseModel):
    phone: str; code: str; name: str = ""

OTP_TTL, MAX_TRIES, RESEND_AFTER = 300, 5, 45

def norm_phone(p):
    d = re.sub(r"\D", "", p or "")
    d = d[-10:] if len(d) >= 10 else d
    return d if re.fullmatch(r"[6-9]\d{9}", d) else None

def _otp_hash(phone, code): return hmac.new(SECRET, (phone + ":" + code).encode(), hashlib.sha256).hexdigest()

def send_sms(phone, code):
    """Fast2SMS OTP route when FAST2SMS_KEY is set; otherwise prints the OTP in the server console (local dev only)."""
    key = os.getenv("FAST2SMS_KEY")
    if not key:
        print(f"[AgriTwinAI] OTP for {phone}: {code}  (no SMS provider configured - local dev mode)")
        return
    r = httpx.post("https://www.fast2sms.com/dev/bulkV2", headers={"authorization": key},
                   json={"route": "otp", "variables_values": code, "numbers": phone}, timeout=15)
    r.raise_for_status()

def _hash(pw, salt): return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200_000).hex()
def _b64(b): return base64.urlsafe_b64encode(b).decode().rstrip("=")

def make_token(uid):
    body = _b64(json.dumps({"uid": uid, "exp": int(time.time()) + TTL}).encode())
    return body + "." + _b64(hmac.new(SECRET, body.encode(), hashlib.sha256).digest())

def read_token(tok):
    try:
        body, sig = tok.split(".")
        good = _b64(hmac.new(SECRET, body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good): return None
        p = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        return p["uid"] if p["exp"] > time.time() else None
    except Exception:
        return None

def make_router(m):
    r = APIRouter(prefix="/auth")
    with m.db() as c:
        c.execute("CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, salt BLOB, pw TEXT)")
        if "phone" not in [x[1] for x in c.execute("PRAGMA table_info(users)")]:
            c.execute("ALTER TABLE users ADD COLUMN phone TEXT")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_users_phone ON users(phone)")
        c.execute("CREATE TABLE IF NOT EXISTS otps(phone TEXT PRIMARY KEY, code TEXT, exp REAL, tries INT, sent REAL)")
        if "user_id" not in [x[1] for x in c.execute("PRAGMA table_info(farms)")]:
            c.execute("ALTER TABLE farms ADD COLUMN user_id INTEGER")

    def reply(uid, name, email=None, phone=None): return dict(token=make_token(uid), user=dict(id=uid, name=name, email=email, phone=phone))

    @r.post("/signup")
    def signup(s: Signup):
        email = s.email.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email): raise HTTPException(400, "Enter a valid email")
        if len(s.password) < 8: raise HTTPException(400, "Password must be at least 8 characters")
        if not s.name.strip(): raise HTTPException(400, "Name is required")
        salt = secrets.token_bytes(16)
        try:
            with m.db() as c:
                cur = c.execute("INSERT INTO users(name,email,salt,pw) VALUES(?,?,?,?)", (s.name.strip(), email, salt, _hash(s.password, salt)))
        except Exception:
            raise HTTPException(409, "This email is already registered")
        return reply(cur.lastrowid, s.name.strip(), email)

    @r.post("/login")
    def login(s: Login):
        with m.db() as c: u = c.execute("SELECT * FROM users WHERE email=?", (s.email.strip().lower(),)).fetchone()
        if not u or not u["pw"] or not hmac.compare_digest(u["pw"], _hash(s.password, u["salt"])): raise HTTPException(401, "Wrong email or password")
        return reply(u["id"], u["name"], u["email"])

    @r.post("/otp/request")
    def otp_request(o: OtpReq):
        ph = norm_phone(o.phone)
        if not ph: raise HTTPException(400, "Enter a valid 10-digit mobile number")
        now = time.time(); code = f"{secrets.randbelow(10**6):06d}"
        with m.db() as c:
            row = c.execute("SELECT sent FROM otps WHERE phone=?", (ph,)).fetchone()
            if row and now - row["sent"] < RESEND_AFTER: raise HTTPException(429, f"Please wait {int(RESEND_AFTER - (now - row['sent'])) + 1}s before asking for a new OTP")
            c.execute("INSERT OR REPLACE INTO otps(phone,code,exp,tries,sent) VALUES(?,?,?,?,?)", (ph, _otp_hash(ph, code), now + OTP_TTL, 0, now))
            new = c.execute("SELECT 1 FROM users WHERE phone=?", (ph,)).fetchone() is None
        try: send_sms(ph, code)
        except Exception:
            with m.db() as c: c.execute("DELETE FROM otps WHERE phone=?", (ph,))
            raise HTTPException(502, "Could not send the SMS. Please try again.")
        return dict(sent=True, new_user=new)

    @r.post("/otp/verify")
    def otp_verify(o: OtpVerify):
        ph = norm_phone(o.phone)
        if not ph: raise HTTPException(400, "Enter a valid 10-digit mobile number")
        with m.db() as c:
            row = c.execute("SELECT * FROM otps WHERE phone=?", (ph,)).fetchone()
            u = c.execute("SELECT * FROM users WHERE phone=?", (ph,)).fetchone()
            if not row or row["exp"] < time.time(): raise HTTPException(400, "OTP expired. Please request a new one.")
            if row["tries"] >= MAX_TRIES: raise HTTPException(429, "Too many wrong attempts. Request a new OTP.")
            if not u and not o.name.strip(): raise HTTPException(400, "Name is required")
            if not hmac.compare_digest(row["code"], _otp_hash(ph, o.code.strip())):
                c.execute("UPDATE otps SET tries=tries+1 WHERE phone=?", (ph,))
                raise HTTPException(400, "Wrong OTP")
            c.execute("DELETE FROM otps WHERE phone=?", (ph,))
            if u: return reply(u["id"], u["name"], u["email"], ph)
            cur = c.execute("INSERT INTO users(name,phone) VALUES(?,?)", (o.name.strip(), ph))
        return reply(cur.lastrowid, o.name.strip(), None, ph)

    @r.get("/me")
    def me():
        uid = current_uid.get()
        with m.db() as c: u = c.execute("SELECT id,name,email,phone FROM users WHERE id=?", (uid,)).fetchone()
        if not u: raise HTTPException(401, "Not signed in")
        return dict(user=dict(u))
    return r
