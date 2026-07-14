/**
 * Resolves an image reference to something an <img> can load.
 * The API already returns servable `/api/storage/objects/...` URLs, but a
 * freshly-uploaded path is still `/objects/...` until saved — map it here.
 */
export function displayImageUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("/objects/")) return `/api/storage${value}`;
  return value;
}
