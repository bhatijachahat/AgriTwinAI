"""AgriTwinAI backend: FastAPI + SQLite + Open-Meteo."""
from dotenv import load_dotenv
load_dotenv()
import sqlite3, httpx
from datetime import date, timedelta
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from . import auth
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .features import make_router
from . import disease_ai
from . import mandi

app = FastAPI(title="AgriTwinAI")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
import os
DB = os.getenv("DB_PATH", "agritwin.db")

def db():
    c = sqlite3.connect(DB); c.row_factory = sqlite3.Row; return c

with db() as c:
    c.execute("""CREATE TABLE IF NOT EXISTS farms(id INTEGER PRIMARY KEY, name TEXT, lat REAL, lon REAL,
        crop TEXT, sowing_date TEXT, area_ha REAL, soil TEXT, efficiency REAL, pump_lph REAL)""")
    c.execute("""CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY, farm_id INT, day TEXT, mm REAL, liters REAL)""")

# Crop data: base temp, GDD at end of stages (init, dev, mid, late), Kc per stage, root depth (m), depletion p, Ky
CROPS = {
 "rice":   dict(hi="धान", tb=10, g=[200, 600, 1300, 1700], kc=[1.05, 1.1, 1.2, 0.9], root=0.5, p=0.2, ky=1.1),
 "wheat":  dict(hi="गेहूं", tb=5, g=[150, 450, 900, 1200], kc=[0.4, 0.8, 1.15, 0.4], root=1.0, p=0.55, ky=1.05),
 "gram":   dict(hi="चना", tb=5, g=[150, 400, 800, 1100], kc=[0.4, 0.75, 1.0, 0.35], root=0.8, p=0.5, ky=0.9),
 "maize":  dict(hi="मक्का", tb=10, g=[180, 500, 900, 1400], kc=[0.4, 0.8, 1.2, 0.6], root=1.0, p=0.55, ky=1.25),
 "tomato": dict(hi="टमाटर", tb=10, g=[150, 450, 900, 1300], kc=[0.6, 0.9, 1.15, 0.8], root=0.7, p=0.4, ky=1.05),
}
STAGES = ["initial", "development", "mid", "late"]
STAGES_HI = ["शुरुआती", "विकास", "मध्य (फूल/दाना)", "परिपक्वता"]
# Soil water (mm per metre depth): field capacity, wilting point
SOILS = {"clay": (360, 200), "loam": (280, 120), "sandy": (150, 60), "red": (220, 100)}

class Farm(BaseModel):
    name: str; lat: float; lon: float; crop: str; sowing_date: str
    area_ha: float = 1.0; soil: str = "loam"; efficiency: float = 0.75; pump_lph: float = 20000

class Log(BaseModel):
    day: str; mm: float

class WhatIf(BaseModel):
    rain_factor: float = 1.0       # 1.0 = forecast as is, 0 = no rain, 2 = double
    irrigation_mm: float = 0       # fixed irrigation per event
    interval_days: int = 0         # 0 = no irrigation

def stage_of(g, crop):
    for i, lim in enumerate(CROPS[crop]["g"]):
        if g <= lim: return i
    return 3

def simulate(days, farm, logs, rain_factor=1.0, irr_mm=0, interval=0, today=None):
    """Daily FAO-56 water balance. Returns per-day rows."""
    cr = CROPS[farm["crop"]]; fc, wp = SOILS[farm["soil"]]
    taw = (fc - wp) * cr["root"] / 1000 * 1000 / 1000 * 1000 / 1000 if False else (fc - wp) * cr["root"]
    raw = cr["p"] * taw
    dr, gdd, rows, since = 0.0, 0.0, [], 0
    for d in days:
        is_fc = d["date"] > today
        rain = d["rain"] * (rain_factor if is_fc else 1.0)
        gdd += max(0, (d["tmax"] + d["tmin"]) / 2 - cr["tb"])
        s = stage_of(gdd, farm["crop"]); kc = cr["kc"][s]
        etc = kc * d["et0"]
        ks = 1.0 if dr <= raw else max(0.0, (taw - dr) / (taw - raw))
        eta = ks * etc
        irr = logs.get(d["date"], 0.0)
        if is_fc and interval > 0:
            since += 1
            if since >= interval: irr += irr_mm; since = 0
        dr = min(max(dr - rain * 0.8 - irr + eta, 0), taw)
        rows.append(dict(date=d["date"], rain=round(rain, 1), et0=round(d["et0"], 2), etc=round(etc, 2),
                         eta=round(eta, 2), irr=irr, dr=round(dr, 1), stage=s, gdd=round(gdd), kc=kc, forecast=is_fc))
    return rows, taw, raw

