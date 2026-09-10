// Shared by both the Node-based Function (consume-download) and the Deno-based Edge Function
// (download-file) - written with only Web-standard fetch/URLSearchParams so it runs unmodified
// in either runtime.
//
// Uses a user OAuth refresh token rather than a service-account key. Service-account keys are
// blocked outright on Google Workspace organizations with the iam.disableServiceAccountKeyCreation
// policy enforced (a common default), so that path isn't available to every user. A refresh token
// for the uploader's own account is not subject to that policy, and has a nice side effect: since
// it acts as the account that already owns the Drive folders, no separate folder-sharing step is
// needed either.
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function getEnv(name: string): string {
  const denoEnv = (globalThis as any).Deno?.env;
  const value: string | undefined = denoEnv ? denoEnv.get(name) : (typeof process !== 'undefined' ? process.env[name] : undefined);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function getDriveAccessToken(): Promise<string> {
  const clientId = getEnv('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = getEnv('GOOGLE_OAUTH_CLIENT_SECRET');
  const refreshToken = getEnv('GOOGLE_OAUTH_REFRESH_TOKEN');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    throw new Error(`Refresh token exchange failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Refresh token exchange did not return an access token');
  }
  return data.access_token;
}
