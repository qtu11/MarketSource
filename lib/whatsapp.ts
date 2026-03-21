import { logger } from './logger';

type TwilioEnv = {
  accountSid: string;
  authToken: string;
  whatsappNumber: string;
};

type SendWhatsAppParams = {
  to: string;
  body: string;
};

function getTwilioEnv(): TwilioEnv {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !whatsappNumber) {
    throw new Error('Missing Twilio configuration in environment variables');
  }

  return { accountSid, authToken, whatsappNumber };
}

const formatWhatsAppNumber = (num: string) => num.startsWith('whatsapp:') ? num : `whatsapp:${num}`;

export async function sendWhatsAppMessage({ to, body }: SendWhatsAppParams) {
  const { accountSid, authToken, whatsappNumber } = getTwilioEnv();

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: formatWhatsAppNumber(whatsappNumber),
      To: formatWhatsAppNumber(to),
      Body: body,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    const error = new Error(`Twilio API error: ${response.status} ${response.statusText} - ${details}`);
    logger.error('WhatsApp send failed', error);
    return null; // ✅ FIX: Trả về null thay vì throw Error để không làm sập flow chính (vd: tạo deposit)
  }

  return response.json() as Promise<unknown>;
}
