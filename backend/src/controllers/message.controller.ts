import { Request, Response } from 'express';
import * as messageService from '../services/message.service';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export const createMessage = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.user.id;
        const { text, reply_to_id } = req.body;

        if (!text) {
            res.status(400).json({ error: 'Message text is required' });
            return;
        }

        const result = await messageService.processUserMessage(userId, text, undefined, reply_to_id);
        res.status(201).json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getMessages = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.user.id;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const result = await messageService.getMessages(userId, limit, offset);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateMessageStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        console.log(`[updateMessageStatus] ${req.params.id} -> ${req.body.status}`);
        if (!req.user || !req.user.id) {
            console.log('[updateMessageStatus] Unauthorized');
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !['delivered', 'read'].includes(status)) {
            console.log(`[updateMessageStatus] Invalid status: ${status}`);
            res.status(400).json({ error: 'Invalid status' });
            return;
        }

        // --- Phase 23: Privacy - Read Receipts ---
        // If the current user has privacy_read_receipts = false, skip 'read' updates.
        // This means the original sender will never see blue ticks.
        if (status === 'read') {
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('privacy_read_receipts')
                .eq('id', req.user!.id)
                .single();

            if (profile && profile.privacy_read_receipts === false) {
                console.log(`[updateMessageStatus] Skipped 'read' due to privacy preference for user ${req.user!.id}`);
                res.json({ success: true, status: 'skipped' });
                return;
            }
        }
        // -----------------------------------------

        const { data: message, error: fetchErr } = await supabaseAdmin
            .from('messages')
            .select('status')
            .eq('id', id)
            .single();

        if (fetchErr || !message) {
            console.log(`[updateMessageStatus] fetchErr or not found:`, fetchErr);
            res.status(404).json({ error: 'Message not found' });
            return;
        }

        const currentStatus = message.status || 'sent';
        let shouldUpdate = false;

        if (currentStatus === 'sent' && (status === 'delivered' || status === 'read')) shouldUpdate = true;
        if (currentStatus === 'delivered' && status === 'read') shouldUpdate = true;

        if (shouldUpdate) {
            const { error: updateErr } = await supabaseAdmin
                .from('messages')
                .update({ status })
                .eq('id', id);

            if (updateErr) {
                console.error('[updateMessageStatus] updateErr:', updateErr);
                throw updateErr;
            }
            console.log(`[updateMessageStatus] Success for ${id}`);
        } else {
            console.log(`[updateMessageStatus] No update needed for ${id} (current: ${currentStatus}, requested: ${status})`);
        }

        res.json({ success: true, status });
    } catch (error: any) {
        console.error('[updateMessageStatus] FATAL ERROR:', error);
        res.status(500).json({ error: error.message });
    }
};
