import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { createRateLimitStore } from './rateLimitStore';

/**
 * Per-endpoint budget for authenticated Agent requests. The caller creates
 * one middleware instance per route so unrelated Agent surfaces do not share
 * a user's bucket.
 */
export function createAgentRateLimiter(scope = 'agent', max = 20) {
    return rateLimit({
        windowMs: 5 * 60 * 1000,
        max,
        store: createRateLimitStore(`agent:${scope}`),
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip ?? 'unknown'),
    });
}
