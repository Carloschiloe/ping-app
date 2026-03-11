import { supabaseAdmin } from '../lib/supabaseAdmin';

async function check() {
    const { data, error } = await supabaseAdmin.from('profiles').select('email, full_name, expo_push_token').neq('expo_push_token', null);
    console.log(JSON.stringify(data, null, 2));
    if (error) console.error(error);
}

check();
