# Testing Focus Reader on Your Phone

How to dev here and see it instantly on your phone — now (web app), and later
after flipping to Android/iOS. Plus how to test iOS without owning an iPhone.

---

## 1. Right now (web app)

The Vite dev server is configured to bind to the LAN (`server.host: true` in
`vite.config.ts`). On your phone's browser, go to:

```
http://192.168.1.21:5173
```

> The `192.168.1.21` is this PC's Wi-Fi IP. If it ever changes, re-check with
> PowerShell: `Get-NetIPAddress -AddressFamily IPv4` (use the Wi-Fi adapter).

**Two requirements:**

- **Phone must be on the same Wi-Fi** as this PC.
- **Allow the port through Windows Firewall** (only needs to be done once). Open
  an **admin** PowerShell (Win+X -> "Terminal (Admin)") and run:

  ```powershell
  New-NetFirewallRule -DisplayName "Vite dev 5173" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -Profile Private
  ```

After that, the URL works and **HMR is live** — edit a file on the PC and the
phone updates instantly. That's the whole inner loop.

To start the server: `npm run dev` (Vite prints both the Local and Network URLs).

---

## 2. The upgrade: tunnel (works on cellular + gives HTTPS)

LAN is great at your desk. For testing off your Wi-Fi, or when you need HTTPS
(PWA install, service workers, camera/device APIs all require it), use a tunnel:

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:5173
```

It prints a public `https://<random>.trycloudflare.com` URL that works on any
network.

**Gotcha:** Vite 7 rejects unknown hostnames with *"Blocked request. This host
is not allowed."* Fix by adding `allowedHosts` to `vite.config.ts`:

```ts
server: {
  host: true,
  allowedHosts: ['.trycloudflare.com'], // or true to allow any host (dev only)
  // ...proxy
}
```

---

## 3. After flipping to Android/iOS

Don't rewrite the app. It's heavy on DOM/CSS (book animation, gestures), so the
right tool is **Capacitor** — it wraps the *existing* web build in a real native
shell. You keep 100% of the current codebase.

Setup:

```bash
npm i @capacitor/core @capacitor/cli
npx cap init
npm i @capacitor/android @capacitor/ios
npx cap add android   # and/or: npx cap add ios
```

The "see it instantly on my phone" loop survives the flip via
**live-reload-on-device**:

```bash
npx cap run android --livereload --external
```

This installs the real native app on the phone but points its WebView at the dev
server (192.168.1.21:5173) — so you still edit on the PC and the *native app*
hot-reloads.

**Android is fully doable on Windows:** install Android Studio (free), use its
emulator or a USB-connected phone with USB debugging. No Mac needed.

---

## 4. iOS without an iPhone (and no Mac)

Separate two different needs:

### (a) Testing the web app on iOS now — no iPhone required

Use a cloud real-device service: **BrowserStack Live**, **LambdaTest**, or
**Sauce Labs**. You get a real iPhone in your browser, point it at your
cloudflared URL, and tap around. Free tiers exist.

This matters here specifically — Safari is where mobile-web bugs hide
(touch/pointer events, `100vh`, momentum scroll), and the book animation is
exactly the kind of touch-heavy thing that breaks differently on iOS.

### (b) Building + shipping the native iOS app — needs macOS at some point

Xcode does the signing, archiving, and App Store upload; there's no Windows
path. Without buying a Mac:

- **Cloud-Mac CI** builds the `.ipa`: **Codemagic** (best Capacitor support),
  Bitrise, or GitHub Actions macOS runners.
- **Rent a Mac** interactively: **MacinCloud** / **MacStadium** — remote-desktop
  in, run Xcode + the iOS Simulator when you need to debug native issues.
- **Test the built `.ipa`** on a real cloud iPhone via **BrowserStack App Live**.
- You'll also need an **Apple Developer account ($99/yr)** to ship to the store.

### Recommended sequencing

Do **Android first** — it's a complete, free, instant loop on Windows. Get the
app solid there. Then tackle iOS via a cloud Mac once you're ready to ship, by
which point a cheap used Mac mini often becomes worth it over per-hour rental.
