import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import proRouter from "./routes/pro";
import { logger } from "./lib/logger";
import { recordRequest } from "./lib/metrics";

const app: Express = express();

// Trust the first hop of X-Forwarded-For so req.ip reflects the real
// client IP when the server runs behind a reverse proxy (Nginx, Cloudflare,
// the Replit edge, etc.).  Without this, req.ip is the proxy's IP and every
// client shares the same rate-limit bucket.
app.set("trust proxy", 1);
// API responses must never be cached by the browser or any intermediate proxy,
// or the UI can show stale data (e.g., status text, profile fields) after updates.
app.set("etag", false);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Build an explicit CORS allowlist from CORS_ORIGINS (comma-separated full
// origins, e.g. "https://gmes.app,https://www.gmes.app") and from
// REPLIT_DOMAINS (Replit-managed domains, automatically set in the Replit
// environment).  Reflecting every incoming Origin with credentials:true is
// explicitly prohibited by the CORS spec — any site could make authenticated
// requests on behalf of a logged-in user.
const _isProduction = process.env.NODE_ENV === "production";

const _corsOrigins: Set<string> = (() => {
  const set = new Set<string>();
  for (const o of (process.env.CORS_ORIGINS ?? "").split(",")) {
    const t = o.trim();
    if (t) set.add(t);
  }
  for (const d of (process.env.REPLIT_DOMAINS ?? "").split(",")) {
    const t = d.trim();
    if (t) set.add(`https://${t}`);
  }
  // In development / test environments also allow localhost at any port so that
  // Playwright, browser-based E2E tests, and local tooling can reach the API
  // without hitting CORS rejections.  This is intentionally NOT allowed in
  // production, where only the explicit CORS_ORIGINS allowlist is trusted.
  if (!_isProduction) {
    set.add("http://localhost");
    set.add("http://localhost:80");
    set.add("http://localhost:3000");
    set.add("http://localhost:5173");
  }
  return set;
})();

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin / non-browser requests (no Origin header) and
    // explicitly listed origins only.
    // NOTE: use (null, false) — not new Error() — so a rejected origin returns
    // a 403 via the explicit handler below, never an unhandled-error 500.
    if (!origin || _corsOrigins.has(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));

// Explicit 403 for cross-origin requests that were denied by the CORS
// callback above.  Without this, Express falls through to the default 500
// error handler, which leaks stack traces to the client.
app.use((req, res, next) => {
  // If cors() ran and rejected the origin, it does NOT set the
  // Access-Control-Allow-Origin header.  Detect that and return 403.
  const origin = req.headers.origin as string | undefined;
  if (origin && !_corsOrigins.has(origin) && !res.headersSent) {
    res.status(403).json({ error: "CORS: origin not allowed" });
    return;
  }
  next();
});

// Salla webhook must receive the raw body to verify HMAC signatures.
app.use("/api/webhooks/salla", express.raw({ type: "application/json" }), proRouter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Timing + byte-counting middleware
app.use((req, res, next) => {
  const start    = Date.now();
  const bytesIn  = Number(req.headers["content-length"] ?? 0);
  res.on("finish", () => {
    const bytesOut = Number(res.getHeader("content-length") ?? 0);
    recordRequest(Date.now() - start, bytesIn, bytesOut);
  });
  next();
});

// Before routing, mark all API responses as uncacheable. Individual routes
// (like image assets) may override this with their own Cache-Control headers.
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use("/api", router);

export default app;
