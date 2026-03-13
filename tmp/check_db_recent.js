const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRecent() {
    try {
        console.log('--- Ultimos 5 Mensajes ---');
        const { data: msgs, error: e1 } = await supabase
            .from('messages')
            .select('id, text, meta, created_at')
            .order('created_at', { ascending: false })
            .limit(5);
        if (e1) console.error(e1);
        console.log(JSON.stringify(msgs, null, 2));

        console.log('\n--- Ultimos 5 Compromisos ---');
        const { data: comms, error: e2 } = await supabase
            .from('commitments')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);
        if (e2) console.error(e2);
        console.log(JSON.stringify(comms, null, 2));
    } catch (err) {
        console.error(err);
    }
}

checkRecent();
