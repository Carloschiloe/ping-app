import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getSharedProfileIds } from '../utils/authz';
import { normalizeFullNameInput, normalizePhoneInput } from '../utils/profileValidation';
import { createContactProof } from '../utils/contactDiscovery';

// GET /users?q=email — search users by email (excludes self)
export const search = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const query = (req.query.q as string) || '';

        const searchTerm = query.trim();
        if (searchTerm.length < 2) {
            res.json({ users: [] });
            return;
        }
        if (searchTerm.length > 100 || !/^[\p{L}\p{N}\s@._+\-]+$/u.test(searchTerm)) {
            res.status(400).json({ error: 'Search query contains unsupported characters' });
            return;
        }

        const sharedProfileIds = await getSharedProfileIds(userId);
        if (sharedProfileIds.length === 0) {
            res.json({ users: [] });
            return;
        }

        const { data, error } = await supabaseAdmin
            .from('profiles')
            .select('id, email, full_name, avatar_url')
            .in('id', sharedProfileIds)
            .ilike('email', `%${searchTerm}%`)
            .limit(20);

        if (error) throw error;
        res.json({ users: data || [] });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// POST /users/sync-contacts — find which phone numbers from device are registered in Ping
export const syncContacts = async (req: Request, res: Response): Promise<void> => {
    try {
        const requesterUserId = req.user!.id;
        const phones = Array.from(new Set(
            (req.body.phones as string[])
                .map((phone) => normalizePhoneInput(phone))
                .filter((phone): phone is string => !!phone)
        ));
        const emails = Array.from(new Set(
            (req.body.emails as string[])
                .map((email) => email.trim().toLowerCase())
        ));

        const [phoneResult, emailResult] = await Promise.all([
            phones.length > 0
                ? supabaseAdmin
                    .from('profiles')
                    .select('id, full_name, avatar_url, phone, email')
                    .in('phone', phones)
                    .neq('id', requesterUserId)
                    .limit(500)
                : Promise.resolve({ data: [], error: null }),
            emails.length > 0
                ? supabaseAdmin
                    .from('profiles')
                    .select('id, full_name, avatar_url, phone, email')
                    .in('email', emails)
                    .neq('id', requesterUserId)
                    .limit(500)
                : Promise.resolve({ data: [], error: null }),
        ]);

        if (phoneResult.error) throw phoneResult.error;
        if (emailResult.error) throw emailResult.error;

        const profiles = new Map<string, any>();
        for (const profile of [...(phoneResult.data || []), ...(emailResult.data || [])]) {
            profiles.set(profile.id, profile);
        }
        const users = Array.from(profiles.values()).map((profile) => ({
            id: profile.id,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
            phone: profile.phone,
            email: profile.email,
            contactProof: createContactProof(requesterUserId, profile.id).proof,
        }));
        res.json({ users });
    } catch (error: any) {
        const status = typeof error?.statusCode === 'number' ? error.statusCode : 500;
        res.status(status).json({
            error: status === 500 ? 'No se pudieron comparar tus contactos' : error.message,
        });
    }
};

// PATCH /api/user/profile — update full_name or avatar_url
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { full_name, avatar_url, phone } = req.body as {
            full_name?: unknown;
            avatar_url?: string;
            phone?: unknown;
        };
        const updates: Record<string, unknown> = {};

        if (full_name !== undefined) updates.full_name = normalizeFullNameInput(full_name);
        if (avatar_url !== undefined) updates.avatar_url = avatar_url;
        if (phone !== undefined) updates.phone = normalizePhoneInput(phone);

        if (Object.keys(updates).length === 0) {
            res.status(400).json({ error: 'No hay cambios de perfil para guardar' });
            return;
        }

        const { data, error } = await supabaseAdmin
            .from('profiles')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;
        res.json({ user: data });
    } catch (error: any) {
        const status = typeof error?.statusCode === 'number' ? error.statusCode : 500;
        if (status === 500) {
            console.error('[UserProfile] update failed', {
                code: typeof error?.code === 'string' ? error.code : null,
                name: error?.name || 'UnknownError',
            });
        }
        res.status(status).json({
            error: status === 500 ? 'No se pudo actualizar el perfil' : error.message,
        });
    }
};
