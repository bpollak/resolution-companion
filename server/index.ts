import express from "express";
import compression from "compression";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { ensureSchema } from "./db";
import * as fs from "fs";
import * as path from "path";

const app = express();
const log = console.log;
const SITE_URL = "https://resolutioncompanion.com";

// Railway (and most PaaS hosts) terminate TLS at a reverse proxy. Without this,
// req.ip is the proxy address — which collapses all per-IP rate limiting into a
// single shared bucket — and req.protocol is always "http".
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  // Configure allowed origins via ALLOWED_ORIGINS env var (comma-separated).
  // The native app sends no Origin header and the website's feedback form is
  // same-origin, so no cross-origin access is needed unless explicitly granted.
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o: string) => o.trim())
    : null;

  app.use((req, res, next) => {
    const origin = req.header("origin");

    if (origin) {
      const isAllowed = allowedOrigins
        ? allowedOrigins.includes(origin)
        : false;

      if (isAllowed) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS",
        );
        res.header(
          "Access-Control-Allow-Headers",
          "Content-Type, Cache-Control, Pragma, X-Requested-With, X-API-Key, X-Device-Id",
        );
        res.header("Access-Control-Allow-Credentials", "true");
      }
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

// Endpoints whose responses contain device-linked data — log status only
const SENSITIVE_LOG_PREFIXES = [
  "/api/subscription",
  "/api/user-data",
  "/api/iap",
];

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const isSensitive = SENSITIVE_LOG_PREFIXES.some((prefix) =>
      path.startsWith(prefix),
    );

    if (!isSensitive) {
      const originalResJson = res.json;
      res.json = function (bodyJson, ...args) {
        capturedJsonResponse = bodyJson;
        return originalResJson.apply(res, [bodyJson, ...args]);
      };
    }

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function configureExpoAndLanding(app: express.Application) {
  const landingPageTemplate = fs.readFileSync(
    path.resolve(process.cwd(), "server", "templates", "landing-page.html"),
    "utf-8",
  );
  const privacyTemplate = fs.readFileSync(
    path.resolve(process.cwd(), "server", "templates", "privacy.html"),
    "utf-8",
  );
  const termsTemplate = fs.readFileSync(
    path.resolve(process.cwd(), "server", "templates", "terms.html"),
    "utf-8",
  );
  const feedbackTemplate = fs.readFileSync(
    path.resolve(process.cwd(), "server", "templates", "feedback.html"),
    "utf-8",
  );

  const appName = getAppName();

  const publicDir = path.resolve(process.cwd(), "public");
  if (fs.existsSync(publicDir)) {
    // Images change rarely; let browsers and the CDN cache them for a week
    app.use(
      "/assets",
      express.static(path.join(publicDir, "assets"), { maxAge: "7d" }),
    );

    // Root-level discovery files change with the site and should be reachable
    // without routing each filename through Express separately.
    app.use(
      express.static(publicDir, {
        dotfiles: "deny",
        index: false,
        redirect: false,
        maxAge: "1h",
      }),
    );
  }

  const staticBuildDir = path.resolve(process.cwd(), "static-build");
  if (fs.existsSync(staticBuildDir)) {
    log("Serving static Expo files with dynamic manifest routing");
    app.use("/_expo", express.static(path.join(staticBuildDir)));

    log("Expo routing: Checking expo-platform header on / and /manifest");
    app.get(
      ["/", "/manifest"],
      (req: Request, res: Response, next: Function) => {
        const platform = req.header("expo-platform");
        if (platform) {
          return serveExpoManifest(platform, res);
        }
        next();
      },
    );
  }

  // Short-lived caching for HTML: fast repeat views, updates propagate quickly
  const sendHtml = (res: Response, html: string) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.status(200).send(html);
  };

  app.get("/", (_req: Request, res: Response) => {
    const html = landingPageTemplate
      .replace(/BASE_URL_PLACEHOLDER/g, SITE_URL)
      .replace(/APP_NAME_PLACEHOLDER/g, appName);

    sendHtml(res, html);
  });

  app.get("/privacy", (_req: Request, res: Response) => {
    sendHtml(res, privacyTemplate);
  });

  app.get("/terms", (_req: Request, res: Response) => {
    sendHtml(res, termsTemplate);
  });

  app.get("/feedback", (_req: Request, res: Response) => {
    sendHtml(res, feedbackTemplate);
  });
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    res.status(status).json({ message });

    console.error("Unhandled error:", err);
  });
}

(async () => {
  app.use(
    compression({
      filter: (req, res) => {
        // Never buffer the SSE chat stream — chunks must flush immediately
        if (req.path === "/api/chat") return false;
        return compression.filter(req, res);
      },
    }),
  );
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);

  await ensureSchema();

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
    },
  );
})();
