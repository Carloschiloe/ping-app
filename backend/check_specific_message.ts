import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '.env') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkMessage() {
    const messageId = "13cd5655-3c54-4e09-bedc-3a299e4c206d";

    const { data: message, error } = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single();

    if (error) {
        console.error("Error fetching message:", error);
    } else {
        console.log("Message:", JSON.stringify(message, null, 2));
    }
}

checkMessage();
