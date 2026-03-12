const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Extract from .env manually to avoid dotenv issues
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

const getVal = (key) => {
    const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1].trim() : '';
};

const APP_ID = getVal('AGORA_APP_ID');
const REST_ID = getVal('AGORA_REST_ID');
const REST_SECRET = getVal('AGORA_REST_SECRET');

console.log('--- Agora Credential Test ---');
console.log('App ID:', APP_ID);
console.log('REST ID:', REST_ID);
console.log('REST Secret Length:', REST_SECRET.length);

const auth = Buffer.from(`${REST_ID}:${REST_SECRET}`).toString('base64');
const headers = { 'Authorization': `Basic ${auth}` };

async function test() {
    try {
        console.log('Sending acquire request...');
        const response = await axios.post(
            `https://api.agora.io/v1/apps/${APP_ID}/cloud_recording/acquire`,
            {
                cname: 'test_channel',
                uid: '123456',
                clientRequest: { resourceExpiredHour: 24 }
            },
            { headers }
        );
        console.log('SUCCESS! Resource ID:', response.data.resourceId);
    } catch (err) {
        if (err.response) {
            console.error('FAILED with status:', err.response.status);
            console.error('Response Data:', JSON.stringify(err.response.data));
        } else {
            console.error('ERROR:', err.message);
        }
    }
}

test();
