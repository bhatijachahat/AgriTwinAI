# AgriTwinAI

AgriTwinAI is a farm decision-support prototype built with React + Vite and FastAPI. It combines a farm Digital Twin, weather-driven irrigation estimates, solar pump scheduling estimates, what-if simulation, irrigation history, farm insights, crop photo screening, government scheme guidance, and Hindi/English UI support.

## UI refresh
- Forest-green and sage visual theme
- Sidebar navigation and responsive mobile layout
- Farm overview cards and clearer farm selection
- Improved forms, feature cards, tables and status styling
- Assistant chat bubbles with browser voice input/output where supported
- Existing API paths and feature modules are retained

## Run locally (Windows PowerShell)

### 1. Backend
Open Terminal 1:

```powershell
cd path\to\agri_twin\backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs

### 2. Frontend
Open Terminal 2:

```powershell
cd path\to\agri_twin\frontend
npm install
npm run dev
```

Open the local URL printed by Vite (usually http://localhost:5173).

## Optional integrations

The main farm, Digital Twin, weather, simulation and history functionality does not need an AI API key, but weather requests need internet access.

Set these environment variables in the backend terminal before starting the server if you want to use the corresponding integrations:

```powershell
$env:GROQ_API_KEY="your-groq-api-key"
$env:TELEGRAM_BOT_TOKEN="your-telegram-bot-token"
$env:TELEGRAM_CHAT_ID="your-telegram-chat-id"
$env:AUTH_SECRET="long-random-string"
$env:FAST2SMS_KEY="your-fast2sms-key"        # real SMS OTPs
$env:DATA_GOV_API_KEY="your-data-gov-in-key"  # mandi prices
```

- `GROQ_API_KEY`: AI farm chat and image-based crop screening.
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`: Telegram alerts.

Never commit or share real API keys. Keep them in local environment variables or a private `.env` file excluded from version control. The browser voice input/output uses supported browser speech APIs and may depend on browser/device language support.

## Phone OTP, Mandi prices and Offline mode

- **Phone OTP login:** with `FAST2SMS_KEY` set, OTPs are sent by SMS (Fast2SMS OTP route - not tested live here). Without it, the OTP is **printed in the backend terminal** - use this for local testing only. OTP: 6 digits, valid 5 minutes, 5 tries, 45 s between requests.
- **Mandi prices:** needs a free key from data.gov.in (`DATA_GOV_API_KEY`). Prices are Agmarknet data in INR per quintal. The app saves one daily average per crop/district, so the up/down trend appears after a few days of use.
- **Offline mode:** works in the production build (`npm run build` / Docker), not in `npm run dev`. Install needs HTTPS when deployed (localhost is fine). Offline you can open the app, see last-loaded farm data, and log irrigation or add a farm; these sync automatically when internet returns. Fresh weather, what-if, AI chat and photo scan still need internet. Logging out wipes saved offline data from the phone.

## Docker

```bash
docker compose up --build
```

Open http://localhost:8080. Docker Compose stores the SQLite database under `./data/agritwin.db`.

To enable optional integrations with Docker, set the relevant environment variables in your shell before starting Compose.

## Tests

From the backend folder:

```powershell
pip install pytest
pytest -q test_api.py
```

The tests run without real weather calls or API secrets; optional AI tests validate the expected no-key response when no key is configured.

## Current limitations

- This is a prototype and its recommendations are decision support, not a substitute for local agricultural expertise.
- Weather data comes from Open-Meteo and requires connectivity for fresh updates.
- Solar pump flow and the irrigation model depend on farm inputs and assumptions; validate against local field/pump data before real-world use.
- Login/signup is implemented (email + password, per-user farms). Set a strong `AUTH_SECRET` environment variable before deploying; add HTTPS, rate limiting, password reset and email verification for production.
- Offline-first data sync and a real mandi-price feed are future enhancements, not currently implemented.
