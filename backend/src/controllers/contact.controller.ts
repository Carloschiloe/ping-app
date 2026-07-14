import { Request, Response } from 'express';
import * as contactService from '../services/contact.service';

export const createContact = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const contact = await contactService.createContact(req.user.id, req.body);
        res.status(201).json(contact);
    } catch (error: any) {
        console.error('[createContact Controller Error]:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internal Server Error' });
    }
};

export const getContacts = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const contacts = await contactService.getContacts(req.user.id);
        res.status(200).json(contacts);
    } catch (error: any) {
        console.error('[getContacts Controller Error]:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internal Server Error' });
    }
};

export const getContact = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const contact = await contactService.getContact(req.user.id, req.params.id as string);
        res.status(200).json(contact);
    } catch (error: any) {
        console.error('[getContact Controller Error]:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internal Server Error' });
    }
};
