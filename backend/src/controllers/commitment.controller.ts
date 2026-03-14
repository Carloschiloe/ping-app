import { Request, Response } from 'express';
import * as commitmentService from '../services/commitment.service';
import * as calendarSyncService from '../services/calendar_sync.service';

export const createCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.user.id;
        const commitmentData = req.body;

        const data = await commitmentService.createCommitment(userId, commitmentData);
        res.status(201).json(data);
    } catch (error: any) {
        console.error('[createCommitment Controller Error]:', error);
        res.status(500).json({
            error: error.message || 'Internal Server Error',
            details: error.details || error,
            payload: req.body
        });
    }
};

export const acceptCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.user.id;
        const id = req.params.id as string;

        const data = await commitmentService.acceptCommitment(userId, id);

        // --- Phase 15.2: Sync to Cloud ON ACCEPT ---
        try {
            await calendarSyncService.syncCommitmentToCloud(userId, data);
        } catch (syncError) {
            console.error('[Accept Commitment] Cloud sync failed:', syncError);
        }
        // -------------------------------------------

        res.status(200).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const rejectCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.user.id;
        const id = req.params.id as string;
        const { reason } = req.body;

        const data = await commitmentService.rejectCommitment(userId, id, reason);
        res.status(200).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const postponeCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.user.id;
        const id = req.params.id as string;
        const { newDate } = req.body;

        const data = await commitmentService.postponeCommitment(userId, id, newDate);
        res.status(200).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getCommitments = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.user.id;
        const status = req.query.status as string | undefined;
        const conversationId = req.query.conversationId as string | undefined;

        const data = await commitmentService.getCommitments(userId, status, conversationId);
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

export const pingCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.user.id;
        const id = req.params.id as string;

        const data = await commitmentService.pingCommitment(userId, id);
        res.status(200).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const checkConflict = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = req.user.id;
        const dueAt = req.query.dueAt as string;
        const excludeId = req.query.excludeId as string | undefined;
        if (!dueAt) {
            res.status(400).json({ error: 'Missing dueAt parameter' });
            return;
        }

        const data = await commitmentService.checkConflict(userId, dueAt, excludeId);
        res.status(200).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
