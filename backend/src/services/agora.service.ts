
import { RtcTokenBuilder, RtcRole } from 'agora-token';

const APP_ID = process.env.AGORA_APP_ID || '';
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || '';

export const generateRtcToken = (channelName: string, userId: string): string => {
    if (!APP_ID || !APP_CERTIFICATE) {
        throw new Error('AGORA_APP_ID or AGORA_APP_CERTIFICATE is missing');
    }

    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Use string userId as UID if it's numeric, otherwise we might need a mapping.
    // Agora RTC usually prefers numeric UIDs. For string IDs, we can use 0 
    // and let Agora handle it, or hash the string to a number.
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
