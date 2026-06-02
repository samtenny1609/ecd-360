import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { cycleRoutes } from "./routes/cycle.routes";
import { authRoutes } from "./routes/auth.routes";
import { childrenRoutes } from "./routes/children.routes";
import { actionsRoutes } from "./routes/actions.routes";

export const app = express();
app.set('trust proxy', 1);

// ─── Security and core middleware ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline styles/scripts for frontend
}));
app.use(cors({
  origin: true,
  credentials: true, // Required for httpOnly cookie to be sent cross-origin
}));
app.use(express.json());
app.use(cookieParser()); // Parse httpOnly session cookies

// ─── Static frontend ─────────────────────────────────────────────────────────
// Static files — process.cwd() works in both dev and prod builds
app.use(express.static(path.resolve(process.cwd(), "public")));

// ─── Global rate limiting ─────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
app.use(globalLimiter);

// ─── API routes ───────────────────────────────────────────────────────────────
app.use("/v1/auth", authRoutes);
app.use("/v1/children", childrenRoutes);
app.use("/v1/cycles", cycleRoutes);
app.use("/v1/actions", actionsRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req: express.Request, res: express.Response) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});
