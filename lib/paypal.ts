export const DOWNLOAD_PRICE = "10.00";
export const DOWNLOAD_CURRENCY = "USD";
export const DOWNLOAD_ONCE_COOKIE = "download_once";
export const ORDER_COOKIE = "paypal_order";

export function paypalApiBase(): string {
  return process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function appBaseUrl(): string {
  const explicit = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (explicit) {
    return explicit;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

async function accessToken(): Promise<string> {
  const client = requiredEnv("PAYPAL_CLIENT_ID");
  const secret = requiredEnv("PAYPAL_CLIENT_SECRET");
  const auth = Buffer.from(`${client}:${secret}`).toString("base64");

  const response = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const body = (await response.json()) as { access_token?: string };
  if (!response.ok || !body.access_token) {
    throw new Error("Could not connect to PayPal.");
  }
  return body.access_token;
}

type PayPalLink = { href?: string; rel?: string };
type CreateOrderResponse = { id?: string; links?: PayPalLink[] };

export async function createCheckoutOrder(): Promise<{
  id: string;
  approveUrl: string;
}> {
  const token = await accessToken();
  const base = appBaseUrl();

  const response = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          description: "Video download",
          amount: {
            currency_code: DOWNLOAD_CURRENCY,
            value: DOWNLOAD_PRICE,
          },
        },
      ],
      application_context: {
        brand_name: "Watch video",
        landing_page: "NO_PREFERENCE",
        user_action: "PAY_NOW",
        return_url: `${base}/api/paypal/capture`,
        cancel_url: `${base}/?canceled=1`,
      },
    }),
    cache: "no-store",
  });

  const body = (await response.json()) as CreateOrderResponse;
  const approveUrl = body.links?.find((link) => link.rel === "approve")?.href;
  if (!response.ok || !body.id || !approveUrl) {
    throw new Error("Could not start PayPal checkout.");
  }

  return { id: body.id, approveUrl };
}

type CaptureResponse = {
  status?: string;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        status?: string;
        amount?: { value?: string; currency_code?: string };
      }>;
    };
  }>;
};

export async function captureCheckoutOrder(orderId: string): Promise<void> {
  const token = await accessToken();
  const response = await fetch(
    `${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );

  const body = (await response.json()) as CaptureResponse;
  const capture = body.purchase_units?.[0]?.payments?.captures?.[0];
  const amountOk =
    capture?.amount?.value === DOWNLOAD_PRICE &&
    capture.amount.currency_code === DOWNLOAD_CURRENCY;
  const paid =
    response.ok &&
    (body.status === "COMPLETED" || capture?.status === "COMPLETED") &&
    amountOk;

  if (!paid) {
    throw new Error("Payment was not completed.");
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}
