"""AgriTwinAI Phase 2+3 Features:
Disease Risk, Fertilizer, Crop Recommendation,
Savings, Government Schemes, Groq AI Chatbot,
and Telegram Alerts.
"""

import os
import asyncio
import httpx

from datetime import date
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from schemes import recommend, Profile


# -------------------- CONFIGURATION --------------------

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "qwen/qwen3.8-27b"

NPK = {
    "rice": (120, 60, 40),
    "wheat": (120, 60, 40),
    "gram": (20, 50, 20),
    "maize": (120, 60, 40),
    "tomato": (150, 80, 60),
}

# Nitrogen, phosphorus and potassium shares by crop stage.
FRAC = [
    (0.4, 1, 0.5),
    (0.3, 0, 0.25),
    (0.3, 0, 0.25),
    (0, 0, 0),
]

DISEASE = {
    "rice": "Blast / Sheath blight",
    "wheat": "Rust",
    "gram": "Wilt / Botrytis",
    "maize": "Leaf blight",
    "tomato": "Late blight",
}

SEASON_CROPS = {
    "kharif": ["rice", "maize"],
    "rabi": ["wheat", "gram"],
    "zaid": ["tomato", "maize"],
}

SOIL_FIT = {
    "rice": ["clay", "loam"],
    "wheat": ["loam", "clay"],
    "gram": ["red", "sandy", "loam"],
    "maize": ["loam", "red"],
    "tomato": ["loam", "red", "sandy"],
}

PMFBY = {"rice", "wheat", "gram", "maize"}


# -------------------- REQUEST MODEL --------------------

class Q(BaseModel):
    question: str


# -------------------- SEASON --------------------

def season(m):
    if 6 <= m <= 10:
        return "kharif"

    if m >= 11 or m <= 3:
        return "rabi"

    return "zaid"


# -------------------- DISEASE RISK --------------------

def disease_risk(days, farm, lang):
    today = date.today().isoformat()

    recent = [
        d for d in days
        if d["date"] <= today
    ][-7:]

    wet = sum(
        1 for d in recent
        if d["rain"] >= 2
    )

    t = (
        sum(
            (d["tmax"] + d["tmin"]) / 2
            for d in recent
        )
        / max(1, len(recent))
    )

    if wet >= 3 and 20 <= t <= 30:
        lvl = "high"
    elif wet >= 2:
        lvl = "medium"
    else:
        lvl = "low"

    messages = {
        "high": (
            "ज़्यादा",
            "फफूंद के लक्षणों के लिए खेत की जाँच करें।",
            "Inspect the field for fungal symptoms."
        ),
        "medium": (
            "मध्यम",
            "खेत की नियमित निगरानी रखें।",
            "Monitor the field regularly."
        ),
        "low": (
            "कम",
            "अभी मौसम आधारित खतरा कम है।",
            "Weather-based risk is currently low."
        ),
    }

    hindi, english = messages[lvl][1], messages[lvl][2]

    advice = (
        f"{DISEASE[farm['crop']]}: "
        f"{messages[lvl][0]}। {hindi}"
        if lang == "hi"
        else f"{DISEASE[farm['crop']]}: {lvl} risk. {english}"
    )

    return {
        "level": lvl,
        "disease": DISEASE[farm["crop"]],
        "wet_days_7": wet,
        "avg_temp": round(t, 1),
        "advice": advice,
    }


# -------------------- FERTILIZER --------------------

def fertilizer(farm, st):
    n, p, k = NPK[farm["crop"]]
    f = FRAC[st]
    area = farm["area_ha"]

    return {
        "stage_index": st,
        "N_kg": round(n * f[0] * area, 1),
        "P_kg": round(p * f[1] * area, 1),
        "K_kg": round(k * f[2] * area, 1),
        "note": (
            "Rule-of-thumb estimate. Confirm fertilizer "
            "requirements with a soil test or local KVK."
        ),
    }


# -------------------- CROP RECOMMENDATION --------------------

def crop_reco(farm):
    current_season = season(date.today().month)

    ranked = sorted(
        SEASON_CROPS[current_season],
        key=lambda c: (
            farm["soil"] not in SOIL_FIT[c],
            SOIL_FIT[c].index(farm["soil"])
            if farm["soil"] in SOIL_FIT[c]
            else 9,
        ),
    )

    return {
        "season": current_season,
        "ranked": ranked,
    }


# -------------------- SAVINGS --------------------

def savings(rows, farm):
    etc = sum(
        r["etc"] for r in rows[-30:]
    )

    traditional_liters = (
        etc / 0.5
        * farm["area_ha"]
        * 10000
    )

    smart_liters = (
        etc / farm["efficiency"]
        * farm["area_ha"]
        * 10000
    )

    saved = max(
        0,
        traditional_liters - smart_liters
    )

    kwh = saved / 1000 * 0.08

    return {
        "water_saved_l": round(saved),
        "energy_saved_kwh": round(kwh, 1),
        "money_saved_inr": round(kwh * 8),
        "co2_saved_kg": round(kwh * 0.82, 1),
        "note": (
            "Illustrative estimate compared with flood irrigation. "
            "Actual savings depend on irrigation efficiency, "
            "pump characteristics and field conditions."
        ),
    }


# -------------------- GOVERNMENT SCHEMES --------------------

def schemes(farm):
    profile = Profile(
        irrigation=(
            "flood"
            if farm["efficiency"] < 0.8
            else "drip"
        )
    )

    return recommend(
        farm,
        profile,
        "en"
    )


# -------------------- TELEGRAM ALERT --------------------

async def send_telegram(message):
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")

    if not token or not chat_id:
        return False

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": message,
                },
            )

        return response.status_code == 200

    except httpx.HTTPError:
        return False


