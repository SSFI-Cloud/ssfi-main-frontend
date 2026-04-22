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
    const a = document.createElement('a');
    a.href = url;
    a.download = guessedName;
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
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = guessedName;
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
