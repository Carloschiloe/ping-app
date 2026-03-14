import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findMedia() {
    console.log('--- Searching for media in ALL groups ---');
    
    // 1. Get all group conversations
    const { data: groups } = await supabase.from('conversations').select('id, name').eq('is_group', true);
    
    if (!groups || groups.length === 0) {
        console.log('No groups found.');
        return;
    }

    for (const group of groups) {
        console.log(`Checking group: ${group.name} (${group.id})`);
        
        const { data: messages } = await supabase
            .from('messages')
            .select('id, text, created_at')
            .eq('conversation_id', group.id)
            .ilike('text', '[%'); // Start with [

        if (messages && messages.length > 0) {
            messages.forEach(m => {
                 if (m.text.includes('imagen') || m.text.includes('audio') || m.text.includes('video') || m.text.includes('document')) {
                     console.log(`  Found media: ${m.text.substring(0, 100)} (ID: ${m.id})`);
                 }
            });
        } else {
            console.log('  No media-like messages found.');
        }
    }
}

findMedia();
