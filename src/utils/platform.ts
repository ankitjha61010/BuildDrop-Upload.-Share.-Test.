// iPadOS 13+ identifies itself as "Macintosh" in the user agent, so touch support is the only
// reliable signal left to tell a real Mac apart from an iPad requesting desktop sites.
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}
