// PING — M-7B PHYSICAL FAILURE #4 — TEMPORARY staging-only debug endpoint.
// See utils/agentDeviceTrace.ts for the full rationale and safety
// invariants (bounded ring buffer, hashed actor ids, no raw content, staging
// only). Requires the same requireAuth as every other Agent endpoint --
// never a public unauthenticated surface -- AND independently gates on
// PING_ENVIRONMENT === 'staging', returning 404 (not 403, so it does not
// even reveal the endpoint's existence) outside staging.
//
// THIS FILE IS TEMPORARY, same removal plan as utils/agentDeviceTrace.ts.
import { Request, Response } from 'express';
import { getAgentDeviceTraceBuffer, isAgentDeviceTraceEnabled } from '../utils/agentDeviceTrace';

export async function listTraces(_req: Request, res: Response): Promise<void> {
    if (!isAgentDeviceTraceEnabled()) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.status(200).json({ traces: getAgentDeviceTraceBuffer() });
}
