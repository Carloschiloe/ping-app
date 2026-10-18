import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';

export const validateRequest = (schema: ZodTypeAny) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsed = await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });

            // Keep defaults/coercions/normalization produced by Zod. Without
            // assigning the parsed value, controllers still receive the raw
            // request and may crash or bypass schema normalization.
            if (parsed && typeof parsed === 'object') {
                const normalized = parsed as {
                    body?: unknown;
                    query?: unknown;
                    params?: unknown;
                };
                if ('body' in normalized) req.body = normalized.body;
                if ('query' in normalized) req.query = normalized.query as Request['query'];
                if ('params' in normalized) req.params = normalized.params as Request['params'];
            }
            return next();
        } catch (error) {
            return next(error);
        }
    };
};
