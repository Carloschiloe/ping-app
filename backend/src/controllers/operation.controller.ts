import { Request, Response } from 'express';
import * as operationService from '../services/operation.service';

export const getConversationOperationState = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const conversationId = req.params.id as string;
        const data = await operationService.getConversationOperationState(userId, conversationId);
        res.status(200).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateConversationMode = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const conversationId = req.params.id as string;
        const { mode } = req.body;
        const data = await operationService.updateConversationMode(userId, conversationId, mode);
        res.status(200).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const setPinnedMessage = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const conversationId = req.params.id as string;
        const { messageId } = req.body;
        const data = await operationService.setPinnedMessage(userId, conversationId, messageId);
        res.status(200).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const setActiveCommitment = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const conversationId = req.params.id as string;
        const { commitmentId } = req.body;
        const data = await operationService.setActiveCommitment(userId, conversationId, commitmentId);
        res.status(200).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const saveChecklistTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const conversationId = req.params.id as string;
        const { title, items } = req.body;
        const data = await operationService.saveChecklistTemplate(userId, conversationId, title, items);
        res.status(201).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const toggleChecklistItem = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const id = req.params.id as string;
        const { is_checked } = req.body;
        const data = await operationService.toggleChecklistItem(userId, id, is_checked);
        res.status(200).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createShiftReport = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const conversationId = req.params.id as string;
        const { body, source = 'text', meta = {} } = req.body;
        const data = await operationService.createShiftReport(userId, conversationId, body, source, meta);
        res.status(201).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const registerCommitmentOperationAction = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const id = req.params.id as string;
        const { action, location_message_id, completion_note, completion_outcome } = req.body;
        const data = await operationService.registerCommitmentOperationAction(
            userId,
            id,
            action,
            location_message_id,
            completion_note,
            completion_outcome
        );
        res.status(200).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
