export interface OnboardingEmailPayload {
  toName: string;
  toEmail: string;
  username: string;
  password: string;
  role: string;
}

interface EmailResult {
  ok: boolean;
  error?: string;
}

const WEBHOOK_URL = import.meta.env.VITE_BULK_PROVISION_WEBHOOK_URL as string | undefined;
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID as string | undefined;
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string | undefined;
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string | undefined;

export function hasEmailDeliveryConfig() {
  return Boolean(WEBHOOK_URL || (EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY));
}

async function sendViaWebhook(payload: OnboardingEmailPayload): Promise<EmailResult> {
  if (!WEBHOOK_URL) {
    return { ok: false, error: 'No webhook URL configured.' };
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'civilcraft-onboarding',
        ...payload,
      }),
    });

    if (!response.ok) {
      return { ok: false, error: 'Webhook email provider failed.' };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Webhook email request failed.' };
  }
}

async function sendViaEmailJs(payload: OnboardingEmailPayload): Promise<EmailResult> {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    return { ok: false, error: 'EmailJS is not fully configured.' };
  }

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_name: payload.toName,
          to_email: payload.toEmail,
          username: payload.username,
          default_password: payload.password,
          role: payload.role,
          login_url: window.location.origin,
        },
      }),
    });

    if (!response.ok) {
      return { ok: false, error: 'EmailJS rejected the request.' };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'EmailJS request failed.' };
  }
}

export async function sendOnboardingEmail(payload: OnboardingEmailPayload): Promise<EmailResult> {
  if (WEBHOOK_URL) {
    return sendViaWebhook(payload);
  }

  if (EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY) {
    return sendViaEmailJs(payload);
  }

  return {
    ok: false,
    error: 'No email delivery integration configured. Add webhook or EmailJS vars.',
  };
}
