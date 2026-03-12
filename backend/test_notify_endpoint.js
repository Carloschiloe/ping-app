// Test the REAL endpoint on Render with a real auth token
require('dotenv').config();
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log('=== Testing live /api/agora/call/notify endpoint ===\n');

    // Sign in as Carlos to get a real JWT token
    const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: session, error: authErr } = await anonClient.auth.signInWithPassword({
        email: process.env.TEST_EMAIL || 'carlos@marvex.cl',
        password: process.env.TEST_PASS || 'test1234',
    });

    if (authErr) {
        console.error('Auth failed:', authErr.message);
        console.log('\n--- Testing without auth (should get 401) ---');
    }

    const token = session?.session?.access_token || 'no-token';
    console.log('Auth token:', token.slice(0, 20) + '...');

    // Call the real endpoint
    const body = JSON.stringify({
        conversationId: 'dba12946-ab68-4920-be82-f11faf5d9f09',
        callType: 'voice',
    });

    const options = {
        hostname: 'ping-app-con3.onrender.com',
        path: '/api/agora/call/notify',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Content-Length': Buffer.byteLength(body),
        },
    };

    console.log('\nPOST https://ping-app-con3.onrender.com/api/agora/call/notify');

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
            console.log('Status:', res.statusCode);
            console.log('Response:', data);

            if (res.statusCode === 200) {
                const parsed = JSON.parse(data);
                console.log('\n✅ Success!');
                console.log('  Notified:', parsed.notified, 'users');
                console.log('  Call ID:', parsed.callId);
            } else {
                console.log('\n❌ Failed with status:', res.statusCode);
            }
        });
    });

    req.on('error', e => console.error('Request error:', e.message));
    req.write(body);
    req.end();
}

main().catch(console.error);
