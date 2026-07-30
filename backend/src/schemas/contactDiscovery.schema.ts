import { z } from 'zod';

const internationalPhone = z.string().trim().regex(/^\+[1-9]\d{7,14}$/);

export const syncContactsSchema = z.object({
    body: z.object({
        phones: z.array(internationalPhone).max(500).default([]),
        emails: z.array(z.string().trim().email().max(254)).max(500).default([]),
    }).refine(
        ({ phones, emails }) => phones.length > 0 || emails.length > 0,
        { message: 'At least one contact identifier is required' }
    ),
});

export const createFromContactSchema = z.object({
    body: z.object({
        proof: z.string().trim().min(20).max(1000),
    }),
});
