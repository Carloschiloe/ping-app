import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '.env') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkAllEstacas() {
    const q = "estacas";

    // Search commitments
    const { data: commitments, error: commError } = await supabase
        .from('commitments')
        .select('id')
        .ilike('title', `%${q}%`);

    console.log("Commitments matching 'estacas':", commitments?.length ?? 0);
    if (commError) console.error('[check_estacas] Commitment query failed', { code: commError.code });

    // Search messages directly
    const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('id')
        .ilike('text', `%${q}%`);

    console.log("Messages matching 'estacas':", messages?.length ?? 0);
    if (msgError) console.error('[check_estacas] Message query failed', { code: msgError.code });
}

checkAllEstacas();
