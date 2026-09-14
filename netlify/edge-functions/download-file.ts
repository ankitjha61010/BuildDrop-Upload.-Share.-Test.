// Streams a Drive file's bytes through our own domain instead of redirecting the browser to
// drive.google.com. That redirect is what was breaking mobile downloads: drive.google.com is a
// verified Android App Link for the Google Drive app, so a plain navigation to it gets
// intercepted by the OS, which shows an account-picker / "open with Drive" prompt instead of
// just saving the file. Requests to our own origin never trigger that interception.
//
// Runs as a Netlify Edge Function (Deno runtime) rather than a regular Function because a
// standard Lambda-based function both has a response size cap and buffers the whole body in
// memory - neither works for multi-GB video files. Edge Functions can stream the response body
// straight through as it arrives from Drive.
import type { Config, Context } from '@netlify/edge-functions';
import { getDriveAccessToken } from '../lib/googleDriveAuth.ts';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export default async (request: Request, context: Context) => {
  try {
    const url = new URL(request.url);
    const fileId = url.searchParams.get('id');
    const requestedName = url.searchParams.get('name') || 'download';

    if (!fileId) {
      return new Response('Missing id', { status: 400 });
    }

    let token: string;
    try {
      token = await getDriveAccessToken();
    } catch (err) {
      console.error('Failed to mint Drive access token:', err);
      return new Response('Server not configured', { status: 500 });
    }

    const driveHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    // Forward Range header for iOS OTA installs (.ipa) and resumable/segmented media downloads
    const clientRange = request.headers.get('Range');
    if (clientRange) {
      driveHeaders['Range'] = clientRange;
    }

    const driveRes = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: driveHeaders }
    );

    if (!driveRes.ok || !driveRes.body) {
      const detail = await driveRes.text().catch(() => '');
      console.error('Drive media fetch failed:', driveRes.status, detail);
      return new Response(`Failed to fetch file from Drive (HTTP ${driveRes.status}): ${detail}`, {
        status: driveRes.status === 404 ? 404 : 502,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const length = driveRes.headers.get('Content-Length');
    const shouldConsumeOnComplete = url.searchParams.get('consume') === '1';
    let responseBody: ReadableStream = driveRes.body;

    if (shouldConsumeOnComplete) {
      let transferredBytes = 0;
      const expectedLength = parseInt(length || '0', 10);
      const transformStream = new TransformStream({
        transform(chunk, controller) {
          transferredBytes += chunk.byteLength || chunk.length || 0;
          controller.enqueue(chunk);
        },
        flush() {
          if (!expectedLength || transferredBytes >= expectedLength) {
            context.waitUntil(
              fetch(new URL('/api/consume-download', request.url), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId }),
              }).catch(() => {})
            );
          }
        },
      });
      responseBody = driveRes.body.pipeThrough(transformStream);
    }

    const asciiName = requestedName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
    const headers = new Headers();
    headers.set('Content-Type', driveRes.headers.get('Content-Type') || 'application/octet-stream');
    
    if (length) headers.set('Content-Length', length);

    const contentRange = driveRes.headers.get('Content-Range');
    if (contentRange) headers.set('Content-Range', contentRange);

    const acceptRanges = driveRes.headers.get('Accept-Ranges');
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);

    headers.set('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(requestedName)}`);
    headers.set('Cache-Control', 'no-store');

    return new Response(responseBody, { status: driveRes.status, headers });
  } catch (err: any) {
    console.error('Edge function download-file exception:', err);
    return new Response(err?.message || 'Internal Edge Function Error', { status: 500 });
  }
};

export const config: Config = {
  path: '/api/download-file',
};
