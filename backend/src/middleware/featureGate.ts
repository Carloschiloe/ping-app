import { NextFunction, Request, Response } from 'express';

type PrivateFileFeature =
    | 'ENABLE_PRIVATE_FILE_READS'
    | 'ENABLE_PRIVATE_FILE_UPLOADS'
    | 'ENABLE_PRIVATE_AVATAR_UPLOADS'
    | 'ENABLE_PRIVATE_MESSAGE_UPLOADS';

function createFeatureGate(envName: string, requiresNonMvpMaster: boolean) {
    return (_req: Request, res: Response, next: NextFunction) => {
        const masterGateEnabled = process.env.ENABLE_NON_MVP_CAPABILITIES === 'true';
        const capabilityEnabled = process.env[envName] === 'true';

        if (capabilityEnabled && (!requiresNonMvpMaster || masterGateEnabled)) {
            next();
            return;
        }

        res.status(503).json({
            error: 'This capability is temporarily disabled while Ping completes its security review',
        });
    };
}

// Calendar, Calls and Operation remain protected by both the master
// containment gate and their individual capability gate.
export function requireFeature(envName: string) {
    return createFeatureGate(envName, true);
}

// Private file reads and uploads are independently controlled. Keeping the
// accepted names closed prevents this exception from being reused by an
// unrelated non-MVP capability.
export function requirePrivateFileFeature(envName: PrivateFileFeature) {
    return createFeatureGate(envName, false);
}
