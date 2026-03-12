const https = require('https');
const fs = require('fs');
const path = require('path');

// Extract from .env manually to avoid dotenv issues
const envPath = path.join(__dirname, '..', '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

const getVal = (key) => {
    const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1].trim() : '';
};

const APP_ID = getVal('AGORA_APP_ID');
const REST_ID = getVal('AGORA_REST_ID');
const REST_SECRET = getVal('AGORA_REST_SECRET');

console.log('--- Agora Credential Test (Native HTTPS) ---');
console.log('App ID:', APP_ID);
console.log('REST ID:', REST_ID);
console.log('REST Secret:', REST_SECRET.substring(0, 4) + '...');

const auth = Buffer.from(`${REST_ID}:${REST_SECRET}`).toString('base64');

const data = JSON.stringify({
    cname: 'debug_test_channel',
    uid: '123456',
    clientRequest: { resourceExpiredHour: 24 }
});

const options = {
    hostname: 'api.agora.io',
    port: 443,
    path: `/v1/apps/${APP_ID}/cloud_recording/acquire`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': `Basic ${auth}`
    }
};

const req = https.request(options, (res) => {
    console.log('StatusCode:', res.statusCode);
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
        console.log('Response:', body);
        if (res.statusCode === 201 || res.statusCode === 200) {
            console.log('SUCCESS!');
        } else {
            console.log('FAILED!');
        }
    });
});

req.on('error', (error) => {
    console.error('Request Error:', error);
});

req.write(data);
req.end();
