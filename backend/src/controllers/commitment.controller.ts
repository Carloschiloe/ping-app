import { Request, Response } from 'express';
import * as commitmentService from '../services/commitment.service';
import * as calendarSyncService from '../services/calendar_sync.service';
import { toLegacyCommitmentShape, toLegacyCommitmentListShape } from '../utils/commitmentCompat';
import * as proposalService from '../services/commitmentProposal.service';

function handleError(res: Response, label: string, error: any) {
    console.error(`[${label} Controller Error]:`, error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal Server Error' });
}

export const createCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const data = await proposalService.createConfirmedCommitment(req.user.id, req.body);
        res.status(201).json(toLegacyCommitmentShape(data));
    } catch (error: any) {
        handleError(res, 'createCommitment', error);
    }
};

export const acceptCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const data = await commitmentService.acceptCommitment(req.user.id, req.params.id as string);

        try {
            await calendarSyncService.syncCommitmentToCloud(req.user.id, data);
        } catch (syncError) {
            console.error('[Accept Commitment] Cloud sync failed:', syncError);
        }

        res.status(200).json(toLegacyCommitmentShape(data));
    } catch (error: any) {
        handleError(res, 'acceptCommitment', error);
    }
};

export const rejectCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { reason } = req.body;
        const data = await commitmentService.rejectCommitment(req.user.id, req.params.id as string, reason);
        res.status(200).json(toLegacyCommitmentShape(data));
    } catch (error: any) {
        handleError(res, 'rejectCommitment', error);
    }
};

export const createProposal = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = await proposalService.createProposal(req.user!.id, req.body);
        res.status(201).json(data);
    } catch (error: any) {
        handleError(res, 'createProposal', error);
    }
};

export const confirmProposal = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = await proposalService.confirmProposal(req.user!.id, req.params.id as string);
        res.status(201).json(toLegacyCommitmentShape(data));
    } catch (error: any) {
        handleError(res, 'confirmProposal', error);
    }
};

export const rejectProposal = async (req: Request, res: Response): Promise<void> => {
    try {
        const data = await proposalService.rejectProposal(
            req.user!.id,
            req.params.id as string,
            req.body.reason
        );
        res.status(200).json(data);
    } catch (error: any) {
        handleError(res, 'rejectProposal', error);
    }
};

// Compatibilidad temporal: mobile sigue llamando /postpone con { newDate }.
export const postponeCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { newDate } = req.body;
        const data = await commitmentService.postponeCommitment(req.user.id, req.params.id as string, newDate);
        res.status(200).json(toLegacyCommitmentShape(data));
    } catch (error: any) {
        handleError(res, 'postponeCommitment', error);
    }
};

export const counterProposeCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { proposedDueAt } = req.body;
        const data = await commitmentService.counterProposeCommitment(req.user.id, req.params.id as string, proposedDueAt);
        res.status(200).json(toLegacyCommitmentShape(data));
    } catch (error: any) {
        handleError(res, 'counterProposeCommitment', error);
    }
};

export const markActionCompleted = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const data = await commitmentService.markActionCompleted(req.user.id, req.params.id as string);
        res.status(200).json(toLegacyCommitmentShape(data));
    } catch (error: any) {
        handleError(res, 'markActionCompleted', error);
    }
};

export const resolveCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const data = await commitmentService.resolveCommitment(
            req.user.id,
            req.params.id as string,
            req.body.result
        );

        if (data.meta?.synced_to) {
            try {
                const eventId = data.meta.cloud_event_id || data.meta.external_event_id;
                if (eventId) {
                    await calendarSyncService.updateCloudEventStatus(req.user.id, data.meta.synced_to, eventId, data.title, true);
                }
            } catch (syncError) {
                console.error('[Resolve Commitment] Cloud sync failed:', syncError);
            }
        }

        res.status(200).json(toLegacyCommitmentShape(data));
    } catch (error: any) {
        handleError(res, 'resolveCommitment', error);
    }
};

export const cancelCommitment = async (req: Request, res: Response): Promise<void> => {
    res.status(409).json({
        error: 'Commitment cancellation is unavailable until the product decision is approved',
    });
};

export const reopenCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const data = await commitmentService.reopenCommitment(req.user.id, req.params.id as string);
        res.status(200).json(toLegacyCommitmentShape(data));
    } catch (error: any) {
        handleError(res, 'reopenCommitment', error);
    }
};

export const reassignCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { assigned_to_user_id, counterparty_contact_id } = req.body;
        const data = await commitmentService.reassignCommitment(req.user.id, req.params.id as string, assigned_to_user_id, counterparty_contact_id);
        res.status(200).json(toLegacyCommitmentShape(data));
    } catch (error: any) {
        handleError(res, 'reassignCommitment', error);
    }
};

export const scheduleFollowUp = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { followUpAt, nextAction, waitingOnUserId, waitingOnContactId } = req.body;
        const data = await commitmentService.scheduleFollowUp(req.user.id, req.params.id as string, followUpAt, nextAction, waitingOnUserId, waitingOnContactId);
        res.status(200).json(toLegacyCommitmentShape(data));
    } catch (error: any) {
        handleError(res, 'scheduleFollowUp', error);
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
        const conversationId = (req.query.conversationId || req.query.group_conversation_id) as string | undefined;
        const isGroupTaskRaw = req.query.is_group_task as string | undefined;
        const isGroupTask = isGroupTaskRaw === 'true' ? true : isGroupTaskRaw === 'false' ? false : undefined;

        const data = await commitmentService.getCommitments(userId, status, conversationId, isGroupTask);
        res.status(200).json(toLegacyCommitmentListShape(data));
    } catch (error: any) {
        handleError(res, 'getCommitments', error);
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

        // El filtrado de campos seguros ocurre dentro de
        // commitmentService.updateCommitment (incluida la traduccion
        // temporal de status legacy -> transicion real).
        const data = await commitmentService.updateCommitment(userId, commitmentId, req.body);

        // --- Phase 15.2: Sync Status to Cloud (calendario, fuera de alcance de esta fase, solo se preserva el hook existente) ---
        if (data.status === 'resolved' && data.meta?.synced_to) {
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

        res.status(200).json(toLegacyCommitmentShape(data));
    } catch (error: any) {
        handleError(res, 'updateCommitment', error);
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
        res.status(200).json({ success: true, archived: toLegacyCommitmentShape(data) });
    } catch (error: any) {
        handleError(res, 'deleteCommitment', error);
    }
};

export const pingCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const data = await commitmentService.pingCommitment(req.user.id, req.params.id as string);
        res.status(200).json(data);
    } catch (error: any) {
        handleError(res, 'pingCommitment', error);
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
        handleError(res, 'checkConflict', error);
    }
};
