
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function debug() {
    console.log('--- Inspecting Columns of Commitments ---');
    const { data: cols, error } = await supabaseAdmin.from('commitments').select('*').limit(1);

    if (error) {
        console.error('Error selecting:', error);
    } else {
        const columns = Object.keys(cols[0] || {});
        console.log('Columns:', columns.join(', '));
    }

    console.log('\n--- Read-only schema check complete ---');
    console.log('No test rows are inserted or deleted by this diagnostic.');
}

debug();
