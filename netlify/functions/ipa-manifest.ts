// Serves the itms-services manifest.plist iOS needs for an over-the-air .ipa install. Tapping
// "Install" on WatchPage navigates to itms-services://?action=download-manifest&url=<this
// endpoint>; iOS fetches this manifest first, then follows the software-package url inside it
// (our own /api/download-file, which already proxies Drive's bytes without Google's
// account-picker interception) to pull down and install the .ipa itself.
//
// Falls back to placeholder bundle-identifier/version when extract-ipa-metadata.ts hasn't run
// yet (or was skipped for a large file) - iOS doesn't use those fields for code-signing, only for
// its own "is this app already installed" bookkeeping, so a placeholder still lets Install work.
import type { Config } from '@netlify/functions';
import { getDriveAccessToken } from '../lib/googleDriveAuth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const fileId = url.searchParams.get('id');
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

  const metaRes = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=name,properties,appProperties,trashed&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!metaRes.ok) {
    return new Response('File not found', { status: 404 });
  }
  const file = await metaRes.json();
  if (file.trashed) {
    return new Response('File has been removed', { status: 404 });
  }

  const props = { ...file.appProperties, ...file.properties };
  const originalName: string = props.original_name || file.name || 'app.ipa';
  
  let bundleId = props.builddrop_bundle_id;
  let bundleVersion = props.builddrop_bundle_version;
  let title = props.builddrop_app_name || originalName.replace(/\.ipa$/i, '');

  // iOS OTA installs fail if manifest bundle-identifier does not match Info.plist.
  // Dynamically extract real bundleId from .ipa if missing or placeholder.
  if (!bundleId || bundleId.startsWith('com.builddrop.')) {
    try {
      const AppInfoParser: any = (await import('app-info-parser')).default || (await import('app-info-parser'));
      const { createWriteStream } = await import('fs');
      const { unlink } = await import('fs/promises');
      const { pipeline } = await import('stream/promises');
      const { Readable } = await import('stream');
      const { tmpdir } = await import('os');
      const { join } = await import('path');

      const tmpPath = join(tmpdir(), `ipa-manifest-${fileId}-${Date.now()}.ipa`);
      const fileRes = await fetch(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (fileRes.ok && fileRes.body) {
        await pipeline(Readable.fromWeb(fileRes.body as any), createWriteStream(tmpPath));
        const parser = new AppInfoParser(tmpPath);
        const result: any = await parser.parse();

        if (result?.CFBundleIdentifier) {
          bundleId = result.CFBundleIdentifier;
          if (result.CFBundleShortVersionString || result.CFBundleVersion) {
            bundleVersion = result.CFBundleShortVersionString || result.CFBundleVersion;
          }
          if (result.CFBundleDisplayName || result.CFBundleName) {
            title = result.CFBundleDisplayName || result.CFBundleName;
          }

          // Save extracted properties back to Drive asynchronously
          const propertiesToSave: Record<string, string> = { builddrop_bundle_id: bundleId.slice(0, 100) };
          if (bundleVersion) propertiesToSave.builddrop_bundle_version = bundleVersion.slice(0, 50);
          if (title) propertiesToSave.builddrop_app_name = title.slice(0, 100);

          fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ properties: propertiesToSave }),
          }).catch(() => {});
        }
        await unlink(tmpPath).catch(() => {});
      }
    } catch (err) {
      console.warn('Dynamic bundleId extraction in ipa-manifest warning:', err);
    }
  }

  bundleId = bundleId || `com.builddrop.${fileId.slice(0, 12).toLowerCase()}`;
  bundleVersion = bundleVersion || '1.0.0';

  const downloadParams = new URLSearchParams({ id: fileId, name: originalName });
  const ipaDownloadUrl = `${url.origin}/api/download-file?${downloadParams.toString()}`;

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key>
          <string>software-package</string>
          <key>url</key>
          <string>${escapeXml(ipaDownloadUrl)}</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key>
        <string>${escapeXml(bundleId)}</string>
        <key>bundle-version</key>
        <string>${escapeXml(bundleVersion)}</string>
        <key>kind</key>
        <string>software</string>
        <key>title</key>
        <string>${escapeXml(title)}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>`;

  return new Response(plist, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};

export const config: Config = {
  path: '/api/ipa-manifest',
};
