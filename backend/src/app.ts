import { join } from 'path';
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
import { DELETE_ACCOUNT_PAGE, PRIVACY_PAGE, TERMS_PAGE } from './legal/pages';
import { HOME_PAGE } from './legal/home';
import { AUTH_CONFIRM_PAGE, AUTH_CONFIRM_PATH, AUTH_CONFIRM_SCRIPT, AUTH_CONFIRM_SCRIPT_PATH } from './legal/authConfirm';
import { legacyMediaUrls } from './middleware/legacyMediaUrls';
import { adminRouter } from './admin/admin.routes';
import { firstNameOf, invitePage } from './legal/invite';
import { verifyInviteLinkToken } from './utils/inviteLink';
import { supabaseAdmin } from './lib/supabaseAdmin';
import { captureFailedResponses } from './services/appTelemetry.service';
import { hasLoadTestKey } from './middleware/loadTestKey';

dotenv.config();

export const app = express();

const env = getEnvConfig();

app.use((req, res, next) => {
  const requestId = randomUUID();
  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

app.set('trust proxy', 1);
app.use(requestLogger);
app.use(captureFailedResponses as express.RequestHandler);

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
  skip: (req) => req.path === '/health' || req.path === '/api/health' || hasLoadTestKey(req),
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Invitation links shared from the app. The personal one names who sent it,
// so the app can connect the two people; the plain one is for older links.
// WhatsApp reads the page's title for the preview. Nothing here is private.
const isAndroid = (req: express.Request) => /android/i.test(req.get('user-agent') ?? '');
app.get('/invite', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(invitePage({ firstName: null, token: null, android: isAndroid(req) }));
});
app.get('/invite/:token', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const token = String(req.params.token);
  let firstName: string | null = null;
  try {
    const { inviterUserId } = verifyInviteLinkToken(token);
    const { data } = await supabaseAdmin.from('profiles').select('full_name').eq('id', inviterUserId).maybeSingle();
    firstName = firstNameOf(data?.full_name);
  } catch (error) {
    const expired = error instanceof AppError && error.statusCode === 410;
    res.status(expired ? 410 : 404).type('html').send(invitePage({ firstName: null, token: null, android: isAndroid(req), expired }));
    return;
  }
  res.type('html').send(invitePage({ firstName, token, android: isAndroid(req) }));
});

// Public home and legal pages linked from the app and from the Google Play listing.
for (const [path, html] of [
  ['/', HOME_PAGE],
  ['/privacidad', PRIVACY_PAGE],
  ['/terminos', TERMS_PAGE],
  ['/cuenta/eliminar', DELETE_ACCOUNT_PAGE],
] as const) {
  app.get(path, (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('html').send(html);
  });
}

// Where the sign-up and password emails land. Never cached: it is a one-off step.
app.get(AUTH_CONFIRM_PATH, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.type('html').send(AUTH_CONFIRM_PAGE);
});
app.get(AUTH_CONFIRM_SCRIPT_PATH, (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('application/javascript').send(AUTH_CONFIRM_SCRIPT);
});

// Vorian's mark for emails, which can't show the SVG the pages use.
app.get('/marca/vorian.png', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(join(process.cwd(), 'public/brand/vorian-mark.png'));
});

// The owner's admin panel: a page only, every number comes from /admin/api
// after an admin signs in. Kept out of search engines and never cached.
app.use('/admin/api', adminRouter);
app.get(['/admin', '/admin/'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Same policy as the rest of the site, plus blob: audio for the voice
  // samples the panel fetches with the admin's session.
  res.setHeader('Content-Security-Policy', "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;media-src 'self' blob:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests");
  res.sendFile(join(process.cwd(), 'public/admin/index.html'));
});
app.use('/admin', express.static(join(process.cwd(), 'public/admin'), {
  index: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  },
}));

// Main router. Old public file addresses leave the server already signed.
app.use('/api', legacyMediaUrls, router);

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global Error Handler
app.use(globalErrorHandler as any);
