require('dotenv').config();
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log('\n=== STEP 1: Get all push tokens ===');
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name, expo_push_token')
        .not('expo_push_token', 'is', null);

    if (error) { console.error('DB error:', error); return; }
    console.log('Profiles with tokens:', JSON.stringify(profiles, null, 2));

    if (!profiles?.length) { console.log('NO TOKENS FOUND - cannot test'); return; }

    console.log('\n=== STEP 2: Send test push via Expo ===');
    const messages = profiles.map(p => ({
        to: p.expo_push_token,
        title: '🧪 TEST PUSH',
        body: `Hola ${p.full_name} - directo desde test script`,
        sound: 'default',
        priority: 'high',
        data: {
            type: 'incoming_call',
            conversationId: 'dba12946-ab68-4920-be82-f11faf5d9f09',
            callType: 'voice',
            callerName: 'Test Script',
        },
    }));

    const body = JSON.stringify(messages);
    const options = {
        hostname: 'exp.host',
        path: '/--/api/v2/push/send',
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
        },
    };

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
            console.log('Expo response status:', res.statusCode);
            const result = JSON.parse(data);
            console.log('Expo response:', JSON.stringify(result, null, 2));

            // Check for errors
            if (result.data) {
                result.data.forEach((item, i) => {
                    if (item.status === 'error') {
                        console.error(`\n❌ PUSH FAILED for token ${profiles[i].expo_push_token}:`);
                        console.error('  Error:', item.message);
                        console.error('  Details:', item.details);
                    } else {
                        console.log(`\n✅ Push sent OK to ${profiles[i].full_name} (${profiles[i].expo_push_token})`);
                        console.log('  Receipt ID:', item.id);
                    }
                });
            }
        });
    });

    req.on('error', e => console.error('Request error:', e.message));
    req.write(body);
    req.end();

    console.log('\n=== STEP 3: Test Supabase Realtime broadcast ===');
    const channel = supabase.channel('calls:user:33cea535-c781-41ad-9b6e-a22762d44958');
    const status = await new Promise(resolve => {
        channel.subscribe(s => resolve(s));
        setTimeout(() => resolve('TIMEOUT'), 5000);
    });
    console.log('Realtime subscribe status:', status);

    if (status === 'SUBSCRIBED') {
        const sendResult = await channel.send({
            type: 'broadcast',
            event: 'incoming_call',
            payload: {
                type: 'incoming_call',
                conversationId: 'dba12946-ab68-4920-be82-f11faf5d9f09',
                callType: 'voice',
                callerName: 'Test Script',
            },
        });
        console.log('Realtime send result:', sendResult);
    }

    setTimeout(() => process.exit(0), 3000);
}

main().catch(console.error);
