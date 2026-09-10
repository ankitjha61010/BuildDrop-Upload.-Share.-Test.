// Confirms a resumable upload session is complete and hands back the finished file's metadata,
// entirely server-side. Google Drive's resumable upload endpoint has a known quirk where the
// final "200 OK" response (the one carrying the completed file resource) sometimes comes back
// without Access-Control-Allow-Origin, even though the "308 Resume Incomplete" responses for
// earlier chunks of the same session do include it - the browser then reports the completed
// upload as a plain network error even though Drive already has the whole file. This status
// check runs server-to-server (no CORS involved) so it can reliably recover the file resource
// the browser couldn't read directly.
import type { Config } from '@netlify/functions';

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let uploadUrl: unknown, fileSize: unknown;
  try {
    const body = await req.json();
    uploadUrl = body?.uploadUrl;
    fileSize = body?.fileSize;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  // Restricted to Drive's own upload host so this can't be used as an open proxy for
  // client-supplied URLs.
  if (
    !uploadUrl ||
    typeof uploadUrl !== 'string' ||
    !uploadUrl.startsWith('https://www.googleapis.com/upload/drive/v3/files')
  ) {
    return new Response('Missing or invalid uploadUrl', { status: 400 });
  }
  if (typeof fileSize !== 'number' || fileSize <= 0) {
    return new Response('Missing or invalid fileSize', { status: 400 });
  }

  const statusRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${fileSize}` },
  });

  if (statusRes.status === 200 || statusRes.status === 201) {
    const fileData = await statusRes.json();
    return Response.json(fileData);
  }

  if (statusRes.status === 308) {
    return new Response('Upload is not yet complete', { status: 409 });
  }

  const detail = await statusRes.text().catch(() => '');
  console.error('Failed to confirm upload completion:', statusRes.status, detail);
  return new Response('Failed to confirm upload completion', { status: 502 });
};

export const config: Config = {
  path: '/api/complete-upload',
};
