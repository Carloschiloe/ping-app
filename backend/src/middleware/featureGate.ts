import { NextFunction, Request, Response } from 'express';

export function requireFeature(envName: string) {
    return (_req: Request, res: Response, next: NextFunction) => {
        const masterGateEnabled = process.env.ENABLE_NON_MVP_CAPABILITIES === 'true';
        const capabilityEnabled = process.env[envName] === 'true';

        if (masterGateEnabled && capabilityEnabled) {
            next();
            return;
        }

        res.status(503).json({
            error: 'This capability is temporarily disabled while Ping completes its security review',
        });
    };
}
