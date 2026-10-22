import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { ZodError } from 'zod';
import { redactSensitiveText, safeErrorLog } from '../utils/safeError';

export const globalErrorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
    const requestId = (req as any).requestId;
    console.error('🔥 [ERROR]', requestId ? `[${requestId}]` : '', safeErrorLog(err));

    if (err instanceof ZodError) {
        return res.status(400).json({
            status: 'error',
            message: 'Validation failed',
            requestId,
            // Zod v4 issues may carry the rejected input. Keep only the
            // contract needed by clients; request bodies must never echo back.
            errors: err.issues.map(({ code, path, message }) => ({ code, path, message })),
        });
    }

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            status: 'error',
            message: err.statusCode < 500 ? redactSensitiveText(err.message, 300) : 'Internal Server Error',
            requestId,
        });
    }

    return res.status(500).json({
        status: 'error',
        message: 'Internal Server Error',
        requestId,
    });
};
