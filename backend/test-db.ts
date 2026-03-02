import { supabaseAdmin } from './src/lib/supabaseAdmin';

async function test() {
    console.log("Testing DB columns...");
    const { data, error } = await supabaseAdmin
        .from('conversations')
        .select('id, is_group, name, admin_id')
        .limit(1);

    console.log("Result:", { data, error });

    const { data: session } = await supabaseAdmin.auth.admin.listUsers();
    console.log("Users:", session?.users?.length);
}

test();
