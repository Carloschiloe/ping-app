
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkFkeys() {
    const { data, error } = await supabase.rpc('get_table_fkeys', { table_name: 'messages' });
    if (error) {
        // Fallback: try raw SQL via RPC or just inspect a sample
        const { data: info } = await supabase.from('messages').select('*, reply_to_id').limit(1);
        console.log('Sample message:', JSON.stringify(info, null, 2));

        // Check if we can get table info from information_schema
        const { data: schema, error: sError } = await supabase.rpc('inspect_table', { t_name: 'messages' });
        console.log('Schema:', schema || sError);
    } else {
        console.log('FKEYS:', data);
    }
}

checkFkeys();
