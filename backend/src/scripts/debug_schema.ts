
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

    console.log('\n--- Testing Insert with Minimal Payload ---');
    const userId = '33cea535-c781-41ad-9b6e-a22762d44958'; // User from logs
    const testPayload = {
        title: 'TEST SCHEMA',
        owner_user_id: userId,
        status: 'pending'
    };

    const { data: ins, error: insErr } = await supabaseAdmin.from('commitments').insert(testPayload).select().single();
    if (insErr) {
        console.error('Insert Failed:', insErr);
    } else {
        console.log('Insert Worked! ID:', ins.id);
        // Clean up
        await supabaseAdmin.from('commitments').delete().eq('id', ins.id);
    }
}

debug();
