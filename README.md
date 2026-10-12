# Sevan Connect

Sevan Connect pairs an Android companion with a web dashboard through an authenticated Socket.IO connection. The current working integration shares the phone name, model, Android version, battery and charging state. The phone must be opened and the user must approve sharing and pairing.

## Deploy publicly (Render)

The production dashboard, API and Socket.IO endpoint run from one Render web service. Render supplies the public HTTPS URL, so a phone can connect from mobile data or another Wi-Fi network without being on the PC's LAN. TLS terminates at Render; the Android app rejects public HTTP URLs.

1. Sign in to Render and choose **New → Blueprint**.
2. Connect `seependra-yadav/Sevan-connect`, branch `main`. The repository root is this `dashboard` folder and contains `render.yaml`.
3. Create the Blueprint and wait for the `sevan-connect` service deploy to finish.
4. Open the service URL shown by Render. `/api/health` should return JSON with `"status":"running"`; the root URL is the dashboard.
5. In the Render service's **Environment** page, copy the generated `PAIRING_CODE`. Do not publish it. Use it to connect the dashboard and phone.
6. In GitHub, open **Actions → Build Android companion APK → Run workflow**. Enter the Render HTTPS service URL (for example `https://sevan-connect.onrender.com`). Download `sevan-connect-debug-apk` from the completed run's artifacts.
7. Install the APK, open it, approve the sharing checkbox, enter the same pairing code, and select **Remember this pairing** if desired. The phone can use any network with internet access. Open the deployed dashboard and enter the pairing code; its device list updates while the companion is connected.

If you created a Render service manually instead of using the Blueprint, set its branch to `main`, leave **Root Directory** empty, set **Build Command** to `npm install && npm run build`, set **Start Command** to `npm start`, and set **Health Check Path** to `/api/health`. Root dependencies include both the Vite build tool and backend runtime packages, so this also works with Render's default `npm install && npm run build`. Do not use `npm run preview` as the production start command; it only serves the static UI and does not start the API or socket backend.

For a manually created service, add a private `PAIRING_CODE` environment variable in Render. Generate a long random value and keep it private. The Blueprint generates this variable automatically.

There is no separate admin username/password login. The generated `PAIRING_CODE` is the dashboard and phone pairing credential. Keep it private and enter it in the dashboard's **Connect your Android phone** form and the companion app. Anyone who knows that code can view connected device details, so rotate it in Render if it is exposed.

The Blueprint creates a free Render web service. Free services can sleep after inactivity and use ephemeral storage. Device presence is held in memory and is rebuilt when the phone reconnects after a server restart or deploy. For always-on availability or durable history, choose a paid always-on service and add a database before relying on it.

## Run locally

1. In `server`, copy `.env.example` to `.env` and set a private `PAIRING_CODE` (at least 6 characters for local development).
2. In one terminal, run `npm run dev` from `server` (port 4000).
3. In another terminal, run `npm run dev` from this folder (Vite normally uses port 5173).
4. Open the Vite URL and enter the pairing code in **Connect your Android phone**.
5. Install the debug APK on a phone connected to the same trusted Wi-Fi, enter the backend LAN URL and pairing code, approve sharing, and pair.

For a local APK, build the dashboard with `VITE_SERVER_URL` set to the PC's LAN URL before syncing/building Android. Local debug builds permit cleartext HTTP for a private LAN; release builds reject cleartext traffic.

## Build an APK locally

From this folder:

```sh
npm ci
npm ci --prefix server
npm run build
npx cap sync android
```

Build the debug APK from `android` with Java 21:

```sh
./gradlew assembleDebug
```

On Windows, use `gradlew.bat assembleDebug`. The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. For a public install, set `VITE_SERVER_URL` to the deployed HTTPS URL before `npm run build`, then sync and build. The GitHub Actions workflow accepts that URL and uploads the resulting debug APK. A release APK needs a private signing key and release signing configuration.

## Security and scope

- Render generates a private pairing code. Treat it as a credential; rotate it if exposed.
- Pairing attempts are throttled. Dashboard/API/socket traffic shares the HTTPS origin in production, and CORS is restricted to the deployed origin and local development origins.
- The user must approve sending the listed device details. Remembered pairing is optional and can be revoked by clearing the checkbox in the companion.
- Online presence is in memory and disappears on server restart until clients reconnect. The companion must be open or allowed to run for live updates; Android may pause background apps.
- Files/photos, contacts, SMS/call history, notification forwarding, and live screen streaming are not implemented. They require separate Android APIs, user approvals, and additional security work. Nothing is collected merely by installing the app.
