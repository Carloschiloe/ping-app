import { supabaseAdmin } from '../lib/supabaseAdmin';
import axios from 'axios';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'ping_secret_encryption_key_32chars'; // Must be 32 chars
const IV_LENGTH = 16;

function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

export const saveCalendarAccount = async (userId: string, provider: string, email: string, accessToken: string, refreshToken: string | null, expiresAt: string | null) => {
    const encryptedAccess = encrypt(accessToken);
    const encryptedRefresh = refreshToken ? encrypt(refreshToken) : null;

    const { data, error } = await supabaseAdmin
        .from('user_calendar_accounts')
        .upsert({
            user_id: userId,
            provider,
            email,
            access_token: encryptedAccess,
            refresh_token: encryptedRefresh,
            expires_at: expiresAt,
        }, { onConflict: 'user_id, provider' });

    if (error) throw error;
    return data;
};

export const getValidAccessToken = async (userId: string, provider: string): Promise<string> => {
    const { data: account, error } = await supabaseAdmin
        .from('user_calendar_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', provider)
        .single();

    if (error || !account) throw new Error(`No ${provider} account found for user`);

    const now = new Date();
    const expiresAt = account.expires_at ? new Date(account.expires_at) : null;

    // If token is expired or expires in less than 5 minutes, refresh it
    if (expiresAt && expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
        if (!account.refresh_token) throw new Error(`Refresh token missing for ${provider}`);

        const decryptedRefresh = decrypt(account.refresh_token);
        const newTokens = await refreshTokens(provider, decryptedRefresh);

        const encryptedAccess = encrypt(newTokens.access_token);
        const encryptedRefresh = newTokens.refresh_token ? encrypt(newTokens.refresh_token) : account.refresh_token;
        const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();

        await supabaseAdmin
            .from('user_calendar_accounts')
            .update({
                access_token: encryptedAccess,
                refresh_token: encryptedRefresh,
                expires_at: newExpiresAt,
            })
            .eq('id', account.id);

        return newTokens.access_token;
    }

    return decrypt(account.access_token);
};

const refreshTokens = async (provider: string, refreshToken: string) => {
    if (provider === 'google') {
        const response = await axios.post('https://oauth2.googleapis.com/token', {
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        });
        return response.data;
    } else if (provider === 'outlook') {
        const response = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', new URLSearchParams({
            client_id: process.env.MS_CLIENT_ID!,
            client_secret: process.env.MS_CLIENT_SECRET!,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
            scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
        }).toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return response.data;
    }
    throw new Error('Unsupported provider');
};

// Google Specific Logic
export const getGoogleAuthUrl = (state: string) => {
    const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    const options = {
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        access_type: 'offline',
        response_type: 'code',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/calendar.events',
        ].join(' '),
        state,
    };
    const qs = new URLSearchParams(options);
    return `${rootUrl}?${qs.toString()}`;
};

export const getGoogleTokens = async (code: string) => {
    const url = 'https://oauth2.googleapis.com/token';
    const values = {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code',
    };
    const response = await axios.post(url, values);
    return response.data;
};

// Microsoft Specific Logic (Outlook)
export const getMsAuthUrl = (state: string) => {
    const rootUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
    const options = {
        client_id: process.env.MS_CLIENT_ID!,
        response_type: 'code',
        redirect_uri: process.env.MS_REDIRECT_URI!,
        response_mode: 'query',
        scope: 'https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/User.Read offline_access',
        state,
    };
    const qs = new URLSearchParams(options);
    return `${rootUrl}?${qs.toString()}`;
};

export const getMsTokens = async (code: string) => {
    const url = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    const params = new URLSearchParams({
        client_id: process.env.MS_CLIENT_ID!,
        client_secret: process.env.MS_CLIENT_SECRET!,
        code,
        redirect_uri: process.env.MS_REDIRECT_URI!,
        grant_type: 'authorization_code',
    });
    const response = await axios.post(url, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data;
};

// Calendar Actions
export const createGoogleEvent = async (accessToken: string, event: any) => {
    const response = await axios.post('https://www.googleapis.com/calendar/v3/calendars/primary/events', event, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
};

export const createMsEvent = async (accessToken: string, event: any) => {
    const response = await axios.post('https://graph.microsoft.com/v1.0/me/events', event, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
};

export const checkConflictsGoogle = async (accessToken: string, startIso: string, endIso: string) => {
    const response = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
            timeMin: startIso,
            timeMax: endIso,
            singleEvents: true,
        }
    });
    return response.data.items && response.data.items.length > 0;
};

