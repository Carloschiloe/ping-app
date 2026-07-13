import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { AppError } from '../utils/AppError';
import { assertConversationAdmin } from '../utils/authz';

// POST /groups
export const createGroup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.user!.id;
        // Types are guaranteed correct by Zod
        const { name, participantIds, avatarUrl } = req.body;

        // Include the creator in the participants
        const allParticipantIds = Array.from(new Set([...participantIds, userId]));

        // Create the group conversation.
        // V2: conversation_type reemplaza is_group; admin_id ya no existe en
        // conversations — la autoridad de admin vive solo en
        // conversation_participants.role (asignado abajo).
        const { data: conv, error: convError } = await supabaseAdmin
            .from('conversations')
            .insert({
                conversation_type: 'group',
                name: name,
                avatar_url: avatarUrl || null,
                created_by: userId
            })
            .select()
            .single();

        if (convError) throw new AppError(convError.message, 500);

        // Prepare participants rows
        const participantsData = allParticipantIds.map((id: string) => ({
            conversation_id: conv.id,
            user_id: id,
            role: id === userId ? 'admin' : 'member',
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
        const conversationId = req.params.id as string;
        const { newParticipantIds } = req.body;

        // Verify if user is admin
        const { data: conv, error: convError } = await supabaseAdmin
            .from('conversations')
            .select('conversation_type')
            .eq('id', conversationId)
            .single();

        if (convError || !conv) throw new AppError(convError?.message || 'Conversation not found', 404);

        if (conv.conversation_type !== 'group') {
            throw new AppError('This conversation is not a group', 400);
        }

        await assertConversationAdmin(userId, conversationId);

        const participantsData = newParticipantIds.map((id: string) => ({
            conversation_id: conversationId,
            user_id: id,
            role: 'member',
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
        const conversationId = req.params.id as string;

        // Verify if user is admin
        const { data: conv, error: convError } = await supabaseAdmin
            .from('conversations')
            .select('conversation_type')
            .eq('id', conversationId)
            .single();

        if (convError || !conv) throw new AppError(convError?.message || 'Conversation not found', 404);

        if (conv.conversation_type !== 'group') {
            throw new AppError('This conversation is not a group', 400);
        }

        await assertConversationAdmin(userId, conversationId);

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
        const conversationId = req.params.id as string;
        const { name, avatar_url } = req.body;

        // Verify if user is admin
        const { data: conv, error: convError } = await supabaseAdmin
            .from('conversations')
            .select('conversation_type')
            .eq('id', conversationId)
            .single();

        if (convError || !conv) throw new AppError(convError?.message || 'Conversation not found', 404);

        if (conv.conversation_type !== 'group') {
            throw new AppError('This conversation is not a group', 400);
        }

        await assertConversationAdmin(userId, conversationId);

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
export const getParticipants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const requesterId = req.user!.id;
        const conversationId = req.params.id as string;
        const { data: membership, error: membershipError } = await supabaseAdmin
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .eq('user_id', requesterId)
            .maybeSingle();

        if (membershipError) throw new AppError(membershipError.message, 500);
        if (!membership) throw new AppError('You do not have access to this group', 403);

        const { data, error } = await supabaseAdmin
            .from('conversation_participants')
            .select('user_id, role, profiles(id, full_name, email, avatar_url)')
            .eq('conversation_id', conversationId);

        if (error) throw new AppError(error.message, 500);
        res.status(200).json({ data });
    } catch (error) {
        next(error);
    }
};

export const updateParticipantRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const requesterId = req.user!.id;
        const conversationId = req.params.id as string;
        const userId = req.params.userId as string;
        const { role } = req.body;

        const { data: conv, error: convError } = await supabaseAdmin
            .from('conversations')
            .select('id, conversation_type')
            .eq('id', conversationId)
            .single();

        if (convError || !conv) throw new AppError(convError?.message || 'Conversation not found', 404);
        if (conv.conversation_type !== 'group') throw new AppError('This conversation is not a group', 400);

        await assertConversationAdmin(requesterId, conversationId);

        if (requesterId === userId && role !== 'admin') {
            const { count } = await supabaseAdmin
                .from('conversation_participants')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', conversationId)
                .eq('role', 'admin');

            if ((count || 0) <= 1) {
                throw new AppError('The group must have at least one admin', 400);
            }
        }

        const { data, error } = await supabaseAdmin
            .from('conversation_participants')
            .update({ role })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .select('user_id, role, profiles(id, full_name, email, avatar_url)')
            .single();

        if (error) throw new AppError(error.message, 500);

        // V2: no existe conversations.admin_id — la promocion a admin ya
        // quedo reflejada arriba en conversation_participants.role, que es
        // la unica fuente de verdad.

        res.status(200).json({ success: true, participant: data });
    } catch (error) {
        next(error);
    }
};
