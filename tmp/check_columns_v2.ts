
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // Use service role for schema info

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
    const { data, error } = await supabase
        .from('commitments')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching commitments:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('Columns in commitments:', Object.keys(data[0]));
    } else {
        // Fallback: try to insert a dummy record and rollback or just query rpc if available
        console.log('No data in commitments table to check columns via select.');
    }
}

checkColumns();