export const checkConflictsMs = async (accessToken: string, startIso: string, endIso: string) => {
    const response = await axios.get('https://graph.microsoft.com/v1.0/me/calendarview', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
            startDateTime: startIso,
            endDateTime: endIso,
        }
    });
    return response.data.value && response.data.value.length > 0;
};

export const syncCommitmentToCloud = async (userId: string, commitment: any) => {
    try {
        // 1. Find connected accounts with auto-sync enabled
        const { data: accounts, error } = await supabaseAdmin
            .from('user_calendar_accounts')
            .select('*')
            .eq('user_id', userId)
            .eq('is_auto_sync_enabled', true);

        if (error || !accounts || accounts.length === 0) return null;

        const results = [];
        for (const account of accounts) {
            const provider = account.provider;
            const accessToken = await getValidAccessToken(userId, provider);

            const startDate = new Date(commitment.due_at);
            const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
            const startIso = startDate.toISOString();
            const endIso = endDate.toISOString();

            // 2. Check Conflicts
            let hasConflict = false;
            if (provider === 'google') {
                hasConflict = await checkConflictsGoogle(accessToken, startIso, endIso);
            } else if (provider === 'outlook') {
                hasConflict = await checkConflictsMs(accessToken, startIso, endIso);
            }

            // 3. Create Event with Rich Description
            const assigneeText = commitment.assigned_to_user_id ? `\nAsignado a: (ID ${commitment.assigned_to_user_id})` : '';
            const description = `Ping: Compromiso detectado automáticamente.${assigneeText}\n\nDetalles: ${commitment.title}\nAcordado el: ${new Date(commitment.created_at || Date.now()).toLocaleString('es-CL')}\n\nPing - El chat que recuerda. 🕵️‍♂️📝`;

            let result;
            let eventUrl = '';

            if (provider === 'google') {
                result = await createGoogleEvent(accessToken, {
                    summary: `Ping: ${commitment.title}`,
                    description,
                    start: { dateTime: startIso },
                    end: { dateTime: endIso },
                });
                eventUrl = result.htmlLink;
            } else if (provider === 'outlook') {
                result = await createMsEvent(accessToken, {
                    subject: `Ping: ${commitment.title}`,
                    body: { contentType: 'HTML', content: description.replace(/\n/g, '<br/>') },
                    start: { dateTime: startIso, timeZone: 'UTC' },
                    end: { dateTime: endIso, timeZone: 'UTC' },
                });
                eventUrl = result.webLink;
            }

            // 4. Update commitment meta
            await supabaseAdmin
                .from('commitments')
                .update({
                    meta: {
                        ...commitment.meta,
                        synced_to: provider,
                        cloud_event_id: result.id,
                        external_event_url: eventUrl,
                        conflict_detected: hasConflict,
                        sync_status: 'synced',
                        last_sync_at: new Date().toISOString()
                    }
                })
                .eq('id', commitment.id);

            results.push({ provider, hasConflict, eventUrl });
        }
        return results;
    } catch (err) {
        console.error('[Autonomous Sync] Error:', err);
        throw err;
    }
};

export const deleteCloudEvent = async (userId: string, provider: string, eventId: string) => {
    try {
        const accessToken = await getValidAccessToken(userId, provider);

        if (provider === 'google') {
            await axios.delete(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
        } else if (provider === 'outlook') {
            await axios.delete(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
        }
        return true;
    } catch (err) {
        console.error(`[Cloud Sync] Error deleting event ${eventId} on ${provider}:`, err);
        // We don't throw because if the event was already deleted externally, it's fine.
        return false;
    }
};

export const updateCloudEventStatus = async (userId: string, provider: string, eventId: string, currentTitle: string, isCompleted: boolean) => {
    try {
        const accessToken = await getValidAccessToken(userId, provider);
        const prefix = '[COMPLETADA] ';
        let newTitle = currentTitle;

        if (isCompleted && !currentTitle.startsWith(prefix)) {
            newTitle = prefix + currentTitle;
        } else if (!isCompleted && currentTitle.startsWith(prefix)) {
            newTitle = currentTitle.replace(prefix, '');
        }

        if (provider === 'google') {
            await axios.patch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
                summary: newTitle,
                transparency: isCompleted ? 'transparent' : 'opaque' // free/busy
            }, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
        } else if (provider === 'outlook') {
            await axios.patch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
                subject: newTitle,
                showAs: isCompleted ? 'free' : 'busy'
            }, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
        }
        return true;
    } catch (err) {
        console.error(`[Cloud Sync] Error updating event status ${eventId} on ${provider}:`, err);
        return false;
    }
};
