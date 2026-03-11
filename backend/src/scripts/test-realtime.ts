import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkRealtime() {
    console.log("Checking if 'messages' is in supabase_realtime publication...");
    // We can just try to execute the SQL to add it. If it's already there, it might fail or succeed silently.
    // Better yet, just provide the SQL to the user since we can't run raw SQL easily without the postgres connection string (which we don't have, we only have Supabase URL and Key).
    // Let's check via REST if we can query pg_publication_tables.
    const { data, error } = await supabaseAdmin.from('pg_publication_tables').select('*').eq('pubname', 'supabase_realtime');
    console.log("Publication tables:", data, error?.message || 'No error');
}

checkRealtime();
