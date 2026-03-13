const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testCreate() {
    const data = {
        title: "Test Commitment",
        dueAt: new Date().toISOString(),
        messageId: "6bccce6e-c47c-4573-ae32-fa624d062eac", // Linked to existing message from logs
        group_conversation_id: "5b2a7cc1-4ab8-4bcc-9285-cd070fce2a2b",
    };

    const userId = "ea7c25c3-a55e-4c8d-8a6c-e5783307b8b4"; // I need a real user id. 
    // Actually, let's just use the current test data from logs.

    console.log('Inserting commitment...');
    const { data: comm, error: e1 } = await supabase
        .from('commitments')
        .insert({
            title: data.title,
            due_at: data.dueAt,
            message_id: data.messageId,
            owner_user_id: userId,
            assigned_to_user_id: userId,
            group_conversation_id: data.group_conversation_id,
            status: 'accepted'
        })
        .select()
        .single();
    
    if (e1) {
        console.error('Error inserting commitment:', e1);
    } else {
        console.log('Commitment created:', comm.id);
    }

    console.log('Inserting system message...');
    const { data: msg, error: e2 } = await supabase
        .from('messages')
        .insert({
            conversation_id: data.group_conversation_id,
            sender_id: userId,
            user_id: userId,
            text: "✨ Test proposal",
            meta: { isSystem: true },
            status: 'sent'
        })
        .select()
        .single();
    
    if (e2) {
        console.error('Error inserting system message:', e2);
    } else {
        console.log('System message created:', msg.id);
    }
}

testCreate();
