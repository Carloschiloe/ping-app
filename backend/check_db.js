
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkReactions() {
    try {
        const { data, error } = await supabase.from('message_reactions').select('*').limit(10);
        if (error) {
            console.error('Error fetching reactions:', error);
        } else {
            console.log('REACTION_DATA_START');
            console.log(JSON.stringify(data, null, 2));
            console.log('REACTION_DATA_END');
        }
    } catch (e) {
        console.error('Script error:', e);
    }
}

checkReactions();
