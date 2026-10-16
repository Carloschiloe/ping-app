import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';

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
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            next(new AppError('Missing or invalid Authorization header', 401));
            return;
        }

        const token = authHeader.replace('Bearer ', '').trim();

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
        console.error('Auth middleware error:', error);
        next(new AppError('Internal server error during authentication', 500));
    }
};
