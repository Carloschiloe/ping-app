import { listExpiredMessageAttachments } from '../services/attachmentApplication.service';

function parseLimit(value: string | undefined): number {
    if (value === undefined) return 100;

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error('The optional limit must be a positive integer.');
    }

    return Math.min(parsed, 1000);
}

async function main(): Promise<void> {
    const limit = parseLimit(process.argv[2]);
    const candidates = await listExpiredMessageAttachments(limit);

    console.log(JSON.stringify({
        mode: 'audit-only',
        count: candidates.length,
        candidates: candidates.map((candidate: any) => ({
            id: candidate.id,
            bucket: candidate.bucket,
            objectPath: candidate.object_path,
            lifecycleStatus: candidate.lifecycle_status,
            expiresAt: candidate.expires_at,
        })),
    }, null, 2));
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown attachment audit failure';
    console.error(`[AttachmentAudit] ${message}`);
    process.exitCode = 1;
});