async def weather(farm):
    today = date.today(); sow = date.fromisoformat(farm["sowing_date"])
    past = min(max((today - sow).days, 0), 90)
    p = dict(latitude=farm["lat"], longitude=farm["lon"], past_days=past, forecast_days=7, timezone="auto",
             daily="temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration",
             hourly="shortwave_radiation")
    try:
        async with httpx.AsyncClient(timeout=20) as cl:
            r = await cl.get("https://api.open-meteo.com/v1/forecast", params=p)
    except httpx.HTTPError:
        raise HTTPException(502, "Weather service (Open-Meteo) unreachable. Check your internet connection.")
    if r.status_code != 200: raise HTTPException(502, "Open-Meteo error")
    j = r.json(); d = j["daily"]
    days = [dict(date=d["time"][i], tmax=d["temperature_2m_max"][i] or 0, tmin=d["temperature_2m_min"][i] or 0,
                 rain=d["precipitation_sum"][i] or 0, et0=d["et0_fao_evapotranspiration"][i] or 0)
            for i in range(len(d["time"]))]
    return days, j["hourly"]

def get_farm(fid):
    with db() as c: r = c.execute("SELECT * FROM farms WHERE id=?", (fid,)).fetchone()
    if not r or r["user_id"] != auth.current_uid.get(): raise HTTPException(404, "Farm not found")
    return dict(r)

def get_logs(fid):
    with db() as c: rows = c.execute("SELECT day, SUM(mm) mm FROM history WHERE farm_id=? GROUP BY day", (fid,)).fetchall()
    return {r["day"]: r["mm"] for r in rows}

def solar_windows(hourly, day, liters, flow, thr=300):
    hrs = [t[11:16] for t, v in zip(hourly["time"], hourly["shortwave_radiation"]) if t.startswith(day) and (v or 0) >= thr]
    need = liters / flow if flow else 0
    return dict(day=day, sun_hours=len(hrs), window=f"{hrs[0]}–{hrs[-1]}" if hrs else None,
                runtime_h=round(need, 1), fits=need <= len(hrs))

def reco(lang, f, st, dr, raw, taw, nxt, mm, rain3, yld):
    hi = lang == "hi"; crop = CROPS[f["crop"]]["hi"] if hi else f["crop"]
    stg = STAGES_HI[st] if hi else STAGES[st]
    if rain3 >= 8:
        return (f"अगले 3 दिन में {rain3:.0f} मिमी बारिश आ रही है। {crop} में सिंचाई रोकें।" if hi
                else f"{rain3:.0f} mm rain expected in 3 days. Skip irrigation for {crop}.")
    if dr >= raw:
        return (f"{crop} ({stg} अवस्था): मिट्टी में नमी कम है। आज {mm:.0f} मिमी सिंचाई करें, सुबह या सोलर धूप में।" if hi
                else f"{crop} ({stg} stage): soil is dry. Irrigate {mm:.0f} mm today, during solar hours.")
    if nxt:
        return (f"{crop} ({stg} अवस्था): नमी ठीक है। अगली सिंचाई {nxt} को, लगभग {mm:.0f} मिमी।" if hi
                else f"{crop} ({stg} stage): moisture OK. Next irrigation on {nxt}, about {mm:.0f} mm.")
    return ("अगले 7 दिन सिंचाई की ज़रूरत नहीं।" if hi else "No irrigation needed in the next 7 days.")

def build(farm, days, hourly, logs, lang="en"):
    today = date.today().isoformat()
    rows, taw, raw = simulate(days, farm, logs, today=today)
    cur = [r for r in rows if r["date"] <= today][-1] if any(r["date"] <= today for r in rows) else rows[0]
    fut = [r for r in rows if r["forecast"]]
    nxt = next((r["date"] for r in fut if r["dr"] >= raw), None)
    cur_dr = cur["dr"]
    mm = min(cur_dr if nxt is None or nxt == today else next(r["dr"] for r in fut if r["date"] == nxt), taw)
    liters = mm * farm["area_ha"] * 10000 / farm["efficiency"]
    rain3 = sum(r["rain"] for r in fut[:3])
    stressed = sum(1 for r in rows if r["eta"] < r["etc"] - 0.01)
    tot_etc = sum(r["etc"] for r in rows) or 1
    yld = round(max(0, 1 - CROPS[farm["crop"]]["ky"] * (1 - sum(r["eta"] for r in rows) / tot_etc)) * 100, 1)
    irr_day = nxt or today
    return dict(farm=farm, stage=STAGES[cur["stage"]], stage_hi=STAGES_HI[cur["stage"]], gdd=cur["gdd"], kc=cur["kc"],
        taw_mm=round(taw, 1), raw_mm=round(raw, 1), depletion_mm=cur_dr,
        moisture_pct=round((1 - cur_dr / taw) * 100) if taw else 0,
        next_irrigation=nxt, irrigation_mm=round(mm, 1), liters=round(liters),
        solar=solar_windows(hourly, irr_day, liters, farm["pump_lph"]),
        stressed_days=stressed, relative_yield_pct=yld, rain_next3_mm=round(rain3, 1),
        recommendation=reco(lang, farm, cur["stage"], cur_dr, raw, taw, nxt, mm, rain3, yld),
        series=rows[-30:])

