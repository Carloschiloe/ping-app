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
        .select('*')
        .ilike('title', `%${q}%`);

    console.log("ALL Commitments containing 'estacas':", JSON.stringify(commitments, null, 2));

    // Search messages directly
    const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .ilike('text', `%${q}%`);

    console.log("ALL Messages containing 'estacas':", JSON.stringify(messages, null, 2));
}

checkAllEstacas();
