import { Request, Response } from 'express';
import * as commitmentService from '../services/commitment.service';
import * as calendarSyncService from '../services/calendar_sync.service';

export const getCommitments = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.user.id;
        const status = req.query.status as string | undefined;

        const data = await commitmentService.getCommitments(userId, status);
        res.status(200).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.user.id;
        const commitmentId = req.params.id as string;
        const updates = req.body;

        // Only allow updating specific fields
        const safeUpdates: any = {};
        if (updates.status) safeUpdates.status = updates.status;
        if (updates.title) safeUpdates.title = updates.title;
        if (updates.due_at) safeUpdates.due_at = updates.due_at;

        const data = await commitmentService.updateCommitment(userId, commitmentId, safeUpdates);

        // --- Phase 15.2: Sync Status to Cloud ---
        if (updates.status === 'completed' && data.meta?.synced_to) {
            const eventId = data.meta.cloud_event_id || data.meta.external_event_id;
            if (eventId) {
                await calendarSyncService.updateCloudEventStatus(
                    userId,
                    data.meta.synced_to,
                    eventId,
                    data.title,
                    true
                );
            }
        }
        // ----------------------------------------

        res.status(200).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.user.id;
        const commitmentId = req.params.id as string;

        const data = await commitmentService.deleteCommitment(userId, commitmentId);

        // --- Phase 15.2: Delete from Cloud ---
        if (data.meta?.synced_to) {
            const eventId = data.meta.cloud_event_id || data.meta.external_event_id;
            if (eventId) {
                await calendarSyncService.deleteCloudEvent(userId, data.meta.synced_to, eventId);
            }
        }
        // ----------------------------------------

        res.status(200).json({ success: true, deleted: data });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
