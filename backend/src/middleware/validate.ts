import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';

/**
 * Express 5 exposes req.query through a getter. Assigning to it throws in
 * production, which used to turn otherwise valid validated requests into a
 * 500 (notably shared-content and voice transcription). Keep the normalized
 * Zod value available to controllers while remaining compatible with both
 * Express 4 and Express 5 request descriptors.
 */
function replaceRequestProperty<T extends keyof Request>(
    req: Request,
    property: T,
    value: Request[T],
): void {
    try {
        Object.defineProperty(req, property, {
            configurable: true,
            enumerable: true,
            writable: true,
            value,
        });
    } catch {
        // Some test doubles expose plain writable fields but do not allow
        // defineProperty. The fallback is safe for those objects and keeps
        // the middleware useful outside the Express runtime.
        (req as any)[property] = value;
    }
}

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
                if ('body' in normalized) replaceRequestProperty(req, 'body', normalized.body as Request['body']);
                if ('query' in normalized) replaceRequestProperty(req, 'query', normalized.query as Request['query']);
                if ('params' in normalized) replaceRequestProperty(req, 'params', normalized.params as Request['params']);
            }
            return next();
        } catch (error) {
            return next(error);
        }
    };
};
