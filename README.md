# ThaiModem

English–Thai translator and language learning tool, installed on iPhone from Safari. It runs as a Progressive Web App on your PC (Windows is fine — no Mac or Xcode).

The phone talks to a small Python server on your computer. That server serves the app and proxies Grok so Safari does not hit CORS errors.

## What you need

- Python 3.10+ from [python.org](https://www.python.org/downloads/windows/) — check **Add python.exe to PATH**. If `python --version` opens the Microsoft Store instead, turn off the `python.exe` App execution alias in Windows Settings.
- An [xAI API key](https://console.x.ai/)
- iPhone and PC on the **same Wi-Fi**

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

## Install on iPhone

1. In Safari, tap **Share**.
2. Tap **Add to Home Screen**.
3. Open **ThaiModem** from the home screen.
4. Tap **Settings**, paste your xAI API key, pick a model (`grok-4` by default), tap **Done**.

The key is stored only in this browser / home-screen app (`localStorage`). It is not uploaded except as `X-Api-Key` to your PC server, which forwards it to `https://api.x.ai/v1/chat/completions`.

## Use

- **Top panel:** type English or Thai and tap **Translate**. Direction is detected automatically from what you type. **Paste a screenshot** with Thai text into the input box to extract and translate it automatically.
- **Center bar:** Clear, **Saved** (review vocabulary), Settings.
- **Bottom panel:** translation, RTGS romanization, expandable word breakdown, and (for Thai input) corrections / more natural phrasing.
- **Remember words:** tap words in the breakdown to highlight them, tap **Remember**, then open **Saved** to review them later. Vocabulary is stored on your iPhone in `localStorage` (same origin as the app URL).

On a computer keyboard, Ctrl+Enter also submits.

## Off your home network

Plain `http://LAN-IP` only works while the phone can reach the PC. For use away from home, put an HTTPS tunnel in front of port 8080 (Cloudflare Tunnel or ngrok). HTTPS also lets the service worker register so the app shell can cache.

## Project layout

```
server.py                 Python stdlib static server + /api/translate, /api/ocr-thai
public/index.html         Split-screen PWA shell
public/css/app.css
public/js/models.js
public/js/grokTranslator.js
public/js/imageOcr.js     Clipboard image prep + Thai OCR client
public/js/settings.js
public/js/repository.js
public/js/app.js
public/manifest.webmanifest
public/sw.js
```

No npm, pip, or Xcode.
