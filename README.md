# BuildDrop — Upload. Share. Test.

> **Frontend-first file drop & sharing app, backed by Google Drive**
> Upload any file (APK, ZIP, video, docs, anything) up to 12 GB, get a shareable link/QR code, and let it auto-delete after a 12-day window or the first download. Deployed as a static site + Netlify Functions.

---

## 🌟 Key Features

1. **12 GB Resumable Chunked Uploads**
   - 8 MB chunked uploads straight from the browser to Google Drive's resumable upload API.
   - Pause/resume, live speed + ETA, automatic retry with exponential backoff.
   - Accepts any file type (APK, ZIP, video, docs, images, anything).

2. **No Sign-In Required, for Anyone**
   - Uploads and downloads are proxied through server-side Netlify Functions that hold the site owner's own Google OAuth refresh token.
   - Neither the uploader nor the recipient ever needs a Google account or sees any credentials.

3. **One-Time / 12-Day Ephemeral Links**
   - Every upload gets a 12-day expiration window, and is deleted from Drive immediately after the first successful download.
   - Live countdown timer on the share page.

4. **Instant QR Code & Link Sharing**
   - Generates a `/watch/:fileId` share link and matching QR code for every upload.
   - No tokens or credentials embedded in the generated URL.

---

## 🏗️ Architecture

- **Frontend**: React 18 + TypeScript + Tailwind, built with Vite.
- **Backend**: Netlify Functions (`netlify/functions/`) + one Edge Function (`netlify/edge-functions/download-file.ts`), all using a single Google OAuth refresh token (`netlify/lib/googleDriveAuth.ts`) — never a service-account key, so it works even on Workspace orgs that block service-account key creation.
- Files live in one shared "uploads" folder in the site owner's own Google Drive (see `VITE_UPLOADS_FOLDER_NAME` / `DRIVE_UPLOADS_FOLDER_ID`).

## 🚀 Local Development

```bash
npm install
npm run dev:netlify   # runs `netlify dev`, so /api/* Functions actually work locally
```

Plain `npm run dev` (bare Vite) will NOT work for uploads/downloads — those endpoints are Netlify Functions and don't exist under plain Vite dev.

### Environment variables (`.env`)
```env
VITE_GOOGLE_CLIENT_ID=...          # unused by current server-side flow, kept for parity
VITE_CENTRAL_FOLDER_ID=...
VITE_UPLOADS_FOLDER_NAME=VidSetu_Uploads
VITE_GOOGLE_API_KEY=...

# Server-side only — powers uploads, the download proxy, and delete-after-download
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REFRESH_TOKEN=...
```

Your OAuth consent screen must be **Published (In production)**, not left in Testing — Testing-mode refresh tokens expire after 7 days regardless of use. The `drive.file` scope used here is not sensitive/restricted, so publishing doesn't require Google's verification review.

## 🌐 Deploy to Netlify

1. Push this repo, then **Add new site > Import an existing project** in Netlify.
2. Build command: `npm run build`, publish directory: `dist` (already set in `netlify.toml`).
3. Set the environment variables above under **Site configuration > Environment variables**.

## 🔒 Security Architecture

- **No client credentials**: only a public Client ID/API key ship to the browser; the actual Drive access token is minted server-side per request and never exposed.
- **Clean share URLs**: `/watch/:fileId` carries only the Drive file ID.
- **Strict security headers**: configured in `netlify.toml`.
