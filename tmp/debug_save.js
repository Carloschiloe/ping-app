
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debug() {
    console.log('URL:', process.env.SUPABASE_URL);
    const userId = '33cea535-c781-41ad-9b6e-a22762d44958';
    const mockData = {
        "assigned_to_user_id": userId,
        "due_at": "2026-03-12T18:31:23.445Z",
        "status": "accepted",
        "title": "TEST: Mañana retirar salmones",
        "owner_user_id": userId
    };

    console.log('--- Testing Database Insert Directly ---');
    const { data, error } = await supabase
        .from('commitments')
        .insert(mockData)
        .select()
        .single();

    if (error) {
        console.error('Insert Failed:', error);
    } else {
        console.log('Insert Success!', data);
    }
}

debug();
