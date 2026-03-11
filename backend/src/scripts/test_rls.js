
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function testRls() {
    const { data, error } = await supabase.from('message_reactions').select('*').limit(5);
    if (error) {
        console.error('RLS BLOCK:', error.message);
    } else {
        console.log('RLS ALLOWED:', data.length, 'reactions found');
    }
}

testRls();
