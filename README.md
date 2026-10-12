# Sevan Connect

Sevan Connect connects an Android companion to a web dashboard through Socket.IO. The phone user must open the app and explicitly approve sharing the phone name, model, Android version, battery and charging state. The dashboard administrator uses a private code; the phone user does not need that code.

## Deploy publicly (Render)

The production dashboard, API and Socket.IO endpoint run from one Render web service. Render supplies the public HTTPS URL, so a phone can connect from mobile data or another Wi-Fi network without being on the PC's LAN. TLS terminates at Render; the Android app rejects public HTTP URLs.

1. Sign in to Render and choose **New → Blueprint**.
2. Connect `seependra-yadav/Sevan-connect`, branch `main`. The repository root is this `dashboard` folder and contains `render.yaml`.
3. Create the Blueprint and wait for the `sevan-connect` service deploy to finish.
4. Open the service URL shown by Render. `/api/health` should return JSON with `"status":"running"`; the root URL is the dashboard.
5. In the Render service's **Environment** page, copy the generated `PAIRING_CODE`. Do not publish it. Enter it only in the dashboard's **Connect your Android phone** form.
6. In GitHub, open **Actions → Build Android companion APK → Run workflow** and enter the Render HTTPS service URL (for example `https://sevan-connect.onrender.com`). Download `app-debug.apk` from the workflow artifact or GitHub Releases. The release updates the in-app APK download and share link.
7. On the phone, open the app and explicitly approve sharing. The phone can use any network with internet access. Open the deployed dashboard and enter the admin pairing code; its device list updates while the companion is connected.

After the admin connects the dashboard, use **Offer shown in phone app** to set an offer title, message, HTTPS link, and button label, then select **Publish offer to phones**. The phone app shows only the current offer and its link; it does not show admin-dashboard controls or links. Offers are public content. The companion connects to load and receive offer updates, but sends device details only after the phone user separately approves sharing. Offers are currently held in server memory and reset when the service restarts or sleeps; connected phones receive the latest offer again after the admin republishes it.

If you created a Render service manually instead of using the Blueprint, set its branch to `main`, leave **Root Directory** empty, set **Build Command** to `npm install && npm run build`, set **Start Command** to `npm start`, and set **Health Check Path** to `/api/health`. Root dependencies include both the Vite build tool and backend runtime packages, so this also works with Render's default `npm install && npm run build`. Do not use `npm run preview` as the production start command; it only serves the static UI and does not start the API or socket backend.

For a manually created service, add a private `PAIRING_CODE` environment variable in Render. Generate a long random value and keep it private. The Blueprint generates this variable automatically.

There is no separate admin username/password login. The generated `PAIRING_CODE` is the single admin credential: the dashboard shows a locked screen until the server verifies it, and the server sends the private device list only to a verified dashboard socket. The credential is never put in the APK. Keep it private, use **Lock dashboard** when finished, and rotate it in Render immediately if anyone else may have seen it. Anyone with that credential can access the device list.

The Blueprint creates a free Render web service. Free services can sleep after inactivity and use ephemeral storage. Device presence is held in memory and is rebuilt when the phone reconnects after a server restart or deploy. For always-on availability or durable history, choose a paid always-on service and add a database before relying on it.

## Run locally

1. In `server`, copy `.env.example` to `.env` and set a private `PAIRING_CODE` (at least 6 characters for local development).
2. In one terminal, run `npm run dev` from `server` (port 4000).
3. In another terminal, run `npm run dev` from this folder (Vite normally uses port 5173).
4. Open the Vite URL and enter the pairing code in **Connect your Android phone**.
5. Install the debug APK on a phone connected to the same trusted Wi-Fi, enter the backend LAN URL and approve sharing. No admin code is entered on the phone.

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

On Windows, use `gradlew.bat assembleDebug`. The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. For a public install, set `VITE_SERVER_URL` to the deployed HTTPS URL before `npm run build`, then sync and build. The GitHub Actions workflow accepts that URL, uploads the resulting debug APK, and publishes it as a GitHub release download. This is a debug-signed APK for direct installation; a Play Store release needs a private signing key and release signing configuration.

## Security and scope

- Render generates a private pairing code. Treat it as a credential; rotate it if exposed.
- Pairing attempts are throttled. Dashboard/API/socket traffic shares the HTTPS origin in production, and CORS is restricted to the deployed origin and local development origins.
- Installing the APK alone does not launch it. The owner must open it once to load offers. Device details are sent only after a separate approval in the phone app; the optional remembered approval can be revoked in its privacy section.
- Online presence is in memory and disappears on server restart until clients reconnect. The companion must be open or allowed to run for live updates; Android may pause background apps.
- Files/photos, contacts, SMS/call history, notification forwarding, and live screen streaming are not implemented. They require separate Android APIs, user approvals, and additional security work. Nothing is collected merely by installing the app.
