import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { router } from './routes';
import { globalErrorHandler } from './middleware/errorHandler';
import { getEnvConfig } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { isAllowedRequestOrigin, isStrictCorsEnvironment } from './security/corsPolicy';
import { AppError } from './utils/AppError';

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

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Main router
app.use('/api', router);

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global Error Handler
app.use(globalErrorHandler as any);
