
const fetch = require('node-fetch');

async function testLocalApi() {
    try {
        const res = await fetch('http://localhost:3000/api/health').catch(() => null);
        console.log('Local Server Status:', res ? res.status : 'OFFLINE');

        // Test a message fetch if possible (would need token, but let's just check reachability)
        const res2 = await fetch('http://192.168.1.15:3000/api/conversations').catch(() => null);
        console.log('Local IP Reachability:', res2 ? 'OK' : 'FAILED');
    } catch (e) {
        console.error(e);
    }
}

testLocalApi();
