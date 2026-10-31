
"""Mandi prices from Agmarknet CSV, with data.gov.in API fallback."""

import os
import csv
import time
import httpx

from pathlib import Path
from datetime import date, timedelta
from fastapi import APIRouter, HTTPException

RESOURCE = "9ef84268-d588-465a-a308-a864a43d0070"

CSV_FILE = Path(__file__).resolve().parent / "data" / "mandi_prices.csv"

COMMODITY = {
    "rice": "Paddy(Dhan)(Common)",
    "wheat": "Wheat",
    "gram": "Bengal Gram(Gram)(Whole)",
    "maize": "Maize",
    "tomato": "Tomato",
}

_cache = {}


def _num(value):
    try:
        return float(str(value).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def clean(rec):
    def get(*keys):
        for key in keys:
            if key in rec and rec[key] not in (None, ""):
                return rec[key]
        return None

    return {
        "market": get("market", "Market"),
        "district": get("district", "District"),
        "variety": get("variety", "Variety"),
        "date": get("arrival_date", "Arrival_Date"),
        "min": _num(get("min_price", "Min_x0020_Price")),
        "max": _num(get("max_price", "Max_x0020_Price")),
        "modal": _num(get("modal_price", "Modal_x0020_Price")),
    }


def fetch_csv_records(commodity, state, district):
    if not CSV_FILE.exists():
        raise HTTPException(
            503,
            f"Mandi CSV file not found: {CSV_FILE}"
        )

    try:
        with open(CSV_FILE, "r", encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            records = []

            for row in reader:
                row_state = (row.get("State") or "").strip()
                row_district = (row.get("District") or "").strip()
                row_commodity = (row.get("Commodity") or "").strip()

                if row_commodity.casefold() != commodity.casefold():
                    continue

                if row_state.casefold() != state.casefold():
                    continue

                if district and row_district.casefold() != district.casefold():
                    continue

                records.append(row)

            return records

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Could not read mandi CSV: {str(exc)}")


async def fetch_api_records(commodity, state, district):
    key = os.getenv("DATA_GOV_API_KEY")
    if not key:
        return None

    cache_key = ("api", commodity, state, district)

    if cache_key in _cache and time.time() - _cache[cache_key][0] < 1800:
        return _cache[cache_key][1]

    params = {
        "api-key": key,
        "format": "json",
        "limit": 200,
        "filters[commodity]": commodity,
        "filters[state.keyword]": state,
    }

    if district:
        params["filters[district]"] = district

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                f"https://api.data.gov.in/resource/{RESOURCE}",
                params=params
            )
            response.raise_for_status()

        records = response.json().get("records", [])
        _cache[cache_key] = (time.time(), records)
        return records

    except Exception:
        return None


async def fetch_records(commodity, state, district):
    # Prefer live API when available.
    records = await fetch_api_records(commodity, state, district)

    if records:
        return records

    # Use downloaded CSV if API key is unavailable or API fails.
    cache_key = ("csv", commodity, state, district)

    if cache_key in _cache and time.time() - _cache[cache_key][0] < 300:
        return _cache[cache_key][1]

    records = fetch_csv_records(commodity, state, district)
    _cache[cache_key] = (time.time(), records)

    return records


def make_router(m):
    router = APIRouter()

    with m.db() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS mandi_snap(
                day TEXT,
                commodity TEXT,
                state TEXT,
                district TEXT,
                avg_modal REAL,
                PRIMARY KEY(day, commodity, state, district)
            )
        """)

    @router.get("/mandi")
    async def prices(
        crop: str,
        state: str = "Madhya Pradesh",
        district: str = ""
    ):
        if crop not in COMMODITY:
            raise HTTPException(400, "Unknown crop")

        state = state.strip()
        district = district.strip()

        raw_records = await fetch_records(
            COMMODITY[crop],
            state,
            district
        )

        rows = [
            clean(record)
            for record in raw_records
            if clean(record)["modal"] is not None
        ]

        if not rows:
            return {
                "crop": crop,
                "state": state,
                "district": district,
                "count": 0,
                "rows": [],
                "avg_modal": None,
                "best": None,
                "trend": None,
                "source": "CSV/API"
            }

        rows.sort(key=lambda item: item["modal"], reverse=True)

        avg = round(sum(row["modal"] for row in rows) / len(rows))
        today = date.today().isoformat()

        with m.db() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO mandi_snap VALUES(?,?,?,?,?)",
                (today, crop, state, district, avg)
            )

            old = connection.execute(
                """
                SELECT day, avg_modal
                FROM mandi_snap
                WHERE commodity=? AND state=? AND district=?
                AND day<? AND day>=?
                ORDER BY day LIMIT 1
                """,
                (
                    crop,
                    state,
                    district,
                    today,
                    (date.today() - timedelta(days=14)).isoformat()
                )
            ).fetchone()

        trend = None

        if old and old["avg_modal"]:
            trend = {
                "days": (
                    date.today() - date.fromisoformat(old["day"])
                ).days,
                "pct": round(
                    (avg - old["avg_modal"]) / old["avg_modal"] * 100,
                    1
                )
            }

        return {
            "crop": crop,
            "state": state,
            "district": district,
            "count": len(rows),
            "avg_modal": avg,
            "best": rows[0],
            "trend": trend,
            "rows": rows[:15],
            "unit": "INR per quintal (100 kg)",
            "source": "CSV/API"
        }

    return router
