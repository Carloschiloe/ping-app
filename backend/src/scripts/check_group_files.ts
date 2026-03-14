import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkGroups() {
    console.log('--- Checking Group Conversations ---');
    const { data: groups, error: gError } = await supabase
        .from('conversations')
        .select('id, name, is_group')
        .eq('is_group', true);

    if (gError) {
        console.error('Error fetching groups:', gError);
        return;
    }

    if (!groups || groups.length === 0) {
        console.log('No group conversations found.');
        return;
    }

    for (const group of groups) {
        console.log(`\nGroup: ${group.name} (${group.id})`);
        const { data: messages, error: mError } = await supabase
            .from('messages')
            .select('id, text, created_at, sender_id')
            .eq('conversation_id', group.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (mError) {
            console.error(`Error fetching messages for group ${group.id}:`, mError);
            continue;
        }

        if (!messages || messages.length === 0) {
            console.log('  No messages found.');
            continue;
        }

        messages.forEach(m => {
            const hasMedia = m.text.startsWith('[') && (m.text.includes('imagen') || m.text.includes('audio') || m.text.includes('video') || m.text.includes('document'));
            console.log(`  [${m.created_at}] ${m.sender_id.substring(0,8)}: ${m.text.substring(0, 50)}${m.text.length > 50 ? '...' : ''} ${hasMedia ? '📎 MEDIA' : ''}`);
        });
    }
}

checkGroups();
