import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { createRateLimitStore } from './middleware/rateLimitStore';
import { createHash, randomUUID } from 'crypto';
import { router } from './routes';
import { globalErrorHandler } from './middleware/errorHandler';
import { getEnvConfig } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { isAllowedRequestOrigin, isStrictCorsEnvironment } from './security/corsPolicy';
import { AppError } from './utils/AppError';

dotenv.config();

export const app = express();

const PING_INVITE_PAGE = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Invitación a Ping</title>
    <style>
      :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f7fb; color: #17233b; }
      main { width: min(92vw, 420px); box-sizing: border-box; padding: 32px 26px; border-radius: 24px; background: #fff; box-shadow: 0 12px 36px rgba(23, 35, 59, .12); text-align: center; }
      h1 { margin: 0 0 12px; font-size: 30px; }
      p { margin: 0 0 24px; color: #536176; line-height: 1.5; }
      a { display: inline-block; width: 100%; box-sizing: border-box; padding: 14px 18px; border-radius: 14px; background: #2477e8; color: #fff; font-weight: 700; text-decoration: none; }
      .hint { margin-top: 18px; margin-bottom: 0; font-size: 13px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Te invitaron a Ping</h1>
      <p>Ping ayuda a conversar y recordar lo importante.</p>
      <a href="ping:///invite">Abrir Ping</a>
      <p class="hint">Si Ping no está instalada, instálala y vuelve a abrir este enlace.</p>
    </main>
  </body>
</html>`;

const env = getEnvConfig();

app.use((req, res, next) => {
  const requestId = randomUUID();
  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

app.set('trust proxy', 1);
app.use(requestLogger);

app.use(helmet({
  crossOriginResourcePolicy: false,
}));

app.use((req, res, next) => cors({
  origin: (origin, callback) => {
    // Native Ping Voz loads its credential-free client from this same backend
    // origin inside a WebView. Keep the explicit allowlist, while also
    // accepting that exact request origin without opening CORS to arbitrary
    // hosts.
    if (isAllowedRequestOrigin(req, origin, env.allowedOrigins)) {
      callback(null, true);
      return;
    }

    if (!isStrictCorsEnvironment(env.nodeEnv, env.environmentName) && env.allowedOrigins.length === 0) {
      callback(null, true);
      return;
    }

    callback(new AppError('Origin not allowed by CORS', 403));
  },
})(req, res, next));

function globalRateLimitKey(req: express.Request): string {
  const authorization = req.get('authorization')?.trim();
  if (authorization && /^Bearer\s+\S+$/i.test(authorization)) {
    // Never expose or store the access token itself in the limiter key.
    // Hashing isolates authenticated mobile sessions from unrelated users
    // behind the same NAT while keeping the limiter process-local and cheap.
    return `auth:${createHash('sha256').update(authorization).digest('hex')}`;
  }
  return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
}

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  store: createRateLimitStore('global'),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: globalRateLimitKey,
  // Liveness/readiness probes are not product traffic and must not consume
  // the same budget as authenticated mobile requests.
  skip: (req) => req.path === '/health' || req.path === '/api/health',
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Public landing page used by contact invitations. It deliberately contains
// no user data or authentication state: WhatsApp needs an HTTPS URL it can
// render as a link, while the button hands off to Ping's native scheme when
// the app is installed.
app.get('/invite', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('html').send(PING_INVITE_PAGE);
});

// Main router
app.use('/api', router);

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global Error Handler
app.use(globalErrorHandler as any);
