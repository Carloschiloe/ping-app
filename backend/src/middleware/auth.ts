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
const authFailureRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
});

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
                next(new AppError('Missing or invalid Authorization header', 401));
                return;
            }

            const token = authHeader.slice('Bearer '.length).trim();
            if (!token || /\s/.test(token)) {
                next(new AppError('Missing or invalid Authorization header', 401));
                return;
            }

            const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

            if (error || !user) {
                next(new AppError('Invalid token or unauthorized', 401));
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
