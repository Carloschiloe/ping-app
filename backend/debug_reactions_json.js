
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugReactions() {
    const { data: messages, error } = await supabase
        .from('messages')
        .select('*, message_reactions(*, profiles:user_id(id, email))')
        .not('message_reactions', 'is', null)
        .limit(5);

    if (error) {
        console.error('Error:', error);
    } else {
        // Filter out messages without actual reactions if the join returned empty list
        const withReactions = messages.filter(m => m.message_reactions && m.message_reactions.length > 0);
        console.log('REACTIONS_DATA_START');
        console.log(JSON.stringify(withReactions, null, 2));
        console.log('REACTIONS_DATA_END');
    }
}

debugReactions();
