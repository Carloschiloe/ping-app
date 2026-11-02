import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { markReceipt, tombstoneMessage } from '../services/messagingApplication.service';

// Adapter legacy: el status solicitado avanza unicamente el receipt del
// actor. Nunca modifica directamente messages.status.
export const updateMessageStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user?.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { status } = req.body;
        if (!['delivered', 'read'].includes(status)) {
            res.status(400).json({ error: 'Invalid status' });
            return;
        }

        if (status === 'read') {
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('privacy_read_receipts')
                .eq('id', req.user.id)
                .single();
            if (profile?.privacy_read_receipts === false) {
                res.json({ success: true, status: 'skipped' });
                return;
            }
        }

        const receipt = await markReceipt(req.user.id, req.params.id as string, status);
        res.json({ success: true, status, receipt });
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({
            error: statusCode === 500 ? 'Unable to update message status' : error.message,
        });
    }
};

export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user?.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const message = await tombstoneMessage(req.user.id, req.params.id as string);
        res.json({ success: true, message });
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({
            error: statusCode === 500 ? 'Unable to delete message' : error.message,
        });
    }
};