PUBLIC = ("/auth/signup", "/auth/login", "/auth/otp/request", "/auth/otp/verify", "/meta", "/docs", "/openapi.json", "/redoc")

@app.middleware("http")
async def require_login(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path in PUBLIC: return await call_next(request)
    uid = auth.read_token(request.headers.get("authorization", "").removeprefix("Bearer ").strip())
    if uid is None: return JSONResponse({"detail": "Please log in again"}, status_code=401)
    auth.current_uid.set(uid)
    return await call_next(request)

@app.post("/farms")
def add_farm(f: Farm):
    if f.crop not in CROPS or f.soil not in SOILS: raise HTTPException(400, "Unknown crop or soil")
    with db() as c:
        cur = c.execute("INSERT INTO farms(name,lat,lon,crop,sowing_date,area_ha,soil,efficiency,pump_lph,user_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
                        (f.name, f.lat, f.lon, f.crop, f.sowing_date, f.area_ha, f.soil, f.efficiency, f.pump_lph, auth.current_uid.get()))
    return {"id": cur.lastrowid}

@app.get("/farms")
def list_farms():
    with db() as c: return [dict(r) for r in c.execute("SELECT * FROM farms WHERE user_id=?", (auth.current_uid.get(),))]

@app.delete("/farms/{fid}")
def del_farm(fid: int):
    get_farm(fid)
    with db() as c:
        c.execute("DELETE FROM farms WHERE id=?", (fid,)); c.execute("DELETE FROM history WHERE farm_id=?", (fid,))
    return {"ok": True}

@app.get("/meta")
def meta():
    return dict(crops={k: v["hi"] for k, v in CROPS.items()}, soils=list(SOILS))

@app.get("/farms/{fid}/twin")
async def twin(fid: int, lang: str = "en"):
    farm = get_farm(fid); days, hourly = await weather(farm)
    return build(farm, days, hourly, get_logs(fid), lang)

@app.post("/farms/{fid}/whatif")
async def whatif(fid: int, w: WhatIf, lang: str = "en"):
    farm = get_farm(fid); days, hourly = await weather(farm); logs = get_logs(fid)
    base = build(farm, days, hourly, logs, lang)
    today = date.today().isoformat()
    rows, taw, raw = simulate(days, farm, logs, w.rain_factor, w.irrigation_mm, w.interval_days, today)
    def yl(rs):
        t = sum(r["etc"] for r in rs) or 1
        return round(max(0, 1 - CROPS[farm["crop"]]["ky"] * (1 - sum(r["eta"] for r in rs) / t)) * 100, 1)
    water_mm = sum(r["irr"] for r in rows if r["forecast"])
    return dict(baseline_yield_pct=base["relative_yield_pct"], scenario_yield_pct=yl(rows),
        scenario_stressed_days=sum(1 for r in rows if r["eta"] < r["etc"] - 0.01),
        baseline_stressed_days=base["stressed_days"], irrigation_mm_used=round(water_mm, 1),
        liters_used=round(water_mm * farm["area_ha"] * 10000 / farm["efficiency"]),
        series=[r for r in rows if r["forecast"]])

@app.post("/farms/{fid}/log")
def log_irr(fid: int, l: Log):
    f = get_farm(fid); liters = l.mm * f["area_ha"] * 10000 / f["efficiency"]
    with db() as c: c.execute("INSERT INTO history(farm_id,day,mm,liters) VALUES(?,?,?,?)", (fid, l.day, l.mm, liters))
    return {"ok": True}

@app.get("/farms/{fid}/history")
def history(fid: int):
    with db() as c: rows = [dict(r) for r in c.execute("SELECT * FROM history WHERE farm_id=? ORDER BY day DESC", (fid,))]
    return dict(entries=rows, total_mm=round(sum(r["mm"] for r in rows), 1), total_liters=round(sum(r["liters"] for r in rows)))

import sys
from features import make_router
app.include_router(make_router(sys.modules[__name__]))

import disease_ai
app.include_router(disease_ai.make_router(sys.modules[__name__]))
app.include_router(auth.make_router(sys.modules[__name__]))
import mandi
app.include_router(mandi.make_router(sys.modules[__name__]))
