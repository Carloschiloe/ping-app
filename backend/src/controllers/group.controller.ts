import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';

// POST /groups
export const createGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.user!.id;
        // Types are guaranteed correct by Zod
        const { name, participantIds, avatarUrl } = req.body;

        // Include the creator in the participants
        const allParticipantIds = Array.from(new Set([...participantIds, userId]));

        // Create the group conversation
        const { data: conv, error: convError } = await supabaseAdmin
            .from('conversations')
            .insert({
                is_group: true,
                name: name,
                avatar_url: avatarUrl || null,
                admin_id: userId
            })
            .select()
            .single();

        if (convError) throw new AppError(convError.message, 500);

        // Prepare participants rows
        const participantsData = allParticipantIds.map((id: string) => ({
            conversation_id: conv.id,
            user_id: id
        }));

        // Insert all participants
        const { error: partError } = await supabaseAdmin
            .from('conversation_participants')
            .insert(participantsData);

        if (partError) throw new AppError(partError.message, 500);

        res.status(201).json({ conversationId: conv.id, isGroup: true, name: conv.name });
    } catch (error) {
        next(error);
    }
};

// POST /groups/:id/participants
export const addParticipants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id: conversationId } = req.params;
        const { newParticipantIds } = req.body;

        // Verify if user is admin
        const { data: conv, error: convError } = await supabaseAdmin
            .from('conversations')
            .select('admin_id, is_group')
            .eq('id', conversationId)
            .single();

        if (convError || !conv) throw new AppError(convError?.message || 'Conversation not found', 404);

        if (!conv.is_group) {
            throw new AppError('This conversation is not a group', 400);
        }

        if (conv.admin_id !== userId) {
            throw new AppError('Only the group admin can add participants', 403);
        }

        const participantsData = newParticipantIds.map((id: string) => ({
            conversation_id: conversationId,
            user_id: id
        }));

        const { error: partError } = await supabaseAdmin
            .from('conversation_participants')
            .insert(participantsData);

        if (partError) throw new AppError(partError.message, 500);

        res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};

// DELETE /groups/:id
export const deleteGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id: conversationId } = req.params;

        // Verify if user is admin
        const { data: conv, error: convError } = await supabaseAdmin
            .from('conversations')
            .select('admin_id, is_group')
            .eq('id', conversationId)
            .single();

        if (convError || !conv) throw new AppError(convError?.message || 'Conversation not found', 404);

        if (!conv.is_group) {
            throw new AppError('This conversation is not a group', 400);
        }

        if (conv.admin_id !== userId) {
            throw new AppError('Only the group admin can delete the group', 403);
        }

        // Delete the group (cascade will handle participants and messages)
        const { error: delError } = await supabaseAdmin
            .from('conversations')
            .delete()
            .eq('id', conversationId);

        if (delError) throw new AppError(delError.message, 500);

        res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};

// PATCH /groups/:id
export const updateGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id: conversationId } = req.params;
        const { name, avatar_url } = req.body;

        // Verify if user is admin
        const { data: conv, error: convError } = await supabaseAdmin
            .from('conversations')
            .select('admin_id, is_group')
            .eq('id', conversationId)
            .single();

        if (convError || !conv) throw new AppError(convError?.message || 'Conversation not found', 404);

        if (!conv.is_group) {
            throw new AppError('This conversation is not a group', 400);
        }

        if (conv.admin_id !== userId) {
            throw new AppError('Only the group admin can update group info', 403);
        }

        const { data: updated, error: updateErr } = await supabaseAdmin
            .from('conversations')
            .update({
                ...(name ? { name } : {}),
                ...(avatar_url !== undefined ? { avatar_url } : {}),
            })
            .eq('id', conversationId)
            .select()
            .single();

        if (updateErr) throw new AppError(updateErr.message, 500);

        res.status(200).json({ success: true, group: updated });
    } catch (error) {
        next(error);
    }
};
