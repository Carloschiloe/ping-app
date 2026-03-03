import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';

// Extend Express Request interface to include user
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email?: string;
            };
        }
    }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        let token = '';
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.replace('Bearer ', '');
        } else if (req.query.token) {
            token = req.query.token as string;
        }

        if (!token) {
            res.status(401).json({ error: 'Missing or invalid Authorization header or token' });
            return;
        }

        // We use the Supabase Admin client to get the user from the token
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            res.status(401).json({ error: 'Invalid token or unauthorized' });
            return;
        }

        // Attach user to request object
        req.user = {
            id: user.id,
            email: user.email,
        };

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: 'Internal server error during authentication' });
    }
};