# -------------------- GROQ AI CHAT --------------------

async def ask_groq(question, farm, farm_state, lang):
    """
    Sends the farmer's question and farm context to Groq.
    Returns an AI-generated answer.
    """

    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "GROQ_API_KEY is not configured. "
                "Configure the Groq API key in the backend environment."
            ),
        )

    language = (
        "Hindi"
        if lang == "hi"
        else "English"
    )

    system_prompt = f"""
You are AgriTwinAI, an agricultural assistant
helping Indian farmers make better irrigation decisions.

Respond in {language}.
Use simple, farmer-friendly language.
Keep the answer concise and practical.

FARM DETAILS:
Crop: {farm['crop']}
Soil: {farm['soil']}
Farm area: {farm['area_ha']} hectares
Farm name: {farm['name']}

CURRENT FARM MODEL:
{farm_state}

GUIDELINES:
1. Answer the farmer's actual question.
2. Use the supplied farm information when relevant.
3. Never invent weather readings or sensor measurements.
4. If data is estimated rather than measured, explain that.
5. Do not claim a disease is confirmed from weather risk alone.
6. Avoid unsafe pesticide or fertilizer dosage instructions.
7. If information is missing, say so clearly.
8. Give irrigation advice consistent with the available farm state.
"""

    try:
        async with httpx.AsyncClient(timeout=40) as client:
            response = await client.post(
                GROQ_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": GROQ_MODEL,
                    "messages": [
                        {
                            "role": "system",
                            "content": system_prompt,
                        },
                        {
                            "role": "user",
                            "content": question,
                        },
                    ],
                    "temperature": 0.3,
                    "max_tokens": 500,
                },
            )

        if response.status_code != 200:
            print(
                "Groq API error:",
                response.status_code,
                response.text,
            )

            raise HTTPException(
                status_code=502,
                detail=(
                    "Groq AI request failed. "
                    "Check the backend terminal for details."
                ),
            )

        data = response.json()

        answer = (
            data["choices"][0]["message"]["content"]
        )

        if not answer or not answer.strip():
            raise HTTPException(
                status_code=502,
                detail="The AI service returned an empty answer.",
            )

        return answer.strip()

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="AI service timed out. Please try again.",
        )

    except httpx.HTTPError as exc:
        print("Groq connection error:", str(exc))

        raise HTTPException(
            status_code=502,
            detail="Could not connect to the Groq AI service.",
        )


# -------------------- ROUTER --------------------

def make_router(m):
    r = APIRouter()

    # INSIGHTS
    @r.get("/farms/{fid}/insights")
    async def insights(fid: int, lang: str = "en"):
        farm = m.get_farm(fid)

        days, hourly = await m.weather(farm)

        twin = m.build(
            farm,
            days,
            hourly,
            m.get_logs(fid),
            lang,
        )

        stage = m.STAGES.index(
            twin["stage"]
        )

        return {
            "disease": disease_risk(
                days, farm, lang
            ),
            "fertilizer": fertilizer(
                farm, stage
            ),
            "crop_reco": crop_reco(farm),
            "savings": savings(
                twin["series"], farm
            ),
            "schemes": schemes(farm),
        }

    # GOVERNMENT SCHEMES
    @r.post("/farms/{fid}/schemes")
    def schemes_for(
        fid: int,
        profile: Profile,
        lang: str = "en",
    ):
        farm = m.get_farm(fid)

        return recommend(
            farm,
            profile,
            lang,
        )

    # AI ASSISTANT
    @r.post("/farms/{fid}/chat")
    async def chat(
        fid: int,
        q: Q,
        lang: str = "hi",
    ):
        question = q.question.strip()

        if not question:
            raise HTTPException(
                status_code=400,
                detail="Please enter a question.",
            )

        if len(question) > 2000:
            raise HTTPException(
                status_code=400,
                detail="Question is too long. Please keep it under 2000 characters.",
            )

        farm = m.get_farm(fid)

        days, hourly = await m.weather(farm)

        twin = m.build(
            farm,
            days,
            hourly,
            m.get_logs(fid),
            lang,
        )

        # Do not send the full time-series to the AI.
        twin.pop("series", None)

        answer = await ask_groq(
            question,
            farm,
            twin,
            lang,
        )

        return {
            "answer": answer,
        }

    # TELEGRAM ALERT
    @r.post("/farms/{fid}/alert")
    async def alert(
        fid: int,
        lang: str = "hi",
    ):
        farm = m.get_farm(fid)

        days, hourly = await m.weather(farm)

        twin = m.build(
            farm,
            days,
            hourly,
            m.get_logs(fid),
            lang,
        )

        sent = await send_telegram(
            f"{farm['name']}: {twin['recommendation']}"
        )

        return {
            "sent": sent,
        }

    # PERIODIC TELEGRAM ALERTS
    async def daily_alerts():
        while True:
            await asyncio.sleep(21600)

            try:
                with m.db() as connection:
                    farms = [
                        dict(row)
                        for row in connection.execute(
                            "SELECT * FROM farms"
                        ).fetchall()
                    ]

                for farm in farms:
                    try:
                        days, hourly = await m.weather(
                            farm
                        )

                        twin = m.build(
                            farm,
                            days,
                            hourly,
                            m.get_logs(farm["id"]),
                            "hi",
                        )

                        await send_telegram(
                            f"{farm['name']}: "
                            f"{twin['recommendation']}"
                        )

                    except Exception as exc:
                        print(
                            "Telegram alert error:",
                            str(exc),
                        )

            except Exception as exc:
                print(
                    "Daily alert task error:",
                    str(exc),
                )

    @r.on_event("startup")
    async def start_daily_alerts():
        asyncio.create_task(
            daily_alerts()
        )

    return r