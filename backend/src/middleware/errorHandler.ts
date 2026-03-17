import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { ZodError } from 'zod';

export const globalErrorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
    const requestId = (req as any).requestId;
    console.error('🔥 [ERROR]', requestId ? `[${requestId}]` : '', err);

    if (err instanceof ZodError) {
        return res.status(400).json({
            status: 'error',
            message: 'Validation failed',
            requestId,
            errors: err.issues,
        });
    }

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            status: 'error',
            message: err.message,
            requestId,
        });
    }

    return res.status(500).json({
        status: 'error',
        message: 'Internal Server Error',
        requestId,
    });
};
