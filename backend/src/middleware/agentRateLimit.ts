import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Per-endpoint budget for authenticated Agent requests. The caller creates
 * one middleware instance per route so unrelated Agent surfaces do not share
 * a user's bucket.
 */
export function createAgentRateLimiter() {
    return rateLimit({
        windowMs: 5 * 60 * 1000,
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip ?? 'unknown'),
    });
}
