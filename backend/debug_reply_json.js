
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugData() {
    const { data: messages, error } = await supabase
        .from('messages')
        .select('*, profiles!sender_id(id, email), message_reactions(*), reply_to:messages!reply_to_id(id, text, profiles!sender_id(email))')
        .not('reply_to_id', 'is', null)
        .limit(3);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('DATA_START');
        console.log(JSON.stringify(messages, null, 2));
        console.log('DATA_END');
    }
}

debugData();
