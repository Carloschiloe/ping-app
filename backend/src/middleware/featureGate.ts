import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';

type PrivateFileFeature =
    | 'ENABLE_PRIVATE_FILE_READS'
    | 'ENABLE_PRIVATE_FILE_UPLOADS'
    | 'ENABLE_PRIVATE_AVATAR_UPLOADS'
    | 'ENABLE_PRIVATE_MESSAGE_UPLOADS';

export type LegacySatelliteCapability =
    | 'ENABLE_CALLS'
    | 'ENABLE_OPERATION_MODULE'
    | 'ENABLE_CALENDAR_INTEGRATION';

const LEGACY_SATELLITE_WRITER_FLAG = 'ENABLE_LEGACY_SATELLITE_WRITERS';

/**
 * Runtime containment for the temporarily allowlisted non-canonical writers.
 *
 * Route gates protect public entry points, but these writers can also be
 * reached by workers or internal service calls. Keep the second gate explicit
 * and fail closed unless both the capability and the legacy exception are
 * enabled together with the non-MVP master flag.
 */
export function isLegacySatelliteWriterEnabled(capability: LegacySatelliteCapability): boolean {
    return process.env.ENABLE_NON_MVP_CAPABILITIES === 'true'
        && process.env[capability] === 'true'
        && process.env[LEGACY_SATELLITE_WRITER_FLAG] === 'true';
}

export function assertLegacySatelliteWriterEnabled(
    capability: LegacySatelliteCapability,
    writerName: string,
): void {
    if (isLegacySatelliteWriterEnabled(capability)) return;

    throw new AppError(
        `${writerName} legacy satellite writer is disabled`,
        503,
    );
}

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
