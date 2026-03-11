const { supabaseAdmin } = require('../lib/supabaseAdmin');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const migrationPath = process.argv[2];
    if (!migrationPath) {
        console.error('Usage: node src/scripts/migrate.js <path-to-sql-file>');
        process.exit(1);
    }

    const sql = fs.readFileSync(path.resolve(migrationPath), 'utf8');

    console.log(`Running migration: ${migrationPath}`);

    const { data, error } = await supabaseAdmin.rpc('exec_sql', {
        sql_query: sql
    });

    if (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } else {
        console.log('Migration successful!');
        console.log(data);
    }
}

runMigration().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
