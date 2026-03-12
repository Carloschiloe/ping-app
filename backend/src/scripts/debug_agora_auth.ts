import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/carlo/Desktop/App en produccion/Ping/backend/.env' });

const APP_ID = process.env.AGORA_APP_ID;
const REST_ID = process.env.AGORA_REST_ID;
const REST_SECRET = process.env.AGORA_REST_SECRET;

console.log('Testing Agora Auth:');
console.log('App ID:', APP_ID);
console.log('REST ID:', REST_ID);
console.log('REST Secret:', REST_SECRET ? '***' + REST_SECRET.slice(-4) : 'MISSING');

const getAuthHeader = () => {
    return {
        Authorization: `Basic ${Buffer.from(`${REST_ID}:${REST_SECRET}`).toString('base64')}`,
    };
};

async function testAuth() {
    try {
        const url = `https://api.agora.io/v1/apps/${APP_ID}/cloud_recording/acquire`;
        const response = await axios.post(
            url,
            {
                cname: 'debug_test_channel',
                uid: '123456',
                clientRequest: { resourceExpiredHour: 24 },
            },
            { headers: getAuthHeader() }
        );
        console.log('SUCCESS! Resource ID:', response.data.resourceId);
    } catch (error: any) {
        if (error.response) {
            console.error('FAILED!', error.response.status, JSON.stringify(error.response.data));
        } else {
            console.error('FAILED!', error.message);
        }
    }
}

testAuth();
