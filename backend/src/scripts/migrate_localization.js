const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
    console.log('Starting migration...');
    const { error } = await supabase.rpc('exec_sql', {
        sql: `
            ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country_code TEXT;
            ALTER TABLE profiles ADD COLUMN IF NOT EXISTS language_code TEXT DEFAULT 'es';
        `
    });

    if (error) {
        console.error('Migration failed:', error);
        console.log('Attempting alternative via direct update (if rpc fails)...');
        // Fallback: try to update a dummy record to see if columns exist
        const { error: checkError } = await supabase.from('profiles').select('country_code').limit(1);
        if (checkError) {
            console.error('Columns probably do not exist and RPC failed. Please run the SQL in migrations manually.');
        } else {
            console.log('Columns already exist.');
        }
    } else {
        console.log('Migration completed successfully.');
    }
}

migrate();
