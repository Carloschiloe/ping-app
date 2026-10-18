import { Request, Response } from 'express';
import * as calendarService from '../services/calendar_sync.service';
import { syncCommitmentToProvider as syncCommitmentToProviderThroughCore } from '../services/commitmentApplication.service';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { createOAuthState, verifyOAuthState } from '../utils/oauthState';

// The mobile client requests the provider URL through an authenticated
// API call. The JWT never travels in a browser URL or OAuth redirect.
export const getGoogleAuthLink = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    res.json({ url: calendarService.getGoogleAuthUrl(createOAuthState(userId)) });
};

export const getGoogleAuth = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const url = calendarService.getGoogleAuthUrl(createOAuthState(userId));
    res.redirect(url);
};

export const googleCallback = async (req: Request, res: Response) => {
    const { code, state } = req.query;
    if (!code || typeof state !== 'string') {
        return res.status(400).send('Missing code or state');
    }

    try {
        const { userId } = verifyOAuthState(state);
        const tokens = await calendarService.getGoogleTokens(code as string);
        const { access_token, refresh_token, expires_in } = tokens;

        // Get user info to get email
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        const userInfo = await userRes.json();

        const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

        await calendarService.saveCalendarAccount(
            userId,
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

export const getMsAuthLink = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    res.json({ url: calendarService.getMsAuthUrl(createOAuthState(userId)) });
};

export const getMsAuth = async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const url = calendarService.getMsAuthUrl(createOAuthState(userId));
    res.redirect(url);
};

export const msCallback = async (req: Request, res: Response) => {
    const { code, state } = req.query;
    if (!code || typeof state !== 'string') {
        return res.status(400).send('Missing code or state');
    }

    try {
        const { userId } = verifyOAuthState(state);
        const tokens = await calendarService.getMsTokens(code as string);
        const { access_token, refresh_token, expires_in } = tokens;

        // Get user info to get email
        const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        const userInfo = await userRes.json();

        const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

        await calendarService.saveCalendarAccount(
            userId,
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
            .select('id, provider, email, created_at, is_auto_sync_enabled')
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

        const result = await syncCommitmentToProviderThroughCore(userId, commitmentId, provider);
        res.json(result);
    } catch (error: any) {
        console.error('[Sync Commitment] Error:', error);
        res.status(error?.statusCode || 500).json({ error: error.message });
    }
};
