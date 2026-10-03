import path from 'node:path';
import { createHmac } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const baseUrl = (process.env.M8_DIAGNOSTIC_BASE_URL || 'https://ping-backend-staging.onrender.com/api').replace(/\/+$/, '');
const timestamp = String(Date.now());
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!key) throw new Error('Missing server diagnostic capability');
const signature = createHmac('sha256', key).update(`m8-live-telemetry/latest:${timestamp}`).digest('hex');
const response = await fetch(`${baseUrl}/agent/voice/live/telemetry/internal/latest`, {
    headers: {
        'X-Ping-Diagnostic-Timestamp': timestamp,
        'X-Ping-Diagnostic-Signature': signature,
    },
});
const body = await response.text();
if (!response.ok) throw new Error(`Diagnostic request failed with HTTP ${response.status}: ${body.slice(0, 160)}`);
console.log(body);
