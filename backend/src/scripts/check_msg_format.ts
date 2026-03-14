import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSampleMessages() {
    console.log('--- Checking Sample Messages ---');
    const { data: messages, error } = await supabase
        .from('messages')
        .select('id, text, conversation_id')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching messages:', error);
        return;
    }

    messages.forEach(m => {
        console.log(`Msg ${m.id.substring(0,8)} | Conv ${m.conversation_id.substring(0,8)} | Text: "${m.text?.substring(0, 100)}"`);
    });
}

checkSampleMessages();
