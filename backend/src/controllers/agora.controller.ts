
import { Request, Response } from 'express';
import * as agoraService from '../services/agora.service';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { NotificationService } from '../services/notification.service';

export const getToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const channelName = req.params.channelName as string;
        const userId = (req as any).user?.id || '0';

        if (!channelName) {
            res.status(400).json({ error: 'Channel name is required' });
            return;
        }

        const token = agoraService.generateRtcToken(channelName, userId);
        res.status(200).json({ token, appId: process.env.AGORA_APP_ID });
    } catch (error: any) {
        console.error('[Agora Controller] Failed to get token:', error);
        res.status(500).json({ error: error.message });
    }
};

export const startRecording = async (req: Request, res: Response): Promise<void> => {
    try {
        const { channelName, conversationId } = req.body;
        const userId = (req as any).user?.id;

        if (!channelName || !conversationId) {
            res.status(400).json({ error: 'channelName and conversationId are required' });
            return;
        }

        // 1. Acquire Resource
        const recorderUid = Math.floor(Math.random() * 1000000);
        const resourceId = await agoraService.acquireResource(channelName, recorderUid);

        // 2. Generate token for recorder
        const token = agoraService.generateRtcToken(channelName, recorderUid.toString());

        // 3. Start Recording
        const sid = await agoraService.startRecording(resourceId, channelName, recorderUid, token);

        // 4. Persistence
        const { data, error } = await supabaseAdmin.from('calls').insert({
            conversation_id: conversationId,
            resource_id: resourceId,
            sid: sid,
            recorder_uid: recorderUid,
            status: 'recording',
            meta: { channelName }
        }).select().single();

        if (error) throw error;

        res.status(200).json({ ok: true, callId: data.id, sid });
    } catch (error: any) {
        console.error('[Agora Controller] startRecording failed:', error);
        res.status(500).json({ error: error.message });
    }
};

export const stopRecording = async (req: Request, res: Response): Promise<void> => {
    try {
        const { callId } = req.params;

        // 1. Fetch call info
        const { data: call, error: fetchErr } = await supabaseAdmin
            .from('calls')
            .select('*')
            .eq('id', callId)
            .single();

        if (fetchErr || !call) {
            res.status(404).json({ error: 'Call not found' });
            return;
        }

        const { channelName } = call.meta as any;

        // 2. Stop Agora Recording
        await agoraService.stopRecording(call.resource_id, call.sid, channelName, call.recorder_uid);

        // 3. Update Status
        await supabaseAdmin.from('calls').update({ status: 'stopped' }).eq('id', callId);

        res.status(200).json({ ok: true, message: 'Recording stopped and ready for processing' });

        // Trigger AI processing in background (deferred)
        // processCallRecording(callId); 

    } catch (error: any) {
        console.error('[Agora Controller] stopRecording failed:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * Notify call - called when a user starts a call.
 * Sends push notifications to other participants & saves call record.
 * Uses correct schema: conversation_participants table, profiles.expo_push_token
 */
export const notifyCall = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId, callType = 'voice' } = req.body;
        const callerId = (req as any).user?.id;

        if (!conversationId) {
            res.status(400).json({ error: 'conversationId is required' });
            return;
        }

        // 1. Get caller's profile
        const { data: callerProfile } = await supabaseAdmin
            .from('profiles')
            .select('full_name, email, avatar_url')
            .eq('id', callerId)
            .single();

        const callerName = callerProfile?.full_name || callerProfile?.email?.split('@')[0] || 'Alguien';
        const callerAvatar = callerProfile?.avatar_url || null;

        // 2. Get other participants (correct table name)
        const { data: members, error: membersError } = await supabaseAdmin
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .neq('user_id', callerId);

        if (membersError) {
            console.error('[notifyCall] Error fetching participants:', membersError);
        }

        if (!members || members.length === 0) {
            // Still log the call even if no one to notify
            await supabaseAdmin.from('calls').insert({
                conversation_id: conversationId,
                status: 'started',
                meta: { channelName: conversationId, callType, callerId }
            });
            res.status(200).json({ ok: true, notified: 0 });
            return;
        }

        const otherUserIds = members.map((m: any) => m.user_id);

        // 3. Get push tokens from profiles (correct column: expo_push_token)
        const { data: profileRows, error: profileErr } = await supabaseAdmin
            .from('profiles')
            .select('id, expo_push_token')
            .in('id', otherUserIds)
            .not('expo_push_token', 'is', null);

        if (profileErr) {
            console.error('[notifyCall] Error fetching push tokens:', profileErr);
        }

        const tokens = (profileRows || [])
            .map((p: any) => p.expo_push_token)
            .filter((t: string) => t && t.startsWith('ExponentPushToken'));

        console.log(`[notifyCall] Found ${tokens.length} valid push tokens for ${otherUserIds.length} participants`);

        // 4. Log the call
        const { data: callRecord } = await supabaseAdmin.from('calls').insert({
            conversation_id: conversationId,
            status: 'started',
            meta: { channelName: conversationId, callType, callerId }
        }).select().single();

        // 5. Send push notifications
        if (tokens.length > 0) {
            const callIcon = callType === 'video' ? '📹' : '📞';
            const messages = tokens.map((token: string) => ({
                to: token,
                title: `${callIcon} Llamada entrante`,
                body: `${callerName} te está llamando`,
                sound: 'default' as const,
                priority: 'high',
                channelId: 'calls',
                categoryId: 'incoming_call',
                data: {
                    type: 'incoming_call',
                    conversationId,
                    callType,
                    callerName,
                    callerAvatar,
                    callId: callRecord?.id,
                },
            }));

            const result = await NotificationService.sendPushNotifications(messages);
            console.log('[notifyCall] Push result:', JSON.stringify(result));
        }

        // 6. Supabase Realtime broadcast to each participant (instant signal when app is open)
        const realtimePayload = {
            type: 'incoming_call',
            conversationId,
            callType,
            callerName,
            callerAvatar,
            callId: callRecord?.id,
        };
        for (const userId of otherUserIds) {
            try {
                await supabaseAdmin.channel(`calls:user:${userId}`).send({
                    type: 'broadcast',
                    event: 'incoming_call',
                    payload: realtimePayload,
                });
            } catch (e: any) {
                console.warn(`[notifyCall] Realtime broadcast to ${userId} failed:`, e.message);
            }
        }

        res.status(200).json({ ok: true, notified: tokens.length, callId: callRecord?.id });
    } catch (error: any) {
        console.error('[Agora Controller] notifyCall failed:', error);
        res.status(500).json({ error: error.message });
    }
};

