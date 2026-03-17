
import { Request, Response } from 'express';
import * as agoraService from '../services/agora.service';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { NotificationService } from '../services/notification.service';
import { processCallRecording } from '../services/ai.service';
import { AppError } from '../utils/AppError';
import { assertCallConversationParticipant, assertConversationParticipant } from '../utils/authz';

export const getToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const channelName = req.params.channelName as string;
        const userId = req.user!.id;

        if (!channelName) {
            res.status(400).json({ error: 'Channel name is required' });
            return;
        }

        await assertConversationParticipant(userId, channelName);

        const token = agoraService.generateRtcToken(channelName, userId);
        res.status(200).json({ token, appId: process.env.AGORA_APP_ID });
    } catch (error: any) {
        console.error('[Agora Controller] Failed to get token:', error);
        res.status(500).json({ error: error.message });
    }
};

export const startRecording = async (req: Request, res: Response): Promise<void> => {
    try {
        const { channelName, conversationId, callId } = req.body;
        const userId = req.user!.id;

        if (!channelName || !conversationId) {
            res.status(400).json({ error: 'channelName and conversationId are required' });
            return;
        }

        if (channelName !== conversationId) {
            throw new AppError('channelName must match conversationId', 400);
        }

        await assertConversationParticipant(userId, conversationId);

        // 1. Acquire Resource
        const recorderUid = Math.floor(Math.random() * 1000000);
        const resourceId = await agoraService.acquireResource(channelName, recorderUid);

        // 2. Generate token for recorder
        const token = agoraService.generateRtcToken(channelName, recorderUid.toString());

        // 3. Start Recording
        const sid = await agoraService.startRecording(resourceId, channelName, recorderUid, token);

        // 4. Persistence - Update existing call record if callId provided, otherwise insert
        let finalCallId = callId;
        if (callId) {
            await supabaseAdmin.from('calls').update({
                resource_id: resourceId,
                sid: sid,
                recorder_uid: recorderUid,
                status: 'recording',
            }).eq('id', callId);
        } else {
            const { data, error } = await supabaseAdmin.from('calls').insert({
                conversation_id: conversationId,
                resource_id: resourceId,
                sid: sid,
                recorder_uid: recorderUid,
                status: 'recording',
                meta: { channelName }
            }).select().single();
            if (error) throw error;
            finalCallId = data.id;
        }

        res.status(200).json({ ok: true, callId: finalCallId, sid });
    } catch (error: any) {
        console.error('[Agora Controller] startRecording failed:', error);
        res.status(500).json({ error: error.message });
    }
};

export const stopRecording = async (req: Request, res: Response): Promise<void> => {
    try {
        const callId = req.params.callId as string;
        const userId = req.user!.id;

        await assertCallConversationParticipant(userId, callId);

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

        const { channelName } = (call.meta as any) || {};

        // 2. Stop Agora Recording - Defensive check: Only stop if it actually started
        if (call.resource_id && call.sid && call.recorder_uid && channelName) {
            try {
                await agoraService.stopRecording(call.resource_id, call.sid, channelName, call.recorder_uid);
            } catch (agoraErr: any) {
                console.warn('[Agora Controller] stopRecording Agora API warning:', agoraErr.message);
                // We keep going to update the database state even if the Agora call fails
                // (e.g. if the recording already stopped automatically)
            }
        } else {
            console.log('[Agora Controller] stopRecording skipped: Missing recording metadata (likely never started)');
        }

        // 3. Update Status
        await supabaseAdmin.from('calls').update({ status: 'stopped' }).eq('id', callId);

        res.status(200).json({ ok: true, message: 'Recording stopped and ready for processing' });

        // Trigger AI processing in background (deferred)
        processCallRecording(callId as string); 

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
        const callerId = req.user!.id;

        if (!conversationId) {
            res.status(400).json({ error: 'conversationId is required' });
            return;
        }

        await assertConversationParticipant(callerId, conversationId);

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

export const renderCallPage = (req: Request, res: Response): void => {
    const { token, appId, channel, video } = req.query as Record<string, string>;
    const withVideo = video === 'true';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<title>Ping Call</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0f172a; width:100vw; height:100vh; overflow:hidden; font-family:-apple-system,sans-serif; }
  #remote-video { position:fixed; top:0; left:0; width:100%; height:100%; background:#1e293b; display:flex; align-items:center; justify-content:center; }
  #remote-video video { width:100%; height:100%; object-fit:cover; }
  #local-video  { position:fixed; top:60px; right:16px; width:110px; height:165px; border-radius:14px; overflow:hidden; border:2px solid rgba(255,255,255,0.2); background:#000; z-index:10; display:${withVideo ? 'block' : 'none'}; }
  #local-video video { width:100%; height:100%; object-fit:cover; }
  #status { color:white; font-size:18px; font-weight:600; text-align:center; }
</style>
</head>
<body>
<div id="remote-video"><div id="status">Conectando...</div></div>
<div id="local-video"></div>
<script src="https://download.agora.io/sdk/release/AgoraRTC_N-4.20.2.js"></script>
<script>
const APP_ID  = "${appId || ''}";
const TOKEN   = "${token || ''}";
const CHANNEL = "${channel || ''}";
const WITH_VIDEO = ${withVideo};

const client = AgoraRTC.createClient({ mode:"rtc", codec:"vp8" });
let localAudioTrack=null, localVideoTrack=null;

async function joinCall() {
  try {
    await client.join(APP_ID, CHANNEL, TOKEN, null);
    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    const tracks = [localAudioTrack];
    if(WITH_VIDEO){
      localVideoTrack = await AgoraRTC.createCameraVideoTrack();
      tracks.push(localVideoTrack);
      localVideoTrack.play("local-video");
    }
    await client.publish(tracks);
    document.getElementById("status").textContent = "Llamando...";
  } catch(e) {
    document.getElementById("status").textContent = "Error: " + e.message;
    console.error(e);
  }
}

client.on("user-published", async (user, mediaType) => {
  await client.subscribe(user, mediaType);
  document.getElementById("status").style.display="none";
  if(mediaType==="video") user.videoTrack.play("remote-video");
  if(mediaType==="audio") user.audioTrack.play();
});

client.on("user-unpublished", () => {
  const s = document.getElementById("status");
  s.style.display="block";
  s.textContent="La otra persona apagó su cámara/micro";
});

client.on("user-left", (user) => {
  console.log("Remote user left channel:", user.uid);
  const s = document.getElementById("status");
  s.style.display="block";
  s.textContent="Llamada finalizada";
  if(window.ReactNativeWebView) {
    console.log("Sending hangup message to native WebView");
    window.ReactNativeWebView.postMessage('hangup');
  } else {
    console.warn("ReactNativeWebView NOT detected in window");
  }
});

window.toggleMute  = (m) => localAudioTrack  && localAudioTrack.setMuted(m);
window.toggleVideo = (o) => localVideoTrack && localVideoTrack.setMuted(o);
window.leaveCall   = async () => {
  localAudioTrack && localAudioTrack.close();
  localVideoTrack && localVideoTrack.close();
  await client.leave();
};

joinCall();
</script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
};
