import { supabaseAdmin } from '../lib/supabaseAdmin';

const convId = '5b2a7cc1-4ab8-4bcc-9285-cd070fce2a2b';

async function check() {
    console.log(`Checking media for conversation: ${convId}`);
    
    // 1. Check if conversation exists
    const { data: conv, error: convErr } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('id', convId)
        .single();
        
    if (convErr) {
        console.error('Error fetching conversation:', convErr);
        return;
    }
    console.log('Conversation found:', conv.name || 'Unnamed group');

    // 2. Fetch ALL messages with [
    const { data: messages, error: msgErr } = await supabaseAdmin
        .from('messages')
        .select('id, text, created_at')
        .eq('conversation_id', convId)
        .ilike('text', '%[%')
        .order('created_at', { ascending: false });

    if (msgErr) {
        console.error('Error fetching messages:', msgErr);
        return;
    }

    console.log(`Found ${messages?.length || 0} messages matching media prefix.`);
    messages?.slice(0, 5).forEach((m, i) => {
        console.log(`${i}: [${m.created_at}] ${m.text.substring(0, 100)}`);
    });
}

check();
