
import { Request, Response } from 'express';
import * as agoraService from '../services/agora.service';

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
