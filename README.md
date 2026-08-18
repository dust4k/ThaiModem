# ThaiModem

English–Thai translator and language learning tool, installed on iPhone from Safari. It runs as a Progressive Web App (Windows is fine — no Mac or Xcode).

The UI is static files in `public/`. Translation and OCR go through `/api/translate` and `/api/ocr-thai`, which proxy Grok so Safari does not hit CORS errors. On your PC that proxy is `server.py`. On Vercel it is two Python functions with the same behavior.

## What you need

- An [xAI API key](https://console.x.ai/)
- For a public HTTPS URL: a [Vercel](https://vercel.com) account (Hobby is free) and this repo on GitHub
- For home Wi-Fi only: Python 3.10+ from [python.org](https://www.python.org/downloads/windows/) — check **Add python.exe to PATH**. If `python --version` opens the Microsoft Store instead, turn off the `python.exe` App execution alias in Windows Settings. iPhone and PC on the **same Wi-Fi**

## Host on Vercel (persistent URL)

This is the usual way to use ThaiModem away from home. You get HTTPS (needed for Add to Home Screen and the service worker) and a stable `https://….vercel.app` address. Your PC does not need to stay on.

1. Push this repository to GitHub.
2. Open [vercel.com/new](https://vercel.com/new), import the repo, and deploy. `vercel.json` already sets the static output to `public/` and the API functions. Leave **Root Directory** as the repo root. Do not add an xAI key in Vercel Environment Variables — the app still uses the key you paste in Settings.
3. Open the deployment URL in **Safari** on the iPhone.
4. Follow **Install on iPhone** below.

Hobby is enough for personal use. Functions may run up to 5 minutes; Grok calls themselves time out after 120 seconds.

Vocabulary and the API key are stored in `localStorage` for that URL. A Vercel origin is different from `http://192.168.x.x:8080`, so Saved words from the LAN app will not appear here.

## Run on the PC

From this folder:

```powershell
python server.py
```

The server prints two URLs, for example:

```
This PC:    http://127.0.0.1:8080
iPhone LAN: http://192.168.1.23:8080
```

Open the **iPhone LAN** address in **Safari** (Chrome/Firefox on iOS cannot Add to Home Screen the same way).

If the phone cannot connect, allow Python through Windows Firewall for private networks, or create an inbound rule for TCP port **8080**.

Plain `http://LAN-IP` only works while the phone can reach the PC. A named Cloudflare Tunnel or ngrok in front of port 8080 is an alternative to Vercel if you want to keep the PC as the server.

## Install on iPhone

1. In Safari, tap **Share**.
2. Tap **Add to Home Screen**.
3. Open **ThaiModem** from the home screen.
4. Tap **Settings**, paste your xAI API key, pick a model (`grok-4` by default), tap **Done**.

The key is stored only in this browser / home-screen app (`localStorage`). It is not uploaded except as `X-Api-Key` to `/api/translate` or `/api/ocr-thai`, which forward it to `https://api.x.ai/v1/chat/completions`.

## Use

- **Top panel:** type English or Thai and tap **Translate**. Direction is detected automatically from what you type. **Paste a screenshot** with Thai text into the input box to extract and translate it automatically.
- **Center bar:** Clear, **Saved** (review vocabulary), Settings.
- **Bottom panel:** translation, RTGS romanization, expandable word breakdown, and (for Thai input) corrections / more natural phrasing.
- **Remember words:** tap words in the breakdown to highlight them, tap **Remember**, then open **Saved** to review them later. Vocabulary is stored on your iPhone in `localStorage` (same origin as the app URL).
- **Practice:** in **Saved**, tap **Practice** to run flashcards — English prompt, type the Thai translation, then check your answer.

On a computer keyboard, Ctrl+Enter also submits.

## Project layout

```
server.py                 Local stdlib static server + API routes
grok_backend.py           Shared Grok proxy (local server + Vercel)
api/translate.py          Vercel function: POST /api/translate
api/ocr-thai.py           Vercel function: POST /api/ocr-thai
vercel.json               Static output + function config
public/index.html         Split-screen PWA shell
public/css/app.css
public/js/models.js
public/js/grokTranslator.js
public/js/imageOcr.js     Clipboard image prep + Thai OCR client
public/js/settings.js
public/js/repository.js
public/js/flashcards.js
public/js/app.js
public/manifest.webmanifest
public/sw.js
```

No npm, pip, or Xcode. Local `python server.py` stays stdlib-only.
