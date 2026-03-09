import { supabase } from './src/lib/supabase';

async function checkSchema() {
    const { data, error } = await supabase.from('profiles').select('*').limit(1);
    if (error) {
        console.error('Error:', error);
        return;
    }
    if (data && data[0]) {
        console.log('Columns:', Object.keys(data[0]));
    } else {
        console.log('No data found in profiles');
    }
}

checkSchema();
