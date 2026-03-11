import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '.env') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function findSharedCommitment() {
    const { data: commitments, error } = await supabase
        .from('commitments')
        .select('*, message:message_id!inner(id, conversation_id, text)')
        .not('message.conversation_id', 'is', null)
        .limit(1);

    console.log("Shared Commitment:", JSON.stringify(commitments, null, 2));
}

findSharedCommitment();
