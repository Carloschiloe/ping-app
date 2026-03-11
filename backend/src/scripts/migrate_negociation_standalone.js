const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
    console.log('--- Negotiation Flow Migration (Standalone) ---');

    const sql = `
    ALTER TABLE commitments 
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS proposed_due_at TIMESTAMPTZ;
    `;

    const { error } = await supabaseAdmin.rpc('exec_sql', {
        sql_query: sql
    });

    if (error) {
        console.error('Migration Failed:', error);
        // Check if columns already exist
        const { error: checkError } = await supabaseAdmin
            .from('commitments')
            .select('rejection_reason, proposed_due_at')
            .limit(1);

        if (checkError) {
            console.error('CRITICAL ERROR: Please run the SQL manually.');
            process.exit(1);
        } else {
            console.log('Columns already present.');
        }
    } else {
        console.log('Negotiation columns added successfully!');
    }
}

migrate();
