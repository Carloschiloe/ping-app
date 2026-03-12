import { RtcTokenBuilder, RtcRole } from 'agora-token';
import axios from 'axios';

const APP_ID = (process.env.AGORA_APP_ID || '').trim();
const APP_CERTIFICATE = (process.env.AGORA_APP_CERTIFICATE || '').trim();
const AGORA_REST_ID = (process.env.AGORA_REST_ID || '').trim();
const AGORA_REST_SECRET = (process.env.AGORA_REST_SECRET || '').trim();

const getAuthHeader = () => {
    return {
        Authorization: `Basic ${Buffer.from(`${AGORA_REST_ID}:${AGORA_REST_SECRET}`).toString('base64')}`,
    };
};

export const generateRtcToken = (channelName: string, userId: string): string => {
    if (!APP_ID || !APP_CERTIFICATE) {
        throw new Error('AGORA_APP_ID or AGORA_APP_CERTIFICATE is missing');
    }

    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const uid = 0;

    const token = RtcTokenBuilder.buildTokenWithUid(
        APP_ID,
        APP_CERTIFICATE,
        channelName,
        uid,
        RtcRole.PUBLISHER,
        privilegeExpiredTs,
        privilegeExpiredTs
    );

    return token;
};

/**
 * Stage 1: Acquire Resource ID
 */
export const acquireResource = async (channelName: string, uid: number): Promise<string> => {
    try {
        const url = `https://api.agora.io/v1/apps/${APP_ID}/cloud_recording/acquire`;
        const response = await axios.post(
            url,
            {
                cname: channelName,
                uid: uid.toString(),
                clientRequest: { resourceExpiredHour: 24 },
            },
            { headers: getAuthHeader() }
        );
        return response.data.resourceId;
    } catch (error: any) {
        if (error.response) {
            console.error('[Agora Service] acquireResource failed:', error.response.status, error.response.data);
            throw new Error(`Agora Acquire Error [${error.response.status}]: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
};

/**
 * Stage 2: Start Recording
 */
export const startRecording = async (
    resourceId: string,
    channelName: string,
    uid: number,
    token: string
): Promise<string> => {
    try {
        const url = `https://api.agora.io/v1/apps/${APP_ID}/cloud_recording/resourceid/${resourceId}/mode/mix/start`;

        // Supabase S3 Config
        const regionStr = process.env.SUPABASE_S3_REGION || 'us-east-1';
        let regionNum = 0; // default US_EAST_1
        if (regionStr === 'us-east-2') regionNum = 1;
        if (regionStr === 'us-west-1') regionNum = 2;
        if (regionStr === 'us-west-2') regionNum = 3;

        const storageConfig = {
            vendor: 1, // AWS S3
            region: regionNum,
            bucket: process.env.SUPABASE_S3_BUCKET || 'recordings',
            accessKey: process.env.SUPABASE_S3_ACCESS_KEY,
            secretKey: process.env.SUPABASE_S3_SECRET_KEY,
            endpoint: process.env.SUPABASE_S3_ENDPOINT,
            fileNamePrefix: ['calls', channelName],
        };

        const response = await axios.post(
            url,
            {
                cname: channelName,
                uid: uid.toString(),
                clientRequest: {
                    token,
                    recordingConfig: {
                        maxIdleTime: 30,
                        streamTypes: 1, // Audio only
                        channelType: 0,
                    },
                    storageConfig,
                },
            },
            { headers: getAuthHeader() }
        );
        return response.data.sid;
    } catch (error: any) {
        if (error.response) {
            console.error('[Agora Service] startRecording failed:', error.response.status, error.response.data);
            throw new Error(`Agora Start Error [${error.response.status}]: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
    }
};

/**
 * Stage 3: Stop Recording
 */
export const stopRecording = async (
    resourceId: string,
    sid: string,
    channelName: string,
    uid: number
): Promise<any> => {
    const url = `https://api.agora.io/v1/apps/${APP_ID}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/mix/stop`;
    const response = await axios.post(
        url,
        {
            cname: channelName,
            uid: uid.toString(),
            clientRequest: {},
        },
        { headers: getAuthHeader() }
    );
    return response.data;
};
