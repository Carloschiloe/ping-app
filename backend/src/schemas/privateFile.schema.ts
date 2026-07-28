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
