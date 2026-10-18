import { supabaseAdmin } from '../lib/supabaseAdmin';

async function check() {
    const { data, error } = await supabaseAdmin.from('profiles').select('id').neq('expo_push_token', null);
    if (error) {
        console.error('[check_tokens] Query failed', { code: error.code });
        return;
    }
    console.log(`Profiles with push tokens: ${data?.length ?? 0}`);
}

check();
