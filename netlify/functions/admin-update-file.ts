// Netlify Function: Admin endpoint to update metadata, replace build file, replace image,
// or remove image on a Google Drive file resource.
import type { Config } from '@netlify/functions';
import { getDriveAccessToken } from '../lib/googleDriveAuth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let fileId: unknown,
    name: unknown,
    appName: unknown,
    bundleId: unknown,
    bundleVersion: unknown,
    buildNumber: unknown,
    uploadType: unknown,
    expiresAt: unknown,
    removeImage: unknown,
    newIconUrl: unknown;

  try {
    const body = await req.json();
    fileId = body?.fileId;
    name = body?.name;
    appName = body?.appName;
    bundleId = body?.bundleId;
    bundleVersion = body?.bundleVersion;
    buildNumber = body?.buildNumber;
    uploadType = body?.uploadType;
    expiresAt = body?.expiresAt;
    removeImage = body?.removeImage;
    newIconUrl = body?.newIconUrl;
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
    console.error('[AdminUpdate] Failed to get Drive access token:', err);
    return new Response('Server auth error', { status: 500 });
  }

  try {
    // 1. Fetch current file properties to inspect existing icon ID
    const currentRes = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,properties,appProperties&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const currentProps = currentRes.ok ? { ...(await currentRes.json()).properties } : {};
    const oldIconUrl = currentProps.builddrop_app_icon;

    const patchPayload: Record<string, any> = {};
    if (typeof name === 'string' && name.trim()) {
      patchPayload.name = name.trim();
    }

    const properties: Record<string, string> = { ...currentProps };

    if (typeof appName === 'string') properties.builddrop_app_name = appName.slice(0, 100);
    if (typeof bundleId === 'string') properties.builddrop_bundle_id = bundleId.slice(0, 100);
    if (typeof bundleVersion === 'string') properties.builddrop_bundle_version = bundleVersion.slice(0, 50);
    if (typeof buildNumber === 'string') properties.builddrop_build_number = buildNumber.slice(0, 50);

    if (uploadType === 'PRIVATE' || uploadType === 'NORMAL') {
      properties.builddrop_upload_type = uploadType;
    }

    const isPrivate = properties.builddrop_upload_type === 'PRIVATE';

    if (isPrivate) {
      // PRIVATE builds never expire - clear expiration timestamp
      delete properties.vidsetu_expires_at;
    } else if (typeof expiresAt === 'number' || typeof expiresAt === 'string') {
      properties.vidsetu_expires_at = expiresAt.toString();
    }

    // Handle Image Removal or Replacement
    if (removeImage) {
      delete properties.builddrop_app_icon;
      // Delete old image file from Drive if present
      if (oldIconUrl && oldIconUrl.includes('id=')) {
        const oldIconId = oldIconUrl.split('id=')[1]?.split('&')[0];
        if (oldIconId) {
          await fetch(`${DRIVE_API}/files/${encodeURIComponent(oldIconId)}?supportsAllDrives=true`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
      }
    } else if (typeof newIconUrl === 'string' && newIconUrl) {
      properties.builddrop_app_icon = newIconUrl.slice(0, 120);
      // Delete old image file from Drive if replacing
      if (oldIconUrl && oldIconUrl !== newIconUrl && oldIconUrl.includes('id=')) {
        const oldIconId = oldIconUrl.split('id=')[1]?.split('&')[0];
        if (oldIconId) {
          await fetch(`${DRIVE_API}/files/${encodeURIComponent(oldIconId)}?supportsAllDrives=true`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
      }
    }

    patchPayload.properties = properties;

    const patchRes = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patchPayload),
      }
    );

    if (!patchRes.ok) {
      const errText = await patchRes.text().catch(() => '');
      console.error('[AdminUpdate] Drive patch error:', patchRes.status, errText);
      return new Response('Failed to update file metadata on Drive', { status: 502 });
    }

    const updatedFile = await patchRes.json();
    return Response.json({ success: true, file: updatedFile });
  } catch (err: any) {
    console.error('[AdminUpdate] Unexpected error:', err);
    return new Response(err?.message || 'Server error', { status: 500 });
  }
};

export const config: Config = {
  path: '/api/admin-update-file',
};
