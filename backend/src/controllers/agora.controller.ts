
import { Request, Response } from 'express';
import * as agoraService from '../services/agora.service';
import { supabaseAdmin } from '../lib/supabaseAdmin';

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
