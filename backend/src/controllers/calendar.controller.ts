import { Request, Response } from 'express';
import * as calendarService from '../services/calendar_sync.service';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export const getGoogleAuth = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    // We pass userId in state to verify it in callback
    const url = calendarService.getGoogleAuthUrl(userId);
    res.redirect(url);
};

export const googleCallback = async (req: Request, res: Response) => {
    const { code, state: userId } = req.query;
    if (!code || !userId) {
        return res.status(400).send('Missing code or state');
    }

    try {
        const tokens = await calendarService.getGoogleTokens(code as string);
        const { access_token, refresh_token, expires_in } = tokens;

        // Get user info to get email
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        const userInfo = await userRes.json();

        const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

        await calendarService.saveCalendarAccount(
            userId as string,
            'google',
            userInfo.email,
            access_token,
            refresh_token || null,
            expiresAt
        );

        // Redirect back to app (using custom scheme or a success page)
        res.send('<h1>✅ Ping: Google Calendar Conectado</h1><p>Puedes cerrar esta ventana y volver a la App.</p>');
    } catch (error: any) {
        console.error('[Google OAuth Callback] Error:', error);
        res.status(500).send('Error connecting Google Calendar: ' + error.message);
    }
};

export const getMsAuth = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const url = calendarService.getMsAuthUrl(userId);
    res.redirect(url);
};

export const msCallback = async (req: Request, res: Response) => {
    const { code, state: userId } = req.query;
    if (!code || !userId) {
        return res.status(400).send('Missing code or state');
    }

    try {
        const tokens = await calendarService.getMsTokens(code as string);
        const { access_token, refresh_token, expires_in } = tokens;

        // Get user info to get email
        const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        const userInfo = await userRes.json();

        const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

        await calendarService.saveCalendarAccount(
            userId as string,
            'outlook',
            userInfo.mail || userInfo.userPrincipalName,
            access_token,
            refresh_token || null,
            expiresAt
        );

        res.send('<h1>✅ Ping: Outlook Calendar Conectado</h1><p>Puedes cerrar esta ventana y volver a la App.</p>');
    } catch (error: any) {
        console.error('[MS OAuth Callback] Error:', error);
        res.status(500).send('Error connecting Outlook Calendar: ' + error.message);
    }
};

export const listAccounts = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const { data, error } = await supabaseAdmin
            .from('user_calendar_accounts')
            .select('id, provider, email, created_at')
            .eq('user_id', userId);

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateAccount = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const { is_auto_sync_enabled } = req.body;

        const { data, error } = await supabaseAdmin
            .from('user_calendar_accounts')
            .update({ is_auto_sync_enabled })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const disconnectAccount = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const { error } = await supabaseAdmin
            .from('user_calendar_accounts')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) throw error;
        res.json({ ok: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const syncCommitment = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const { commitmentId, provider } = req.body;

        if (!commitmentId || !provider) {
            return res.status(400).json({ error: 'Missing commitmentId or provider' });
        }

        // 1. Get commitment details
        const { data: commitment, error: commError } = await supabaseAdmin
            .from('commitments')
            .select('*')
            .eq('id', commitmentId)
            .eq('owner_user_id', userId)
            .single();

        if (commError || !commitment) throw new Error('Commitment not found');

        // 2. Get valid access token
        const accessToken = await calendarService.getValidAccessToken(userId, provider);

        // 3. Prepare event data
        const startDate = new Date(commitment.due_at);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

        let result;
        if (provider === 'google') {
            result = await calendarService.createGoogleEvent(accessToken, {
                summary: `Ping: ${commitment.title}`,
                description: 'Compromiso detectado automáticamente por Ping.',
                start: { dateTime: startDate.toISOString() },
                end: { dateTime: endDate.toISOString() },
            });
        } else if (provider === 'outlook') {
            result = await calendarService.createMsEvent(accessToken, {
                subject: `Ping: ${commitment.title}`,
                body: { contentType: 'HTML', content: 'Compromiso detectado automáticamente por Ping.' },
                start: { dateTime: startDate.toISOString(), timeZone: 'UTC' },
                end: { dateTime: endDate.toISOString(), timeZone: 'UTC' },
            });
        }

        // 4. Update commitment with sync info
        await supabaseAdmin
            .from('commitments')
            .update({
                meta: {
                    ...commitment.meta,
                    synced_to: provider,
                    cloud_event_id: result.id,
                }
            })
            .eq('id', commitmentId);

        res.json({ ok: true, result });
    } catch (error: any) {
        console.error('[Sync Commitment] Error:', error);
        res.status(500).json({ error: error.message });
    }
};
