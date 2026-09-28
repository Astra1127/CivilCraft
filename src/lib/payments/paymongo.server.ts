import crypto from "node:crypto";
import type { PaymentProduct } from "./types.ts";

export interface PayMongoConfig {
  secretKey: string;
  webhookSecret: string;
  appUrl: string;
}

export function getPayMongoConfig(): PayMongoConfig {
  const secretKey = (process.env["PAYMONGO_SECRET_KEY"] || "").trim();
  const webhookSecret = (process.env["PAYMONGO_WEBHOOK_SECRET"] || "").trim();
  const appUrl = (
    process.env["PUBLIC_APP_URL"] ||
    process.env["PUBLIC_SITE_URL"] ||
    process.env["SITE_URL"] ||
    "http://localhost:5173"
  ).replace(/\/+$/, "");

  return { secretKey, webhookSecret, appUrl };
}

export function isPayMongoConfigured(): boolean {
  const { secretKey } = getPayMongoConfig();
  return Boolean(secretKey && secretKey.startsWith("sk_test_"));
}

export interface CreateCheckoutInput {
  orderId: string;
  product: PaymentProduct;
  playFabId: string;
  requestOrigin?: string;
}

export interface CreateCheckoutResult {
  checkoutId: string;
  checkoutUrl: string;
  referenceNumber: string;
}

export async function createPayMongoCheckout(
  input: CreateCheckoutInput,
): Promise<CreateCheckoutResult> {
  const { secretKey, appUrl } = getPayMongoConfig();
  if (!secretKey) {
    throw new Error("PayMongo secret key is not configured.");
  }
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("PayMongo live keys are not permitted in test mode.");
  }

  const baseOrigin = input.requestOrigin?.replace(/\/+$/, "") || appUrl;
  const successUrl = `${baseOrigin}/payment/success?order_id=${encodeURIComponent(input.orderId)}`;
  const cancelUrl = `${baseOrigin}/payment/cancel?order_id=${encodeURIComponent(input.orderId)}`;

  const payload = {
    data: {
      attributes: {
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        line_items: [
          {
            currency: input.product.currency,
            amount: input.product.amount, // in centavos
            name: input.product.name,
            quantity: 1,
            description: input.product.description,
          },
        ],
        payment_method_types: [
          "card",
          "gcash",
          "paymaya",
          "grab_pay",
          "dob",
          "dob_ubp",
        ],
        reference_number: input.orderId,
        description: input.product.name,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          orderId: input.orderId,
          productId: input.product.id,
          playFabId: input.playFabId,
        },
      },
    },
  };

  const basicAuth = Buffer.from(`${secretKey}:`).toString("base64");
  const response = await fetch("https://api.paymongo.com/v2/checkout_sessions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => null)) as {
    data?: {
      id?: string;
      attributes?: {
        checkout_url?: string;
        reference_number?: string;
      };
    };
    errors?: Array<{ detail?: string; code?: string }>;
  } | null;

  if (!response.ok || !body?.data?.attributes?.checkout_url) {
    const errorMsg =
      body?.errors?.[0]?.detail ||
      `PayMongo checkout session creation failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return {
    checkoutId: body.data.id || "",
    checkoutUrl: body.data.attributes.checkout_url,
    referenceNumber: body.data.attributes.reference_number || input.orderId,
  };
}

export type SignatureVerificationResult =
  | { valid: true; timestamp: number }
  | { valid: false; reason: "missing_signature" | "invalid_timestamp" | "stale_timestamp" | "signature_mismatch" };

export function verifyPayMongoSignature(params: {
  signatureHeader: string | null | undefined;
  rawBody: string;
  webhookSecret?: string;
  toleranceSeconds?: number;
}): SignatureVerificationResult {
  const {
    signatureHeader,
    rawBody,
    webhookSecret = getPayMongoConfig().webhookSecret,
    toleranceSeconds = 300,
  } = params;

  if (!signatureHeader || !signatureHeader.trim() || !webhookSecret) {
    return { valid: false, reason: "missing_signature" };
  }

  const parts = signatureHeader.split(",").map((p) => p.trim());
  let t: string | undefined;
  let te: string | undefined;

  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key === "t") t = val;
    else if (key === "te") te = val;
  }

  if (!t || !te) {
    return { valid: false, reason: "missing_signature" };
  }

  const timestamp = parseInt(t, 10);
  if (Number.isNaN(timestamp) || timestamp <= 0) {
    return { valid: false, reason: "invalid_timestamp" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return { valid: false, reason: "stale_timestamp" };
  }

  const payloadToSign = `${t}.${rawBody}`;
  const computedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(payloadToSign)
    .digest("hex");

  const computedBuf = Buffer.from(computedSignature, "utf8");
  const teBuf = Buffer.from(te, "utf8");

  if (computedBuf.length !== teBuf.length) {
    return { valid: false, reason: "signature_mismatch" };
  }

  const matches = crypto.timingSafeEqual(computedBuf, teBuf);
  if (!matches) {
    return { valid: false, reason: "signature_mismatch" };
  }

  return { valid: true, timestamp };
}
