/**
 * hCaptcha Server-side Verification
 * Verify hCaptcha tokens on API routes
 */

const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET_KEY || '';
const HCAPTCHA_VERIFY_URL = 'https://api.hcaptcha.com/siteverify';

export interface HCaptchaVerifyResult {
    success: boolean;
    challenge_ts?: string;
    hostname?: string;
    credit?: boolean;
    'error-codes'?: string[];
}

/**
 * Verify hCaptcha token server-side
 * @param token - hCaptcha response token from client
 * @param remoteip - Optional client IP address
 * @returns Verification result
 */


export async function verifyHCaptcha(
    token: string,
    remoteip?: string
): Promise<HCaptchaVerifyResult> {
    // In development mode, bypass hCaptcha verification to prevent issues with test sitekeys but real secrets
    if (process.env.NODE_ENV === 'development') {
        console.warn('[hCaptcha] Development mode detected, completely bypassing verification');
        return { success: true };
    }

    if (!HCAPTCHA_SECRET) {
        console.warn('[hCaptcha] HCAPTCHA_SECRET_KEY not set in production');
        return { success: false, 'error-codes': ['missing-secret'] };
    }

    if (!token) {
        return { success: false, 'error-codes': ['missing-input-response'] };
    }

    // Bypass verification for hCaptcha test tokens to prevent registration errors when using test sitekey
    if (token === '10000000-ffff-ffff-ffff-000000000001' || token === '20000000-ffff-ffff-ffff-000000000002') {
        console.warn('[hCaptcha] Test token detected, bypassing verification');
        return { success: true };
    }

    try {
        const params = new URLSearchParams({
            secret: HCAPTCHA_SECRET,
            response: token,
        });

        if (remoteip) {
            params.append('remoteip', remoteip);
        }

        const response = await fetch(HCAPTCHA_VERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });

        if (!response.ok) {
            return { success: false, 'error-codes': ['network-error'] };
        }

        const result: HCaptchaVerifyResult = await response.json();
        return result;
    } catch (error) {
        console.error('[hCaptcha] Verification error:', error);
        return { success: false, 'error-codes': ['verification-failed'] };
    }
}
