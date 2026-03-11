
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../../backend/.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspect() {
    console.log('Inspecting commitments table...');
    const { data, error } = await supabase
        .from('commitments')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error selecting from commitments:', error);
    } else {
        console.log('Columns found:', Object.keys(data[0] || {}));
    }
}

inspect();
