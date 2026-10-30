import { Request, Response, NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { safeErrorLog } from '../utils/safeError';

// Failed authentication is deliberately limited by source IP. Successful
// requests are removed from the window, so normal authenticated traffic does
// not consume this budget. This is a defense against token spraying and
// repeated malformed Authorization headers, not a replacement for Supabase
// Auth's own abuse controls.
//
// "Failed" means this middleware rejected the credentials. The response
// status is not enough: an authenticated request that a later handler or
// limiter answers with 4xx (validation, 409, a route's own 429) must not count
// as an auth failure, or a burst of them locks the user out of every
// authenticated endpoint.
const AUTH_FAILED = 'authFailed';

const authFailureRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => res.locals[AUTH_FAILED] !== true,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
});

function rejectAuthentication(res: Response, next: NextFunction, message: string): void {
    res.locals[AUTH_FAILED] = true;
    next(new AppError(message, 401));
}

// Extend Express Request interface to include user
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email?: string;
            };
            requestId?: string;
        }
    }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    authFailureRateLimiter(req, res, async (rateLimitError?: unknown) => {
        if (rateLimitError) {
            next(rateLimitError);
            return;
        }

        try {
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                rejectAuthentication(res, next, 'Missing or invalid Authorization header');
                return;
            }

            const token = authHeader.slice('Bearer '.length).trim();
            if (!token || /\s/.test(token)) {
                rejectAuthentication(res, next, 'Missing or invalid Authorization header');
                return;
            }

            const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

            if (error || !user) {
                rejectAuthentication(res, next, 'Invalid token or unauthorized');
                return;
            }

            req.user = {
                id: user.id,
                email: user.email,
            };

            next();
        } catch (error) {
            console.error('Auth middleware error:', safeErrorLog(error));
            next(new AppError('Internal server error during authentication', 500));
        }
    });
};
