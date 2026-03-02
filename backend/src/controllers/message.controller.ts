import { Request, Response } from 'express';
import * as messageService from '../services/message.service';

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
