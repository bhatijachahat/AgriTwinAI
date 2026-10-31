
"""
AI crop disease detection from a leaf photo using Groq Vision.
Stores scan results per farm and combines them with weather risk.
"""

import os
import json
import base64
import httpx

from datetime import date
from json import JSONDecoder
from fastapi import APIRouter, UploadFile, File, HTTPException


# Supported image formats
ALLOWED = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

MAX_BYTES = 5 * 1024 * 1024

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "qwen/qwen3.8-27b"


# Prompt for AI crop disease detection
PROMPT = (
    "You are a plant pathology assistant helping an Indian farmer. "
    "The crop is {crop}. Analyze the attached plant photo and return "
    "ONLY a valid JSON object with these keys: "
    '{{"plant_ok": true, "healthy": true, "disease": "string", '
    '"confidence": 0, "severity": "low", '
    '"symptoms": "string", "advice_en": "string", '
    '"advice_hi": "string"}}. '
    "Set plant_ok to true if the image shows any recognizable "
"crop plant, leaf, stem, fruit, or other plant part. "
"Even if the leaf is blurry, partially visible, damaged, "
"or the disease is uncertain, do not reject it if it "
"reasonably appears to be a crop plant. "
"Set plant_ok to false ONLY when the image clearly shows "
"something unrelated to plants, such as a person, vehicle, "
"document, or household object. "
    "Set healthy to true if the plant appears healthy. "
    "Confidence must be an integer from 0 to 100. "
    "Severity must be low, medium, or high. "
    "If healthy, set disease to Healthy. "
    "Describe visible symptoms only and do not invent symptoms. "
    "Give practical prevention and next steps, including field hygiene, "
    "water management, and removing infected leaves when appropriate. "
    "Recommend consulting a KVK or agriculture officer when needed. "
    "Do not give pesticide brand names or dosages. "
    "If uncertain, say so and lower confidence. "
    "Do not claim a definitive diagnosis from an image alone."
)


# Groq Vision API call
async def call_groq(b64, mime, crop):

    key = os.getenv("GROQ_API_KEY")

    if not key:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY is not set on the backend."
        )

    body = {
        "model": GROQ_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": PROMPT.format(crop=crop)
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime};base64,{b64}"
                        }
                    }
                ]
            }
        ],
        "temperature": 0.2,
        "max_completion_tokens": 1000,
        "response_format": {
            "type": "json_object"
        }
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:

            response = await client.post(
                GROQ_URL,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json"
                },
                json=body
            )

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Groq request timed out. Please try again."
        )

    except httpx.RequestError as error:
        print("Groq connection error:", repr(error), flush=True)

        raise HTTPException(
            status_code=502,
            detail="Could not connect to Groq. Check your internet connection."
        )

    if response.status_code != 200:

        print("Groq status:", response.status_code, flush=True)
        print("Groq response:", response.text, flush=True)

        raise HTTPException(
            status_code=502,
            detail=(
                f"Groq API returned status {response.status_code}. "
                "Check the backend terminal for details."
            )
        )

    # Extract AI response
    try:
        api_result = response.json()
        ai_text = api_result["choices"][0]["message"]["content"]

    except (ValueError, KeyError, IndexError, TypeError) as error:

        print("Groq parsing error:", repr(error), flush=True)

        raise HTTPException(
            status_code=502,
            detail="Could not extract the AI response from Groq."
        )

    if not isinstance(ai_text, str) or not ai_text.strip():

        raise HTTPException(
            status_code=502,
            detail="Groq returned an empty AI response."
        )

    return ai_text


# Parse AI JSON response
def parse(text):

    if isinstance(text, dict):
        result = text

    elif isinstance(text, str) and text.strip():

        try:
            result = json.loads(text)

        except json.JSONDecodeError:

            # Extract JSON even if extra text or markdown is returned
            try:
                start = text.index("{")
                result, _ = JSONDecoder().raw_decode(text[start:])

            except (ValueError, json.JSONDecodeError):

                print("AI response was:", repr(text), flush=True)

                raise ValueError(
                    "No valid JSON object found in AI response."
                )

    else:
        raise ValueError("AI returned an empty response.")

    if not isinstance(result, dict):
        raise ValueError("AI response is not a JSON object.")

    if not isinstance(result.get("plant_ok"), bool):
        raise ValueError("AI response is missing valid plant_ok.")

    if not isinstance(result.get("healthy"), bool):
        raise ValueError("AI response is missing valid healthy.")

    # Normalize confidence
    try:
        result["confidence"] = max(
            0,
            min(100, int(result.get("confidence", 0)))
        )
    except (ValueError, TypeError):
        result["confidence"] = 0

    # Normalize severity
    if result.get("severity") not in ("low", "medium", "high"):
        result["severity"] = "low"

    result.setdefault("disease", "Uncertain")
    result.setdefault("symptoms", "")
    result.setdefault("advice_en", "")
    result.setdefault("advice_hi", "")

    return result


