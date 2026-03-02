
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkReplies() {
    const { data, error } = await supabase
        .from('messages')
        .select('*, profiles!sender_id(email), reply_to:messages!reply_to_id(text, profiles!sender_id(email))')
        .not('reply_to_id', 'is', null)
        .limit(5);

    if (error) {
        console.error('Error fetching replies:', error);
    } else {
        console.log('REPLY_DATA_START');
        console.log(JSON.stringify(data, null, 2));
        console.log('REPLY_DATA_END');
    }
}

checkReplies();
