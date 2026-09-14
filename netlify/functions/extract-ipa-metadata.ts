// Runs (fire-and-forget from the client) right after a .ipa/.apk finishes uploading:
// downloads the file to temp disk, parses embedded Info.plist / AndroidManifest.xml for real app metadata
// (app icon PNG, bundle ID, version, build number, app name), uploads the extracted icon PNG to Drive,
// and saves properties onto the Drive file.
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
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const MAX_EXTRACT_BYTES = 150 * 1024 * 1024;

async function uploadIconImageToDrive(token: string, fileId: string, base64Data: string): Promise<string | undefined> {
  try {
    const match = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return undefined;

    const buffer = Buffer.from(match[2], 'base64');
    const iconFileName = `icon_${fileId}.png`;

    // 1. Create file resource metadata
    const createRes = await fetch(`${DRIVE_API}/files?supportsAllDrives=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: iconFileName,
        mimeType: 'image/png',
        description: `BuildDrop App Icon for file ${fileId}`,
      }),
    });

    if (!createRes.ok) {
      console.error('Failed to create icon file resource:', createRes.status, await createRes.text());
      return undefined;
    }
    const created = await createRes.json();
    const iconFileId = created.id;

    // 2. Upload binary bytes
    const mediaRes = await fetch(
      `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(iconFileId)}?uploadType=media&supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
        body: buffer,
      }
    );

    if (!mediaRes.ok) {
      console.error('Failed to upload icon bytes:', mediaRes.status, await mediaRes.text());
      return undefined;
    }

    // 3. Set public read permissions
    await fetch(`${DRIVE_API}/files/${encodeURIComponent(iconFileId)}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    }).catch(() => {});

    return `https://drive.google.com/uc?export=view&id=${iconFileId}`;
  } catch (err) {
    console.error('Error in uploadIconImageToDrive:', err);
    return undefined;
  }
}

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

    let rawAppName = result?.CFBundleDisplayName || result?.CFBundleName || result?.application?.label;
    if (Array.isArray(rawAppName)) rawAppName = rawAppName[0];
    if (typeof rawAppName === 'object' && rawAppName) rawAppName = rawAppName.value || rawAppName[0];

    const bundleId: string | undefined = result?.CFBundleIdentifier || result?.package;
    const bundleVersion: string | undefined = result?.CFBundleShortVersionString || result?.versionName || result?.CFBundleVersion;
    const buildNumber: string | undefined = result?.CFBundleVersion || (result?.versionCode ? result.versionCode.toString() : undefined);
    const appIconData: string | undefined = typeof result?.icon === 'string' ? result.icon : undefined;

    let iconUrl: string | undefined = undefined;
    if (appIconData && appIconData.startsWith('data:image/')) {
      iconUrl = await uploadIconImageToDrive(token, fileId, appIconData);
    }

    const properties: Record<string, string> = {};
    if (bundleId) properties.builddrop_bundle_id = bundleId.slice(0, 100);
    if (bundleVersion) properties.builddrop_bundle_version = bundleVersion.slice(0, 50);
    if (buildNumber) properties.builddrop_build_number = buildNumber.slice(0, 50);
    if (typeof rawAppName === 'string' && rawAppName) properties.builddrop_app_name = rawAppName.slice(0, 100);
    if (iconUrl) properties.builddrop_app_icon = iconUrl.slice(0, 120);

    if (Object.keys(properties).length > 0) {
      const patchRes = await fetch(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ properties }),
        }
      );
      if (!patchRes.ok) {
        console.error('Failed to save app metadata to Drive:', patchRes.status, await patchRes.text());
      }
    }

    return Response.json({ success: true, bundleId, bundleVersion, appName: rawAppName, appIconUrl: iconUrl });
  } catch (err) {
    console.error('Failed to parse app metadata:', err);
    return Response.json({ success: false, reason: 'parse_failed' });
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
};

export const config: Config = {
  path: '/api/extract-ipa-metadata',
};
