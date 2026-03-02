
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkApi() {
    // Find a message_id that has reactions
    const { data: react } = await supabase.from('message_reactions').select('message_id').limit(1).single();
    if (!react) {
        console.log('No reactions found in DB');
        return;
    }

    const { data: messages, error } = await supabase
        .from('messages')
        .select('*, profiles!sender_id(id, email), message_reactions(*)')
        .eq('id', react.message_id);

    if (error) {
        console.error('Error fetching API simulation:', error);
    } else {
        console.log('API_DATA_START');
        console.log(JSON.stringify(messages, null, 2));
        console.log('API_DATA_END');
    }
}

checkApi();