# Create disease detection router
def make_router(m):

    import features

    # Create database table
    with m.db() as connection:

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS disease_scans (
                id INTEGER PRIMARY KEY,
                farm_id INT,
                day TEXT,
                disease TEXT,
                confidence INT,
                severity TEXT,
                advice TEXT
            )
            """
        )

    router = APIRouter()

    # Upload leaf photo and detect possible disease
    @router.post("/farms/{fid}/disease-photo")
    async def scan(
        fid: int,
        lang: str = "hi",
        file: UploadFile = File(...)
    ):

        farm = m.get_farm(fid)

        if not farm:
            raise HTTPException(
                status_code=404,
                detail="Farm not found."
            )

        # Validate image format
        if file.content_type not in ALLOWED:
            raise HTTPException(
                status_code=400,
                detail="Upload a JPEG, PNG or WebP image."
            )

        # Read image
        data = await file.read()

        if not data:
            raise HTTPException(
                status_code=400,
                detail="Uploaded image is empty."
            )

        if len(data) > MAX_BYTES:
            raise HTTPException(
                status_code=400,
                detail="Image must be smaller than 5 MB."
            )

        # Call Groq Vision
        try:

            encoded_image = base64.b64encode(data).decode("utf-8")

            ai_text = await call_groq(
                encoded_image,
                file.content_type,
                farm["crop"]
            )

            result = parse(ai_text)
            print("DISEASE AI RESULT:", result, flush=True)
        except HTTPException:
            raise

        except Exception as error:

            print(
                "Disease detection error:",
                repr(error),
                flush=True
            )

            raise HTTPException(
                status_code=502,
                detail=(
                    "Could not read the AI result. "
                    "Check the backend terminal for details."
                )
            )

        # Reject non-plant images
        if not result.get("plant_ok", True):

            raise HTTPException(
                status_code=422,
                detail=(
                    "This does not look like a crop leaf. "
                    "Take a close, clear photo of the leaf."
                )
            )

        # Weather-related disease risk
        weather_level = None

        try:

            days, _ = await m.weather(farm)

            weather_result = features.disease_risk(
                days,
                farm,
                lang
            )

            weather_level = weather_result.get("level")

        except Exception as error:

            print(
                "Weather disease-risk check failed:",
                repr(error),
                flush=True
            )

        # Determine severity and urgency
        sick = not result.get("healthy", False)

        severity = result.get("severity", "low")

        urgent = (
            sick
            and severity in ("medium", "high")
            and weather_level in ("medium", "high")
        )

        # Select advice language
        if lang == "hi":
            advice = result.get("advice_hi", "")
        else:
            advice = result.get("advice_en", "")

        # Save result in database
        with m.db() as connection:

            connection.execute(
                """
                INSERT INTO disease_scans
                (farm_id, day, disease, confidence, severity, advice)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    fid,
                    date.today().isoformat(),
                    result.get("disease", "Unknown"),
                    result.get("confidence", 0),
                    severity,
                    advice
                )
            )

        # Return result to frontend
        return {
            "healthy": not sick,
            "disease": result.get("disease", "Unknown"),
            "confidence": result.get("confidence", 0),
            "severity": severity,
            "symptoms": result.get("symptoms", ""),
            "advice": advice,
            "weather_risk": weather_level,
            "urgent": urgent,
            "disclaimer": (
                "यह AI का अनुमान है, पक्का निदान नहीं। "
                "उपचार से पहले KVK/कृषि अधिकारी से पुष्टि करें।"
                if lang == "hi"
                else
                "This is an AI estimate, not a confirmed diagnosis. "
                "Confirm with KVK or an agriculture officer before "
                "applying any treatment."
            )
        }

    # Fetch previous disease scans
    @router.get("/farms/{fid}/disease-scans")
    def scans(fid: int):

        farm = m.get_farm(fid)

        if not farm:
            raise HTTPException(
                status_code=404,
                detail="Farm not found."
            )

        with m.db() as connection:

            rows = connection.execute(
                """
                SELECT *
                FROM disease_scans
                WHERE farm_id = ?
                ORDER BY id DESC
                LIMIT 20
                """,
                (fid,)
            )

            return [dict(row) for row in rows]

    return router
