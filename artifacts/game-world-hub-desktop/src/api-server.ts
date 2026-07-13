/**
 * Manages the bundled Game World Hub API server as a child process.
 *
 * On startup the Electron main process forks the API server's compiled
 * bundle (`api-server/dist/index.mjs`) on a free local port, so a user who
 * only installed the desktop app gets a working backend without running
 * anything separately. The child is reliably terminated on app quit/crash.
 */
import { app } from 'electron';
import { fork, type ChildProcess } from 'child_process';
import path from 'path';
import net from 'net';
import http from 'http';
import { getJwtSecret } from './config';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let serverProcess: ChildProcess | null = null;

/** Resolve the path to the API server bundle in dev vs. packaged builds. */
function getServerEntry(): string {
  if (isDev) {
    // dev: run from the monorepo build output
    // __dirname === artifacts/game-world-hub-desktop/dist
    return path.resolve(__dirname, '..', '..', 'api-server', 'dist', 'index.mjs');
  }
  // packaged: bundled via electron-builder extraResources
  return path.join(process.resourcesPath, 'api-server', 'dist', 'index.mjs');
}

/** Grab an available TCP port from the OS. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const { port } = addr;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('Failed to acquire a free port')));
      }
    });
  });
}

/** Poll the health endpoint until the server responds or we time out. */
function waitForHealthy(port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  const url = `http://127.0.0.1:${port}/api/healthz`;

  return new Promise((resolve, reject) => {
    const retry = (reason: Error) => {
      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(
            `API server did not become healthy within ${timeoutMs}ms: ${reason.message}`,
          ),
        );
        return;
      }
      setTimeout(attempt, 400);
    };

    const attempt = () => {
      // Bail out early if the child died before becoming healthy
      if (!serverProcess || serverProcess.exitCode !== null) {
        reject(new Error('API server process exited before becoming healthy'));
        return;
      }
      const req = http.get(url, res => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry(new Error(`HTTP ${res.statusCode}`));
      });
      req.on('error', retry);
      req.setTimeout(2_000, () => req.destroy(new Error('health check timed out')));
    };

    attempt();
  });
}

export interface ApiServerHandle {
  port: number;
  baseUrl: string;
}

/**
 * Fork the bundled API server on a free local port and wait until it is
 * healthy. Throws if the required database connection string is missing or
 * the server fails to come up.
 */
export async function startApiServer(): Promise<ApiServerHandle> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. The bundled API server needs a PostgreSQL ' +
        'connection string to start.',
    );
  }

  const port = await findFreePort();
  const entry = getServerEntry();

  serverProcess = fork(entry, [], {
    // Run the child as plain Node under Electron's bundled runtime.
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
      JWT_SECRET: getJwtSecret(),
      DATABASE_URL: databaseUrl,
    },
    // Don't inherit --inspect/--require flags from the parent Electron process.
    execArgv: [],
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  serverProcess.stdout?.on('data', chunk => process.stdout.write(`[api] ${chunk}`));
  serverProcess.stderr?.on('data', chunk => process.stderr.write(`[api] ${chunk}`));

  serverProcess.on('exit', (code, signal) => {
    console.log(`[api] server process exited (code=${code}, signal=${signal})`);
    serverProcess = null;
  });

  await waitForHealthy(port);

  return { port, baseUrl: `http://127.0.0.1:${port}` };
}

/** Terminate the API server child process, if running. */
export function stopApiServer(): void {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill();
  }
  serverProcess = null;
}
