# Sevan Connect

## Run locally

1. In `dashboard/server`, create `.env` from `.env.example` and set a private `PAIRING_CODE`.
2. Start the backend in one terminal: `npm run dev` from `dashboard/server`.
3. Start the dashboard in another terminal: `npm run dev` from `dashboard`.
4. Open the Vite URL (normally `http://localhost:5173`) and enter the same pairing code in **Connect your Android phone**.
5. Install and open the companion APK while the phone and PC are on the same trusted Wi-Fi. Copy a `Same-Wi-Fi phone address candidate` from the backend terminal into the app (for example `http://192.168.1.10:4000`), enter the same pairing code, approve the sharing checkbox, then press **Pair this phone**.

The phone screen reads and displays the device name, model, Android version, and battery as it opens. These basic details need no runtime Android permission. The dashboard list is populated by authenticated companion connections; it no longer shows sample devices. The phone asks the user to approve sharing those details before pairing and refreshes battery/charging state every 30 seconds while connected. Remembered pairing is optional and requires the separate checkbox. The debug APK permits unencrypted HTTP only for same-Wi-Fi development; use HTTPS before exposing the app to the internet.

## Connect across different networks

`localhost` and private Wi-Fi addresses are reachable only from the same machine/network. To pair over different networks, deploy `server` on a public host behind HTTPS/WSS, set `DASHBOARD_ORIGINS` to the dashboard's exact origin(s), and set `VITE_SERVER_URL` in `dashboard/.env` to the public backend URL before building the web dashboard and APK. The Android app remembers the server URL after a successful submission. Do not expose the pairing code in a public repository or use unencrypted HTTP for remote connections.

This repository does not contain a deployed public relay/server or TLS domain. The local backend alone cannot make phones on unrelated networks reachable.

## Build a debug APK

From `dashboard` run:

```sh
npm run build
npx cap sync android
```

Then, from `dashboard/android` on Windows, use Android Studio's bundled JDK 21:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleDebug
```

The APK is written to `dashboard/android/app/build/outputs/apk/debug/app-debug.apk`. A release APK requires a signing key and release configuration.

## Current scope and Android permissions

The working phone integration covers pairing, online/offline status, and basic device/battery details. Files/photos, contacts, SMS/call history, notification forwarding, and live screen streaming still need Android permission and consent flows and are not implemented by the current backend. File access should use Android's system picker where possible. Android requires fresh user approval for each screen-capture session; SMS/call-log access is additionally restricted by Android and Google Play distribution rules. Nothing is collected merely by installing the app.
