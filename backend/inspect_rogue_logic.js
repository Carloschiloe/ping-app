
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectDatabase() {
    console.log('--- Inspecting Database for Triggers and Functions ---');

    // 1. Check for triggers on the messages table
    const { data: triggers, error: triggerError } = await supabase.rpc('inspect_triggers', { table_name_input: 'messages' });

    if (triggerError) {
        // Fallback: try to see if we can query pg_trigger directly via RPC if such an RPC exists
        console.log('Trigger RPC failed, trying generic query...');
        const { data: genericTriggers, error: genericError } = await supabase
            .from('pg_trigger')
            .select('tgname')
            .limit(10);

        if (genericError) {
            console.error('Could not fetch triggers:', genericError.message);
        } else {
            console.log('Triggers (generic):', genericTriggers);
        }
    } else {
        console.log('Triggers on messages:', triggers);
    }

    // 2. Check for functions in the public schema
    const { data: functions, error: funcError } = await supabase.rpc('inspect_functions', { schema_input: 'public' });

    if (funcError) {
        console.error('Could not fetch functions:', funcError.message);
    } else {
        console.log('Functions in public:', functions);
    }

    // 3. Last 10 messages to see metadata and exact strings again
    const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (messages) {
        console.log('\n--- RECENT MESSAGES ---');
        messages.forEach(m => {
            console.log(`[${m.id}] ${m.sender_id === null ? 'SYSTEM' : 'USER'}: ${m.text}`);
            if (m.meta) console.log(`   Meta: ${JSON.stringify(m.meta)}`);
        });
    }
}

inspectDatabase();
