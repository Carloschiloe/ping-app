import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { ZodError } from 'zod';

export const globalErrorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('🔥 [ERROR]', err);

    if (err instanceof ZodError) {
        return res.status(400).json({
            status: 'error',
            message: 'Validation failed',
            errors: (err as any).errors
        });
    }

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            status: 'error',
            message: err.message
        });
    }

    // Fallback for unhandled errors
    return res.status(500).json({
        status: 'error',
        message: err.message || 'Internal Server Error'
    });
};
