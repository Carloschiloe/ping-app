import { Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import * as meetings from '../services/meetings/meetingRecording.service';
import { wakeMeetingWorker } from '../services/meetings/meetingWorker.service';

function fail(res: Response, error: unknown, fallback: string): void {
    const status = error instanceof AppError ? error.statusCode : 500;
    if (status === 500) console.error('[Meeting Controller]', fallback, { message: (error as any)?.message });
    res.status(status).json({ error: status === 500 ? fallback : (error as AppError).message });
}

/** Whether the call screen shows «Grabar y resumir». */
export const status = async (_req: Request, res: Response): Promise<void> => {
    try {
        res.status(200).json({ enabled: await meetings.meetingSummariesEnabled(), maxSeconds: meetings.MAX_MEETING_SECONDS });
    } catch {
        res.status(200).json({ enabled: false });
    }
};

export const request = async (req: Request, res: Response): Promise<void> => {
    try {
        res.status(200).json(await meetings.requestMeetingRecording(req.user!.id, req.body.conversationId));
    } catch (error) {
        fail(res, error, 'Unable to ask for the recording');
    }
};

export const consent = async (req: Request, res: Response): Promise<void> => {
    try {
        res.status(200).json(await meetings.consentToMeetingRecording(req.user!.id, req.params.callId as string));
    } catch (error) {
        fail(res, error, 'Unable to save the answer');
    }
};

export const decline = async (req: Request, res: Response): Promise<void> => {
    try {
        await meetings.declineMeetingRecording(req.user!.id, req.params.callId as string);
        res.status(200).json({ ok: true });
    } catch (error) {
        fail(res, error, 'Unable to save the answer');
    }
};

export const uploadUrl = async (req: Request, res: Response): Promise<void> => {
    try {
        res.status(200).json(await meetings.meetingUploadUrl(req.user!.id, req.params.callId as string));
    } catch (error) {
        fail(res, error, 'Unable to prepare the upload');
    }
};

export const uploaded = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await meetings.meetingTrackUploaded(req.user!.id, req.params.callId as string, req.body);
        res.status(200).json(result);
        if (result.queued) wakeMeetingWorker();
    } catch (error) {
        fail(res, error, 'Unable to save the recording');
    }
};
