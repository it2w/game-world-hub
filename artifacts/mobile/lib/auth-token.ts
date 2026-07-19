/**
 * Module-level JWT token store.
 * Used by customFetch's auth token getter — this avoids React context
 * re-render overhead and circular-dependency issues in _layout.tsx.
 */
let _token: string | null = null;

export function getToken(): string | null {
  return _token;
}

export function setToken(token: string | null): void {
  _token = token;
}
