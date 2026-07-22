/**
 * Graceful fallback for avatar / photo <img> tags.
 *
 * A handful of records point at an upload that no longer exists on the server
 * (e.g. a PDF was submitted as a profile photo, so no image was ever written).
 * The request 404s and the browser paints its ugly "broken image" glyph. This
 * swaps in a neutral avatar instead, so a missing file looks like a placeholder
 * rather than a bug.
 *
 * Purely additive: it only runs on the error event, and guards against a loop
 * if the fallback itself ever failed to load.
 */
const AVATAR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
  '<rect width="40" height="40" fill="#e5e7eb"/>' +
  '<circle cx="20" cy="15.5" r="6.5" fill="#9ca3af"/>' +
  '<path d="M6 38c0-7.7 6.3-14 14-14s14 6.3 14 14z" fill="#9ca3af"/>' +
  '</svg>';

export const AVATAR_FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent(AVATAR_SVG)}`;

export const onImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  if (img.dataset.fallbackApplied) return; // already swapped — don't loop
  img.dataset.fallbackApplied = '1';
  img.src = AVATAR_FALLBACK;
};
