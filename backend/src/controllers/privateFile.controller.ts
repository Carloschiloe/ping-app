import { NextFunction, Request, Response } from 'express';
import {
    completePrivateProfileAvatar,
    createPrivateFileReadUrl,
    createPrivateFileUploadUrl,
} from '../services/privateFile.service';
import { AppError } from '../utils/AppError';

export async function createReadUrl(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user) throw new AppError('Unauthorized', 401);
        const result = await createPrivateFileReadUrl(
            req.user.id,
            req.body.resourceType,
            req.body.resourceId
        );
        res.json(result);
    } catch (error) {
        next(error);
    }
}

export async function createUploadUrl(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user) throw new AppError('Unauthorized', 401);
        const result = await createPrivateFileUploadUrl(
            req.user.id,
            req.body.purpose,
            req.body.ownerResourceId,
            req.body.mimeType
        );
        res.json(result);
    } catch (error) {
        next(error);
    }
}

export async function createProfileAvatarUploadUrl(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user) throw new AppError('Unauthorized', 401);
        const result = await createPrivateFileUploadUrl(
            req.user.id,
            'profile_avatar',
            req.user.id,
            req.body.mimeType
        );
        res.json(result);
    } catch (error) {
        next(error);
    }
}

export async function completeProfileAvatar(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user) throw new AppError('Unauthorized', 401);
        const result = await completePrivateProfileAvatar(
            req.user.id,
            req.body.bucket,
            req.body.objectPath
        );
        res.json(result);
    } catch (error) {
        next(error);
    }
}

export async function createMessageAttachmentUploadUrl(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user) throw new AppError('Unauthorized', 401);
        const result = await createPrivateFileUploadUrl(
            req.user.id,
            'message_attachment',
            req.body.conversationId,
            req.body.mimeType
        );
        res.json(result);
    } catch (error) {
        next(error);
    }
}
