import 'dotenv/config';
import { cleanupExpiredMessageAttachments } from '../services/attachmentApplication.service';

const configuredLimit = Number.parseInt(process.env.EXPIRED_ATTACHMENT_CLEANUP_LIMIT || '100', 10);
const limit = Number.isFinite(configuredLimit) ? Math.max(1, Math.min(configuredLimit, 1000)) : 100;

async function main() {
    const result = await cleanupExpiredMessageAttachments(limit);
    console.log(JSON.stringify({
        job: 'expired-message-attachment-cleanup',
        ...result,
    }));
    if (result.failed > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error('[AttachmentCleanup] job failed', {
        errorType: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
});
