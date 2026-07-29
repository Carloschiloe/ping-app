import { describe, expect, it } from 'vitest';
import { parseAuthRedirectUrl } from '../src/utils/authRedirect';

describe('callback de verificación Auth', () => {
    it('extrae una sesión implícita desde el fragmento sin registrar la URL', () => {
        expect(parseAuthRedirectUrl(
            'ping-staging://auth/callback#access_token=access-value&refresh_token=refresh-value&type=signup'
        )).toEqual({
            accessToken: 'access-value',
            refreshToken: 'refresh-value',
            code: null,
            errorCode: null,
            type: 'signup',
        });
    });

    it('acepta un callback PKCE con código', () => {
        expect(parseAuthRedirectUrl(
            'ping-staging://auth/callback?code=pkce-value&type=signup'
        )).toEqual({
            accessToken: null,
            refreshToken: null,
            code: 'pkce-value',
            errorCode: null,
            type: 'signup',
        });
    });

    it('ignora enlaces ajenos a Auth y conserva errores sin datos sensibles', () => {
        expect(parseAuthRedirectUrl('ping-staging://chat/123')).toBeNull();
        expect(parseAuthRedirectUrl(
            'ping-staging://auth/callback?error_code=otp_expired&type=signup'
        )?.errorCode).toBe('otp_expired');
    });
});
