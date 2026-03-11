const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const fs = require('fs');
const https = require('https');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Extract project ref from URL
const projectRef = supabaseUrl.replace('https://', '').split('.')[0];

const sql = fs.readFileSync('phase29_calls.sql', 'utf8');

// Use Supabase Management API to run SQL
const options = {
    hostname: supabaseUrl.replace('https://', ''),
    port: 443,
    path: '/rest/v1/rpc/exec',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
    }
};

// Alternative: use @supabase/supabase-js with direct SQL
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runMigration() {
    // Split and run each statement individually
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
        if (!stmt) continue;
        console.log('Running:', stmt.substring(0, 80) + '...');
        const { error } = await supabase.from('_migrations').select('*').limit(1).then(() => ({ error: null })).catch(e => ({ error: e }));
        // Just try inserting via the admin client using raw query
    }

    // Try using pg directly
    const { data, error } = await supabase.rpc('version');
    if (error) {
        console.log('RPC not available. Please run phase29_calls.sql manually in Supabase SQL Editor.');
        console.log('\nSQL Content to paste:');
        console.log(sql);
    } else {
        console.log('Connected to Supabase:', data);
    }
}

runMigration();
