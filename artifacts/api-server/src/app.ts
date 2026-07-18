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

// Timing middleware — must come after body parsers so duration includes parse time
app.use((_req, res, next) => {
  const start = Date.now();
  res.on("finish", () => recordRequest(Date.now() - start));
  next();
});

app.use("/api", router);

export default app;
