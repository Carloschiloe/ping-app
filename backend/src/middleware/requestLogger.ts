import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on('finish', () => {
        const durationMs = Date.now() - start;
        const requestId = (req as any).requestId || '-';
        // Never log query strings: searches, OAuth callbacks and other URLs
        // may contain personal data, authorization codes or signed state.
        const path = req.path;

        console.info(`[request] ${requestId} ${req.method} ${path} ${res.statusCode} ${durationMs}ms`);
    });

    next();
}
