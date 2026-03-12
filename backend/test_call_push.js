const { config } = require('dotenv'); config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

async function run() {
    console.log('Starting push test...');
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: users, error } = await admin.from('profiles').select('expo_push_token').not('expo_push_token', 'is', null);
    if (error) { console.error('DB Error:', error); return; }

    const tokens = users.map(u => u.expo_push_token).filter(t => t && t.startsWith('ExponentPushToken'));
    console.log('Valid push tokens found:', tokens.length);
    if (tokens.length === 0) return;

    try {
        const testPayload = tokens.map(t => ({
            to: t,
            title: 'Test Llamada de Voz',
            body: 'Probando Voice Call',
            sound: 'default',
            priority: 'high',
            channelId: 'calls',
            categoryId: 'incoming_call',
            data: { type: 'incoming_call', conversationId: '123' }
        }));

        console.log('Sending payload:', JSON.stringify(testPayload[0], null, 2));

        const res = await axios.post('https://exp.host/--/api/v2/push/send', testPayload, {
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
        });
        console.log('EXPO SUCCESS:', JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error('EXPO ERROR:', e.response ? e.response.data : e.message);
    }
}
run();
