
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../../backend/.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
    const userId = '33cea535-c781-41ad-9b6e-a22762d44958';
    console.log(`Checking profile ${userId}...`);
    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('Profile NOT FOUND or Error:', error);
    } else {
        console.log('Profile FOUND!', data);
    }
}

check();
