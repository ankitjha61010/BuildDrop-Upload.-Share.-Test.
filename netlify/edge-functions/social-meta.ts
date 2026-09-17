// Rewrites the static index.html's Open Graph / Twitter meta tags with the specific build's own
// name and description before handing the page to a link-preview crawler (Slack, WhatsApp,
// Discord, iMessage, etc). Those crawlers never run our client-side JS, so without this every
// /watch/:id link unfurls with the same generic site title/description and no image - which is
// what was happening when builds were shared in Slack.
//
// The preview image is always the static BuildDrop site logo (og-image.png), never the build's
// own app icon: that icon has to be fetched live through our Drive-authenticated proxy on every
// single unfurl request, and whoever's crawler/client hits it first can catch it mid-failure
// (an expired token, a slow Drive response, a transient rate limit) - which is exactly why the
// sender saw the icon-based preview render fine while other recipients saw a broken one. The
// static logo is served straight from Netlify's CDN with nothing to fail, so it renders
// identically for everyone.
//
// Only runs for known crawler User-Agents; real browsers get the untouched SPA shell straight from
// context.next() so page-load latency for actual visitors is unaffected.
import type { Config, Context } from '@netlify/edge-functions';
import { getDriveAccessToken } from '../lib/googleDriveAuth.ts';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const SECRET_KEY = 'BuildDropShareKey2026';

const CRAWLER_UA_REGEX =
  /bot|facebookexternalhit|slackbot|twitterbot|discordbot|telegrambot|whatsapp|linkedinbot|pinterest|redditbot|skypeuripreview|iframely|embedly|outbrain|flipboard|w3c_validator|nuzzel|vkshare|quora link preview/i;

// Mirrors src/utils/urlSecurity.ts's decodeFileId - duplicated here (rather than imported) so this
// edge function stays a self-contained Deno module like the rest of netlify/edge-functions.
function decodeFileId(token: string): string {
  if (!token) return '';
  if (!token.startsWith('bd_')) return token;

  try {
    const rawToken = token.slice(3);
    let base64 = rawToken.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const xorStr = atob(base64);
    let fileId = '';
    for (let i = 0; i < xorStr.length; i++) {
      const charCode = xorStr.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
      fileId += String.fromCharCode(charCode);
    }
    return fileId;
  } catch {
    return token;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function replaceMetaContent(html: string, selector: RegExp, content: string): string {
  return html.replace(selector, (_match, prefix) => `${prefix}${content}"`);
}

export default async (request: Request, context: Context) => {
  const response = await context.next();

  const userAgent = request.headers.get('User-Agent') || '';
  if (!CRAWLER_UA_REGEX.test(userAgent)) {
    return response;
  }

  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  try {
    const url = new URL(request.url);
    const rawToken = url.pathname.split('/watch/')[1] || '';
    const fileId = decodeFileId(decodeURIComponent(rawToken));
    if (!fileId) return response;

    let title = 'BuildDrop — Upload. Share. Test.';
    let description =
      'Production-grade, frontend-only high-speed file uploading and sharing platform backed directly by Google Drive and Netlify.';
    // "?v=2" cache-busts the crawler's own cached copy of this URL - keep this in sync with the
    // version on the static og:image tags in index.html (see the comment there for why).
    const image = `${url.origin}/og-image.png?v=2`;

    const accessToken = await getDriveAccessToken();
    const driveRes = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,properties,appProperties,trashed&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (driveRes.ok) {
      const file = await driveRes.json();
      if (!file.trashed) {
        const props = { ...file.appProperties, ...file.properties };
        const appName = props.builddrop_app_name || props.original_name || file.name || 'Shared Build';
        title = `${appName} — BuildDrop`;
        description = props.builddrop_description || `Download "${appName}" - shared via BuildDrop.`;
      }
    }

    let html = await response.text();

    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
    html = replaceMetaContent(html, /(<meta name="description" content=")[^"]*"/, escapeHtml(description));
    html = replaceMetaContent(html, /(<meta property="og:title" content=")[^"]*"/, escapeHtml(title));
    html = replaceMetaContent(html, /(<meta property="og:description" content=")[^"]*"/, escapeHtml(description));
    html = replaceMetaContent(html, /(<meta property="og:image" content=")[^"]*"/, escapeHtml(image));
    html = replaceMetaContent(html, /(<meta name="twitter:title" content=")[^"]*"/, escapeHtml(title));
    html = replaceMetaContent(html, /(<meta name="twitter:description" content=")[^"]*"/, escapeHtml(description));
    html = replaceMetaContent(html, /(<meta name="twitter:image" content=")[^"]*"/, escapeHtml(image));
    html = html.replace(
      /(<meta property="og:site_name" content="[^"]*"\s*\/>)/,
      `$1\n    <meta property="og:url" content="${escapeHtml(request.url)}" />`
    );

    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'text/html; charset=UTF-8');
    headers.delete('Content-Length');

    return new Response(html, { status: response.status, headers });
  } catch (err) {
    console.error('[SocialMeta] Failed to rewrite share preview meta tags:', err);
    return response;
  }
};

export const config: Config = {
  path: '/watch/*',
};
