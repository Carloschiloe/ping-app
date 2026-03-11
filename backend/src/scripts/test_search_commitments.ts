import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '.env') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function testSearch() {
    const q = "estacas";

    // Search commitments
    const { data: commitments, error: commError } = await supabase
        .from('commitments')
        .select('*, message:message_id(id, conversation_id)')
        .ilike('title', `%${q}%`)
        .limit(20);

    if (commError) {
        console.error("Error fetching commitments:", commError);
    } else {
        console.log("Commitments:", JSON.stringify(commitments, null, 2));
    }
}

testSearch();
