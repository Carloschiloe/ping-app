import { Request, Response } from 'express';
import { briefingNowForUser } from '../services/assistant/assistantInitiative.service';

/** The phone's summary alarm rang: what Vorian says out loud right now. */
export async function briefNow(req: Request, res: Response): Promise<void> {
    try {
        res.json(await briefingNowForUser(req.user!.id));
    } catch (error: any) {
        console.error('[assistant] briefing now failed', error?.message ?? error);
        res.status(500).json({ error: 'Could not prepare the summary.' });
    }
}
