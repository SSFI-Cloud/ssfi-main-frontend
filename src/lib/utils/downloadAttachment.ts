/**
 * Downloads a user-submitted attachment (image / PDF / etc) from the backend
 * to the admin's machine.
 *
 * Flow:
 *   1. Fetch the URL as a blob (works for same-origin and for cross-origin
 *      URLs as long as the server sends Access-Control-Allow-Origin). The
 *      SSFI backend sets `Access-Control-Allow-Origin: *` on /uploads/* so
 *      the public upload files all work via this path.
 *   2. Create a blob: URL, trigger a synthetic <a download> click, revoke.
 *   3. If the fetch fails (e.g. protected /uploads/documents/* without CORS,
 *      or a data: URL where fetch is unnecessary), fall back to opening the
 *      URL in a new tab. The browser either triggers a download directly
 *      (if Content-Disposition is attachment) or lets the admin right-click
 *      → Save Image As.
 *
 * For data: URLs we skip fetch entirely and just anchor-click — fetch on a
 * data URL works, but doing it directly avoids an unnecessary round-trip.
 */
/** MIME → file extension for the types we actually store. */
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf',
};

const extFromMime = (mime?: string): string => {
  if (!mime) return '';
  const clean = mime.split(';')[0].trim().toLowerCase();
  if (MIME_EXT[clean]) return MIME_EXT[clean];
  const sub = clean.split('/')[1] || '';
  return /^[a-z0-9+.-]{2,8}$/.test(sub) ? sub.replace('+xml', '') : '';
};

const extFromUrl = (u: string): string => {
  const path = u.split('?')[0].split('#')[0];
  const m = path.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : '';
};

/** Strip characters that are illegal in filenames on Windows/macOS. */
const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'attachment';

/**
 * Ensure the saved filename carries the extension that matches the ACTUAL
 * bytes. Callers pass names like "SUCHIN G-photo" with no extension, and the
 * browser then guesses one — it was saving WebP files as ".jpeg", which the OS
 * image viewer refuses to open ("damaged or unrecognised format").
 */
const withExtension = (name: string, ext: string): string => {
  const base = safeName(name);
  if (!ext) return base;
  return new RegExp(`\\.${ext}$`, 'i').test(base) ? base : `${base.replace(/\.+$/, '')}.${ext}`;
};

export async function downloadAttachment(url: string, filename?: string): Promise<void> {
  if (!url) return;

  // Derive a reasonable default filename from the URL tail if none given.
  const guessedName = (() => {
    if (filename) return filename;
    try {
      if (url.startsWith('data:')) {
        const mime = url.slice(5, url.indexOf(';'));
        const ext = mime.split('/')[1] || 'bin';
        return `attachment.${ext}`;
      }
      const path = url.split('?')[0];
      const tail = path.split('/').pop() || 'attachment';
      return tail;
    } catch {
      return 'attachment';
    }
  })();

  // Direct anchor-click path for data: URLs — no network round trip.
  if (url.startsWith('data:')) {
    const mime = url.slice(5, url.indexOf(';'));
    const a = document.createElement('a');
    a.href = url;
    a.download = withExtension(guessedName, extFromMime(mime));
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  try {
    const res = await fetch(url, {
      // Include cookies so /uploads/documents/* (auth-protected) can be
      // fetched if the admin is logged in. Public /uploads/* ignores it.
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Download fetch failed: ${res.status}`);
    const blob = await res.blob();
    // Name the file after what it ACTUALLY is: prefer the served Content-Type,
    // fall back to the URL's own extension.
    const ext = extFromMime(blob.type || res.headers.get('content-type') || '') || extFromUrl(url);
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = withExtension(guessedName, ext);
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on next tick — Safari + Firefox race with the download if too
    // soon; half a second is plenty.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 500);
  } catch {
    // CORS block / network error — open in new tab so the admin can still
    // reach the file (right-click → Save).
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
