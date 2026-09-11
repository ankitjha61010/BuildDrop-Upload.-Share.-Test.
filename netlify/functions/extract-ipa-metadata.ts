// Runs (fire-and-forget from the client) right after a .ipa finishes uploading: downloads the
// file to disk - app-info-parser's Node backend needs a real file path, not a Buffer/stream, so
// it can random-access the zip's central directory - pulls CFBundleIdentifier/Version/DisplayName
// out of its embedded Info.plist, and saves them onto the Drive file's custom properties. This
// lets /api/ipa-manifest build a real iOS OTA install manifest later without re-downloading and
// re-parsing the .ipa on every page visit.
import type { Config } from '@netlify/functions';
import { createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { tmpdir } from 'os';
import { join } from 'path';
import AppInfoParser from 'app-info-parser';
import { getDriveAccessToken } from '../lib/googleDriveAuth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
// Keeps the download + unzip comfortably inside a Netlify Function's time/memory budget. Larger
// .ipa files just skip auto-extraction - the install manifest still works, with placeholder
// metadata (see ipa-manifest.ts).
const MAX_EXTRACT_BYTES = 150 * 1024 * 1024;

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let fileId: unknown;
  try {
    const body = await req.json();
    fileId = body?.fileId;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  if (!fileId || typeof fileId !== 'string') {
    return new Response('Missing fileId', { status: 400 });
  }

  let token: string;
  try {
    token = await getDriveAccessToken();
  } catch (err) {
    console.error('Failed to mint Drive access token:', err);
    return new Response('Server not configured', { status: 500 });
  }

  const metaRes = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=size&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!metaRes.ok) {
    return Response.json({ success: false, reason: 'not_found' });
  }
  const { size } = await metaRes.json();
  if (Number(size) > MAX_EXTRACT_BYTES) {
    return Response.json({ success: false, reason: 'file_too_large' });
  }

  const tmpPath = join(tmpdir(), `builddrop-${fileId}-${Date.now()}.ipa`);
  try {
    const fileRes = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!fileRes.ok || !fileRes.body) {
      console.error('Failed to fetch ipa bytes:', fileRes.status);
      return Response.json({ success: false, reason: 'download_failed' });
    }
    await pipeline(Readable.fromWeb(fileRes.body as any), createWriteStream(tmpPath));

    const parser = new AppInfoParser(tmpPath);
    const result: any = await parser.parse();

    const bundleId: string | undefined = result?.CFBundleIdentifier;
    const bundleVersion: string | undefined = result?.CFBundleShortVersionString || result?.CFBundleVersion;
    const appName: string | undefined = result?.CFBundleDisplayName || result?.CFBundleName;

    if (!bundleId) {
      return Response.json({ success: false, reason: 'no_bundle_id' });
    }

    const properties: Record<string, string> = { builddrop_bundle_id: bundleId };
    if (bundleVersion) properties.builddrop_bundle_version = bundleVersion;
    if (appName) properties.builddrop_app_name = appName;

    const patchRes = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties }),
      }
    );
    if (!patchRes.ok) {
      console.error('Failed to save ipa metadata to Drive:', patchRes.status, await patchRes.text());
      return Response.json({ success: false, reason: 'save_failed' });
    }

    return Response.json({ success: true, bundleId, bundleVersion, appName });
  } catch (err) {
    console.error('Failed to parse .ipa metadata:', err);
    return Response.json({ success: false, reason: 'parse_failed' });
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
};

export const config: Config = {
  path: '/api/extract-ipa-metadata',
};
