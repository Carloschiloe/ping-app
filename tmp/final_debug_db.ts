import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debug() {
    console.log('--- DB INSPECTION ---');

    // 1. Get first user
    const { data: users } = await supabase.from('profiles').select('id').limit(1);
    if (!users || users.length === 0) {
        console.error('No users found');
        return;
    }
    const userId = users[0].id;
    console.log('Target User ID:', userId);

    // 2. Try raw insert and capture error
    const testCommitment = {
        title: 'Debug Task',
        status: 'accepted',
        priority: 'medium',
        due_at: new Date().toISOString(),
        owner_user_id: userId,
        assigned_to_user_id: userId
    };

    console.log('Testing insert of:', testCommitment);
    const { data, error } = await supabase.from('commitments').insert(testCommitment).select().single();

    if (error) {
        console.error('--- INSERT ERROR ---');
        console.error(JSON.stringify(error, null, 2));
    } else {
        console.log('Insert Success:', data.id);
    }
}

debug();
