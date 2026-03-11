
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectSchema() {
    try {
        // Check columns of messages
        const { data: cols, error: colError } = await supabase.rpc('get_table_columns', { table_name: 'messages' });
        if (colError) {
            console.log('\n--- Columns of messages (fallback): ---');
            const { data: mS } = await supabase.from('messages').select('*').limit(1);
            console.log(Object.keys(mS[0] || {}).join(', '));

            console.log('\n--- Columns of commitments: ---');
            const { data: cS } = await supabase.from('commitments').select('*').limit(1);
            console.log(Object.keys(cS[0] || {}).join(', '));
        } else {
            console.log('Columns of messages:', cols);
        }

        // Check RLS policies if possible (via direct SQL)
        const { data: policies, error: polError } = await supabase.from('pg_policies').select('*').in('tablename', ['messages', 'message_reactions']);
        console.log('RLS Policies:', JSON.stringify(policies, null, 2));

    } catch (e) {
        console.error('Inspection failed:', e);
    }
}

inspectSchema();
