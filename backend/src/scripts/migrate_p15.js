const { supabaseAdmin } = require('../lib/supabaseAdmin');

async function migrate() {
    console.log('--- Phase 15 Migration ---');

    const { error: error1 } = await supabaseAdmin.rpc('exec_sql', {
        sql_query: `ALTER TABLE user_calendar_accounts ADD COLUMN IF NOT EXISTS is_auto_sync_enabled BOOLEAN DEFAULT FALSE;`
    });

    if (error1) {
        console.warn('RPC exec_sql not found or failed, trying direct query if possible...');
        // Fallback: If RPC is not available, we might need the user to run it.
        // But let's try a simple table selection to see if it already exists
        const { error: checkError } = await supabaseAdmin.from('user_calendar_accounts').select('is_auto_sync_enabled').limit(1);
        if (checkError) {
            console.error('Migration Failed. Please run the SQL in your Supabase Dashboard:', checkError);
            process.exit(1);
        } else {
            console.log('Column already exists!');
        }
    } else {
        console.log('Column added successfully!');
    }
}

migrate();
