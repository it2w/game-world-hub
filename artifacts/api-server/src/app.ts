import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import proRouter from "./routes/pro";
import { logger } from "./lib/logger";
import { recordRequest } from "./lib/metrics";

const app: Express = express();

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

app.use(cors({
  origin: true,
  credentials: true,
}));

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

app.use("/api", router);

export default app;
