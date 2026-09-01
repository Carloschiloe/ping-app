import { NextFunction, Request, Response } from 'express';
import {
    completeMessageAttachment,
    createMessageAttachmentReadUrl,
    createMessageAttachmentUploadIntent,
} from '../services/attachmentApplication.service';
import { AppError } from '../utils/AppError';

function actor(req: Request): string {
    if (!req.user) throw new AppError('Unauthorized', 401);
    return req.user.id;
}

export async function createUploadIntent(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await createMessageAttachmentUploadIntent({
            actorUserId: actor(req),
            conversationId: req.body.conversationId,
            mimeType: req.body.mimeType,
            originalFilename: req.body.originalFilename,
            clientUploadId: req.body.clientUploadId,
            durationMs: req.body.durationMs,
            metadata: req.body.metadata,
        });
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
}

export async function completeUpload(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await completeMessageAttachment(actor(req), req.params.id as string);
        res.json(result);
    } catch (error) {
        next(error);
    }
}

export async function createReadUrl(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await createMessageAttachmentReadUrl(actor(req), req.params.id as string);
        res.json(result);
    } catch (error) {
        next(error);
    }
}
