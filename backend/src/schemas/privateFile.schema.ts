import { z } from 'zod';
import {
    privateFileResourceTypes,
    privateFileUploadPurposes,
} from '../services/privateFile.service';

const id = z.string().uuid();

export const createPrivateFileReadUrlSchema = z.object({
    body: z.object({
        resourceType: z.enum(privateFileResourceTypes),
        resourceId: id,
    }),
});

export const createPrivateFileUploadUrlSchema = z.object({
    body: z.object({
        purpose: z.enum(privateFileUploadPurposes),
        ownerResourceId: id,
        mimeType: z.string().min(1).max(100),
    }),
});

export const createProfileAvatarUploadUrlSchema = z.object({
    body: z.object({
        mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    }),
});

export const completeProfileAvatarSchema = z.object({
    body: z.object({
        bucket: z.literal('chat-media'),
        objectPath: z.string().min(1).max(500),
    }),
});

export const createMessageAttachmentUploadUrlSchema = z.object({
    body: z.object({
        conversationId: id,
        mimeType: z.string().min(1).max(100),
    }),
});
