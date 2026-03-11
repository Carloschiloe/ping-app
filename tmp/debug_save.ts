import { supabaseAdmin } from './backend/src/lib/supabaseAdmin';

async function debugSave() {
    console.log('Testing commitment insert...');
    const userId = '84a0c8b0-8c26-4d94-9694-5ef98768006d'; // Carlos ID (approx from context) or I'll fetch one

    // First, let's get a real user ID just in case
    const { data: profiles } = await supabaseAdmin.from('profiles').select('id').limit(1);
    const testId = profiles?.[0]?.id;

    if (!testId) {
        console.error('No users found in database');
        return;
    }

    console.log(`Using user ID: ${testId}`);

    const newCommitment = {
        title: 'Test Thought ' + new Date().toISOString(),
        priority: 'medium',
        due_at: new Date(Date.now() + 86400000).toISOString(),
        assigned_to_user_id: testId,
        status: 'accepted',
        owner_user_id: testId
    };

    const { data, error } = await supabaseAdmin
        .from('commitments')
        .insert(newCommitment)
        .select(`
            *,
            assignee:profiles!assigned_to_user_id (id, full_name),
            owner:profiles!owner_user_id (id, full_name),
            message:messages!message_id(id, conversation_id)
        `)
        .single();

    if (error) {
        console.error('INSERT ERROR:', JSON.stringify(error, null, 2));
    } else {
        console.log('INSERT SUCCESS:', data);
    }
}

debugSave();
