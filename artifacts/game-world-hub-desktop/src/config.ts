/**
 * Persistent desktop app configuration, backed by electron-store.
 *
 * Stores values that must survive across launches but are generated locally
 * on the user's machine — most importantly the JWT signing secret for the
 * bundled API server, which is created once on first launch.
 */
import Store from 'electron-store';
import crypto from 'crypto';

interface StoreSchema {
  /** Secret used by the bundled API server to sign/verify JWTs */
  jwtSecret?: string;
}

// Written to <userData>/gwh-config.json
const store = new Store<StoreSchema>({ name: 'gwh-config' });

/**
 * Returns the JWT secret for the bundled API server, generating and
 * persisting a fresh random one the first time the app is launched.
 */
export function getJwtSecret(): string {
  let secret = store.get('jwtSecret');
  if (!secret) {
    secret = crypto.randomBytes(48).toString('hex');
    store.set('jwtSecret', secret);
  }
  return secret;
}
