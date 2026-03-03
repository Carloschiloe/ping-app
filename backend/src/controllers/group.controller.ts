import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';

// POST /groups
export const createGroup = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { name, participantIds, avatarUrl } = req.body;

        if (!name || typeof name !== 'string') {
            res.status(400).json({ error: 'Group name is required' });
            return;
        }

        if (!participantIds || !Array.isArray(participantIds)) {
            res.status(400).json({ error: 'participantIds must be an array of user UUIDs' });
            return;
        }

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

        if (convError) throw convError;

        // Prepare participants rows
        const participantsData = allParticipantIds.map(id => ({
            conversation_id: conv.id,
            user_id: id
        }));

        // Insert all participants
        const { error: partError } = await supabaseAdmin
            .from('conversation_participants')
            .insert(participantsData);

        if (partError) throw partError;

        res.status(201).json({ conversationId: conv.id, isGroup: true, name: conv.name });
    } catch (error: any) {
        console.error('[Create Group Error]', error);
        res.status(500).json({ error: error.message });
    }
};

// POST /groups/:id/participants
export const addParticipants = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id: conversationId } = req.params;
        const { newParticipantIds } = req.body;

        if (!newParticipantIds || !Array.isArray(newParticipantIds)) {
            res.status(400).json({ error: 'newParticipantIds must be an array of user UUIDs' });
            return;
        }

        // Verify if user is admin
        const { data: conv, error: convError } = await supabaseAdmin
            .from('conversations')
            .select('admin_id, is_group')
            .eq('id', conversationId)
            .single();

        if (convError) throw convError;

        if (!conv.is_group) {
            res.status(400).json({ error: 'This conversation is not a group' });
            return;
        }

        if (conv.admin_id !== userId) {
            res.status(403).json({ error: 'Only the group admin can add participants' });
            return;
        }

        const participantsData = newParticipantIds.map(id => ({
            conversation_id: conversationId,
            user_id: id
        }));

        const { error: partError } = await supabaseAdmin
            .from('conversation_participants')
            .insert(participantsData);

        if (partError) throw partError;

        res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('[Add Participants Error]', error);
        res.status(500).json({ error: error.message });
    }
};

// DELETE /groups/:id
export const deleteGroup = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const { id: conversationId } = req.params;

        // Verify if user is admin
        const { data: conv, error: convError } = await supabaseAdmin
            .from('conversations')
            .select('admin_id, is_group')
            .eq('id', conversationId)
            .single();

        if (convError) throw convError;

        if (!conv.is_group) {
            res.status(400).json({ error: 'This conversation is not a group' });
            return;
        }

        if (conv.admin_id !== userId) {
            res.status(403).json({ error: 'Only the group admin can delete the group' });
            return;
        }

        // Delete the group (cascade will handle participants and messages)
        const { error: delError } = await supabaseAdmin
            .from('conversations')
            .delete()
            .eq('id', conversationId);

        if (delError) throw delError;

        res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('[Delete Group Error]', error);
        res.status(500).json({ error: error.message });
    }
};
// PATCH /groups/:id
export const updateGroup = async (req: Request, res: Response): Promise<void> => {
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

        if (convError) throw convError;

        if (!conv.is_group) {
            res.status(400).json({ error: 'This conversation is not a group' });
            return;
        }

        if (conv.admin_id !== userId) {
            res.status(403).json({ error: 'Only the group admin can update group info' });
            return;
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

        if (updateErr) throw updateErr;

        res.status(200).json({ success: true, group: updated });
    } catch (error: any) {
        console.error('[Update Group Error]', error);
        res.status(500).json({ error: error.message });
    }
};
