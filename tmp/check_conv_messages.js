const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMessages() {
    const convId = '5b2a7cc1-4ab8-4bcc-9285-cd070fce2a2b';
    console.log(`Checking messages for conversation: ${convId}`);
    
    const { data: msgs, error } = await supabase
        .from('messages')
        .select('id, text, meta, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false })
        .limit(10);
    
    if (error) {
        console.error('Error fetching messages:', error);
        return;
    }

    msgs.forEach(m => {
        console.log(`ID: ${m.id}`);
        console.log(`Text: ${m.text}`);
        console.log(`Meta: ${JSON.stringify(m.meta, null, 2)}`);
        console.log('---');
    });
}

checkMessages();
