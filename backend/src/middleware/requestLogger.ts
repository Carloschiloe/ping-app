import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on('finish', () => {
        const durationMs = Date.now() - start;
        const requestId = (req as any).requestId || '-';
        const path = req.originalUrl || req.url;

        console.info(`[request] ${requestId} ${req.method} ${path} ${res.statusCode} ${durationMs}ms`);
    });

    next();
}
