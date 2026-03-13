import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRecent() {
    console.log('--- Ultimos 5 Mensajes ---');
    const { data: msgs } = await supabase
        .from('messages')
        .select('id, text, meta, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
    console.log(JSON.stringify(msgs, null, 2));

    console.log('\n--- Ultimos 5 Compromisos ---');
    const { data: comms } = await supabase
        .from('commitments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
    console.log(JSON.stringify(comms, null, 2));
}

checkRecent();
