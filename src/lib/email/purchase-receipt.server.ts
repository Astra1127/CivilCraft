import nodemailer from "nodemailer";
import { z } from "zod";
import { getGmailSmtpConfig } from "./gmail-smtp.server.ts";
import { resolvePublicSiteUrl } from "./contact-resend.server.ts";
import { getPlayerContactVerification } from "../playfab/player-verification.server.ts";
import { AdminApiError, object, playFabAdmin } from "../playfab/admin-client.server.ts";
import {
  currencyLabel,
  formatProductPrice,
  getProduct,
  normalizeOrderReward,
} from "../payments/products.ts";
import {
  getReceiptEmailClaim,
  hasReceiptEmailClaim,
  recordReceiptEmailClaim,
  saveReceiptEmailClaim,
  updateOrderStatus,
} from "../payments/orders.server.ts";
import { isPayMongoTestMode } from "../payments/paymongo.server.ts";
import type { PaymentOrder } from "../payments/types.ts";

export interface PurchaseReceiptRenderInput {
  order: PaymentOrder;
  recipientEmail: string;
  playerName?: string | undefined;
  paymentMethod?: string | null | undefined;
  paymentReference?: string | null | undefined;
  isTestMode?: boolean | undefined;
  origin?: string | undefined;
  supportEmail?: string | undefined;
}

export interface RenderedReceiptEmail {
  subject: string;
  text: string;
  html: string;
}

export interface SendPurchaseReceiptResult {
  success: boolean;
  skipped?: boolean | undefined;
  reason?:
    | "already_sent"
    | "already_claimed"
    | "in_flight"
    | "missing_email"
    | "unverified_email"
    | "smtp_not_configured"
    | undefined;
  sentAt?: string | undefined;
  error?: string | undefined;
}

/** In-memory mutex to prevent concurrent in-process webhook executions from sending duplicate emails. */
const inFlightReceipts = new Set<string>();

/**
 * Resolves the official Civil Craft support email address.
 * Prioritizes:
 * 1. Environment variable SUPPORT_EMAIL
 * 2. Title Internal Data ("civilcraft.website.v1.contact-settings" -> supportEmail)
 * 3. Official monitored inbox fallback: "support@civilcraft.game"
 */
export async function resolveSupportEmail(): Promise<string> {
  const envEmail = process.env["SUPPORT_EMAIL"]?.trim();
  if (envEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(envEmail)) {
    return envEmail;
  }
  try {
    const res = await playFabAdmin("Admin/GetTitleInternalData", {
      Keys: ["civilcraft.website.v1.contact-settings"],
    });
    const data = object(res["Data"]);
    const raw = data["civilcraft.website.v1.contact-settings"];
    if (raw && typeof raw === "string") {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.supportEmail === "string" && parsed.supportEmail.trim()) {
        return parsed.supportEmail.trim();
      }
    }
  } catch {
    /* fallback to official support email */
  }
  return "support@civilcraft.game";
}

const escapeHtml = (value: string | number) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

export function formatPaymentMethod(method?: string | null): string {
  if (!method) return "Online Payment";
  const m = method.toLowerCase().trim();
  switch (m) {
    case "gcash":
      return "GCash";
    case "paymaya":
    case "maya":
      return "Maya";
    case "card":
    case "credit_card":
    case "debit_card":
      return "Credit / Debit Card";
    case "qrph":
    case "qr_code":
      return "QR Ph";
    case "grab_pay":
    case "grabpay":
      return "GrabPay";
    case "dob":
      return "BPI Online Banking";
    case "dob_ubp":
      return "UnionBank Online Banking";
    default:
      return method.charAt(0).toUpperCase() + method.slice(1).replace(/_/g, " ");
  }
}

export function formatReceiptDate(dateString?: string | null): string {
  const date = dateString ? new Date(dateString) : new Date();
  if (isNaN(date.getTime())) return new Date().toUTCString();
  try {
    return (
      date.toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }) + " UTC"
    );
  } catch {
    return date.toUTCString();
  }
}

/**
 * Builds the branded Civil Craft purchase receipt HTML and plain-text body.
 * Adheres strictly to Civil Craft palette (#F3E7D1, #FCF6EC, #4A3428, #4E372C, #C58A42).
 */
export function renderPurchaseReceiptEmail(
  input: PurchaseReceiptRenderInput,
): RenderedReceiptEmail {
  const { order, recipientEmail } = input;
  const reward = normalizeOrderReward(order);
  const isTest = input.isTestMode ?? isPayMongoTestMode();
  const origin = resolvePublicSiteUrl(input.origin);
  const supportEmail = input.supportEmail?.trim() || "support@civilcraft.game";
  const dashboardUrl = `${origin}/dashboard`;
  const transactionsUrl = `${origin}/dashboard/transactions`;

  const playerName = input.playerName?.trim() || "Engineer";
  const product = getProduct(order.productId);
  const packageName =
    product?.name ||
    `${reward.rewardAmount.toLocaleString()} Civil Craft ${currencyLabel(reward.rewardCurrency)}`;
  const currencyName = currencyLabel(reward.rewardCurrency);
  const formattedQuantity = `${reward.rewardAmount.toLocaleString()} ${currencyName}`;
  const formattedPrice = formatProductPrice(order.expectedAmount, order.currency);
  const purchaseDate = formatReceiptDate(order.paidAt || order.fulfilledAt || order.createdAt);
  const paymentMethodDisplay = formatPaymentMethod(input.paymentMethod || order.paymentMethod);
  const paymentReference =
    input.paymentReference?.trim() ||
    order.paymentReference?.trim() ||
    order.PayMongoReferenceNumber ||
    "—";

  const emailSubject = isTest
    ? `Civil Craft — Purchase Confirmation [TEST MODE]: ${order.orderId}`
    : `Civil Craft — Payment Receipt: ${order.orderId}`;

  // Plain-Text Receipt
  const plainText = [
    `=== CIVIL CRAFT: BRIDGE EDITION ===`,
    isTest ? `*** TEST MODE PURCHASE CONFIRMATION ***` : `*** PAYMENT RECEIPT ***`,
    ``,
    `Hello ${playerName},`,
    ``,
    `Your purchase has been verified and your virtual currency is now credited to your account!`,
    ``,
    `--- ORDER SUMMARY ---`,
    `Order ID:          ${order.orderId}`,
    `Date & Time:       ${purchaseDate}`,
    `Status:            Completed (Fulfilled)`,
    `Payment Method:    ${paymentMethodDisplay}`,
    `Reference:         ${paymentReference}`,
    ``,
    `--- ITEM DETAILS ---`,
    `Package:           ${packageName}`,
    `Currency Type:     ${currencyName}`,
    `Quantity Credited: ${formattedQuantity}`,
    `Subtotal:          ${formattedPrice}`,
    `Discount:          ₱0.00`,
    `Total Paid:        ${formattedPrice}`,
    ``,
    ...(isTest
      ? [
          `--- TEST MODE NOTICE ---`,
          `This transaction was completed in PayMongo TEST MODE for testing/simulation purposes.`,
          `No real money was charged. This document is not an official tax invoice.`,
          ``,
        ]
      : []),
    `--- ACCOUNT DASHBOARD ---`,
    `Dashboard:         ${dashboardUrl}`,
    `Transactions:      ${transactionsUrl}`,
    ``,
    `Thank you for supporting Civil Craft: Bridge Edition!`,
    `The Civil Craft Team`,
    ``,
    `You received this email because a purchase was fulfilled for your verified player account (${recipientEmail}).`,
    `For support, contact ${supportEmail}.`,
  ].join("\n");

  // Branded HTML Receipt
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(emailSubject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F3E7D1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #4E372C;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F3E7D1; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #FCF6EC; border: 2px solid #4A3428; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(74, 52, 40, 0.12);">
          
          <!-- Top Gold Accent Bar -->
          <tr>
            <td style="height: 5px; background-color: #C58A42; line-height: 5px; font-size: 5px;">&nbsp;</td>
          </tr>

          <!-- Header Banner -->
          <tr>
            <td style="padding: 24px 32px 20px 32px; background-color: #4A3428; text-align: left;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #C58A42; font-weight: 700;">
                      ${isTest ? "Sandbox Test Receipt" : "Official Payment Receipt"}
                    </span>
                    <h1 style="margin: 6px 0 0 0; font-size: 22px; color: #FCF6EC; font-weight: 700; line-height: 1.3;">
                      Civil Craft: Bridge Edition
                    </h1>
                  </td>
                  <td align="right" valign="middle">
                    <span style="display: inline-block; background-color: #FAF2E6; color: #4A3428; border: 1px solid #C58A42; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px;">
                      ✓ Fulfilled
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Test Mode Banner (if Test Mode) -->
          ${
            isTest
              ? `<tr>
            <td style="padding: 12px 32px; background-color: #FFF6E5; border-bottom: 1px solid #E8DAC6; color: #8A5A1C; font-size: 13px; line-height: 1.5;">
              <strong style="color: #A87332;">TEST MODE TRANSACTION:</strong> This order was completed using PayMongo sandbox simulation. <strong>No real money was charged.</strong> This receipt is for testing verification and is not an official tax invoice.
            </td>
          </tr>`
              : ""
          }

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              
              <!-- Greeting & Heading -->
              <h2 style="margin: 0 0 8px 0; font-size: 20px; color: #4A3428; font-weight: 700;">
                Purchase Confirmed!
              </h2>
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #4E372C; line-height: 1.6;">
                Hello <strong>${escapeHtml(playerName)}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #4E372C; line-height: 1.6;">
                Thank you for your purchase! Your payment has been authoritatively verified and your <strong>${escapeHtml(formattedQuantity)}</strong> have been credited to your Civil Craft game account.
              </p>

              <!-- Order Details Table -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #FAF2E6; border: 1px solid #D6C4B2; border-radius: 8px; margin-bottom: 24px; font-size: 13px;">
                <tr>
                  <td style="padding: 10px 16px; border-bottom: 1px solid #E8DAC6; color: #7A6658; font-weight: 700; width: 140px;">Order ID:</td>
                  <td style="padding: 10px 16px; border-bottom: 1px solid #E8DAC6; color: #4A3428; font-family: monospace; font-size: 12px; font-weight: 700; word-break: break-all;">
                    ${escapeHtml(order.orderId)}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 16px; border-bottom: 1px solid #E8DAC6; color: #7A6658; font-weight: 700;">Date &amp; Time:</td>
                  <td style="padding: 10px 16px; border-bottom: 1px solid #E8DAC6; color: #4E372C; font-weight: 600;">
                    ${escapeHtml(purchaseDate)}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 16px; border-bottom: 1px solid #E8DAC6; color: #7A6658; font-weight: 700;">Payment Method:</td>
                  <td style="padding: 10px 16px; border-bottom: 1px solid #E8DAC6; color: #4E372C; font-weight: 600;">
                    ${escapeHtml(paymentMethodDisplay)}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 16px; border-bottom: 1px solid #E8DAC6; color: #7A6658; font-weight: 700;">Payment Ref:</td>
                  <td style="padding: 10px 16px; border-bottom: 1px solid #E8DAC6; color: #4E372C; font-family: monospace; font-size: 12px; word-break: break-all;">
                    ${escapeHtml(paymentReference)}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 16px; color: #7A6658; font-weight: 700;">Payment Status:</td>
                  <td style="padding: 10px 16px; color: #3A6943; font-weight: 700;">
                    Completed &bull; Fulfilled
                  </td>
                </tr>
              </table>

              <!-- Line Items & Pricing Breakdown Table -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="border: 1px solid #D6C4B2; border-radius: 8px; margin-bottom: 24px; overflow: hidden; font-size: 14px;">
                <tr style="background-color: #EFE4D2; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #7A6658; font-weight: 700;">
                  <th align="left" style="padding: 10px 16px;">Item</th>
                  <th align="center" style="padding: 10px 16px; width: 100px;">Qty</th>
                  <th align="right" style="padding: 10px 16px; width: 100px;">Amount</th>
                </tr>
                <tr style="background-color: #FAF2E6;">
                  <td style="padding: 14px 16px; border-top: 1px solid #E8DAC6; color: #4A3428; font-weight: 700;">
                    ${escapeHtml(packageName)}
                    <div style="font-size: 12px; color: #7A6658; font-weight: normal; margin-top: 4px;">
                      Delivered to game wallet: ${escapeHtml(formattedQuantity)}
                    </div>
                  </td>
                  <td align="center" style="padding: 14px 16px; border-top: 1px solid #E8DAC6; color: #4E372C; font-weight: 600;">
                    1
                  </td>
                  <td align="right" style="padding: 14px 16px; border-top: 1px solid #E8DAC6; color: #4A3428; font-weight: 700;">
                    ${escapeHtml(formattedPrice)}
                  </td>
                </tr>
                <tr style="background-color: #FCF6EC; border-top: 1px solid #E8DAC6;">
                  <td colspan="2" align="right" style="padding: 8px 16px; color: #7A6658; font-size: 13px;">Subtotal:</td>
                  <td align="right" style="padding: 8px 16px; color: #4E372C; font-size: 13px; font-weight: 600;">${escapeHtml(formattedPrice)}</td>
                </tr>
                <tr style="background-color: #FCF6EC;">
                  <td colspan="2" align="right" style="padding: 8px 16px; color: #7A6658; font-size: 13px;">Discount:</td>
                  <td align="right" style="padding: 8px 16px; color: #4E372C; font-size: 13px; font-weight: 600;">₱0.00</td>
                </tr>
                <tr style="background-color: #F5ECE0; border-top: 2px solid #C58A42;">
                  <td colspan="2" align="right" style="padding: 12px 16px; color: #4A3428; font-weight: 700; font-size: 15px;">Total Paid:</td>
                  <td align="right" style="padding: 12px 16px; color: #C58A42; font-weight: 800; font-size: 16px;">${escapeHtml(formattedPrice)}</td>
                </tr>
              </table>

              <!-- Action CTA Buttons -->
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td align="center" style="border-radius: 8px; background-color: #C58A42;">
                    <a href="${escapeHtml(transactionsUrl)}" target="_blank" style="display: inline-block; background-color: #C58A42; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 700; letter-spacing: 0.5px; border: 1px solid #A87332;">
                      View Transaction History &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 8px 0; font-size: 13px; color: #4E372C; line-height: 1.5;">
                Thank you for building and engineering bridges with Civil Craft!
              </p>
              <p style="margin: 0; font-size: 13px; color: #7A6658; font-weight: 700;">
                — The Civil Craft Team
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #F5ECE0; border-top: 1px solid #E8DAC6; font-size: 11px; color: #786154; line-height: 1.5;">
              You received this purchase confirmation because an order was fulfilled for your verified Civil Craft account (<span style="color: #4A3428; font-weight: 600;">${escapeHtml(recipientEmail)}</span>).
              If you did not authorize this purchase or need support, contact our team at
              <a href="mailto:${escapeHtml(supportEmail)}" style="color: #A87332; font-weight: 600;">${escapeHtml(supportEmail)}</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: emailSubject, text: plainText, html };
}

/**
 * Extracts payment method and transaction ID from the verified PayMongo session attributes.
 */
export function extractPaymentDetails(session?: Record<string, unknown> | null): {
  paymentMethod: string | null;
  paymentReference: string | null;
} {
  if (!session) return { paymentMethod: null, paymentReference: null };
  const attrs = object(session["attributes"]);
  const payments = Array.isArray(attrs["payments"]) ? attrs["payments"] : [];
  const paidPayments = payments
    .map((p) => object(object(p)["attributes"]))
    .filter((p) => p["status"] === "paid");

  const primary = paidPayments[0];
  if (!primary) return { paymentMethod: null, paymentReference: null };

  const paymentMethod =
    (typeof primary["payment_method_type"] === "string" && primary["payment_method_type"]) ||
    (typeof object(primary["source"])["type"] === "string" &&
      (object(primary["source"])["type"] as string)) ||
    null;

  const paymentReference =
    typeof primary["id"] === "string"
      ? primary["id"]
      : typeof attrs["reference_number"] === "string"
        ? attrs["reference_number"]
        : null;

  return { paymentMethod, paymentReference };
}

/**
 * Sends a purchase receipt email to the player's verified contact email with duplicate protection.
 * Follows an explicit delivery lifecycle: pending -> sending -> sent (or failed).
 * Fails safely: any sending issue logs an error and updates order metadata, but NEVER undoes payment.
 */
export async function sendPurchaseReceiptEmail(params: {
  order: PaymentOrder;
  paymentSession?: Record<string, unknown> | null | undefined;
  origin?: string | undefined;
  maxRetries?: number | undefined;
}): Promise<SendPurchaseReceiptResult> {
  const { order, paymentSession } = params;
  const maxRetries = params.maxRetries ?? 2;

  // 1. Idempotency Check: Already sent per order record
  if (order.receiptEmailStatus === "sent" || order.receiptEmailSentAt) {
    console.log(
      `[payment/receipt] Receipt email already sent for order ${order.orderId} at ${order.receiptEmailSentAt || "earlier"}. Skipping duplicate trigger.`,
    );
    return { success: true, skipped: true, reason: "already_sent" };
  }

  // 2. Concurrency Mutex: Synchronous in-process lock acquisition
  if (inFlightReceipts.has(order.orderId)) {
    console.log(
      `[payment/receipt] Receipt email dispatch already in flight for order ${order.orderId}. Skipping concurrent trigger.`,
    );
    return { success: true, skipped: true, reason: "in_flight" };
  }
  inFlightReceipts.add(order.orderId);

  try {
    // 3. Persistent Claim Check: Title Internal Data (cross-process mutex / idempotency)
    const claim = await getReceiptEmailClaim(order.orderId);
    if (claim) {
      if (claim.status === "sent") {
        console.log(
          `[payment/receipt] Persistent claim confirms receipt email already sent for order ${order.orderId}. Skipping duplicate trigger.`,
        );
        return { success: true, skipped: true, reason: "already_sent" };
      }
      if (
        claim.status === "sending" &&
        typeof claim.leaseExpiresAt === "number" &&
        Date.now() < claim.leaseExpiresAt
      ) {
        console.log(
          `[payment/receipt] Persistent claim lease is active until ${new Date(claim.leaseExpiresAt).toISOString()} for order ${order.orderId}. Skipping concurrent trigger.`,
        );
        return { success: true, skipped: true, reason: "in_flight" };
      }
      // If status is "failed" or the lease expired, proceed with safe retry / lease acquisition.
    }

    // 4. Authoritatively verify player contact email and verification status
    let verification;
    try {
      verification = await getPlayerContactVerification(order.playFabId);
    } catch (err) {
      console.warn(
        `[payment/receipt] Could not retrieve contact verification for player ${order.playFabId}:`,
        err,
      );
      return { success: false, skipped: true, reason: "missing_email" };
    }

    if (!verification.email) {
      console.log(
        `[payment/receipt] Player ${order.playFabId} has no contact email. Skipping receipt email.`,
      );
      return { success: false, skipped: true, reason: "missing_email" };
    }

    if (!verification.verified) {
      console.log(
        `[payment/receipt] Player ${order.playFabId} contact email is unverified (${verification.status}). Skipping receipt email per email verification policy.`,
      );
      return { success: false, skipped: true, reason: "unverified_email" };
    }

    const recipientEmail = verification.email.trim();

    // 5. Fetch player display name for personalization (best-effort)
    let playerName = "Engineer";
    try {
      const accountInfo = await playFabAdmin("Admin/GetUserAccountInfo", {
        PlayFabId: order.playFabId,
      });
      const userInfo = object(accountInfo["UserInfo"]);
      const titleInfo = object(userInfo["TitleInfo"]);
      const displayName =
        typeof titleInfo["DisplayName"] === "string" ? titleInfo["DisplayName"].trim() : "";
      const username = typeof userInfo["Username"] === "string" ? userInfo["Username"].trim() : "";
      if (displayName) playerName = displayName;
      else if (username) playerName = username;
    } catch {
      // Default to "Engineer" if profile lookup fails
    }

    // 6. Extract payment method & reference
    const extracted = extractPaymentDetails(paymentSession);
    const paymentMethod = extracted.paymentMethod || order.paymentMethod || null;
    const paymentReference = extracted.paymentReference || order.paymentReference || null;

    // 7. Check SMTP configuration
    const smtpConfig = getGmailSmtpConfig();
    if (!smtpConfig) {
      const errorMsg =
        "SMTP is not configured (GMAIL_SMTP_* or SMTP_* environment variables missing).";
      console.warn(`[payment/receipt] ${errorMsg}`);
      try {
        await saveReceiptEmailClaim({
          orderId: order.orderId,
          status: "failed",
          updatedAt: new Date().toISOString(),
          error: errorMsg,
          playFabId: order.playFabId,
          maskedEmail: verification.maskedEmail,
        });
        await updateOrderStatus(order.orderId, {
          receiptEmailStatus: "failed",
          receiptEmailError: errorMsg,
          paymentMethod,
          paymentReference,
        });
      } catch {
        /* ignore order update failure */
      }
      return { success: false, skipped: true, reason: "smtp_not_configured", error: errorMsg };
    }

    // 8. Acquire Cross-Process Lease & Transition State to "sending"
    const leaseExpiresAt = Date.now() + 60_000; // 60s lease window
    try {
      await saveReceiptEmailClaim({
        orderId: order.orderId,
        status: "sending",
        updatedAt: new Date().toISOString(),
        leaseExpiresAt,
        playFabId: order.playFabId,
        maskedEmail: verification.maskedEmail,
      });
      await updateOrderStatus(order.orderId, {
        receiptEmailStatus: "sending",
        paymentMethod,
        paymentReference,
      });
    } catch (claimErr) {
      console.warn(`[payment/receipt] Could not persist initial 'sending' lease:`, claimErr);
    }

    // 9. Resolve support email & render email content
    const supportEmail = await resolveSupportEmail();
    const rendered = renderPurchaseReceiptEmail({
      order,
      recipientEmail,
      playerName,
      paymentMethod,
      paymentReference,
      isTestMode: isPayMongoTestMode(),
      origin: params.origin,
      supportEmail,
    });

    // 10. Send via nodemailer with retry logic for transient errors
    let attempt = 0;
    let lastError: Error | null = null;
    let sentInfo: { messageId?: string } | null = null;

    while (attempt <= maxRetries) {
      attempt++;
      try {
        console.log(
          `[payment/receipt] Sending purchase receipt for order ${order.orderId} to ${verification.maskedEmail} (attempt ${attempt}/${maxRetries + 1})...`,
        );

        const transporter = nodemailer.createTransport({
          host: smtpConfig.host,
          port: smtpConfig.port,
          secure: smtpConfig.secure,
          auth: {
            user: smtpConfig.user,
            pass: smtpConfig.pass,
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 10000,
          disableFileAccess: true,
          disableUrlAccess: true,
        });

        try {
          const info = await transporter.sendMail({
            from: smtpConfig.from,
            to: recipientEmail,
            subject: rendered.subject,
            text: rendered.text,
            html: rendered.html,
          });
          sentInfo = info as { messageId?: string } | null;
        } finally {
          transporter.close();
        }

        const sentAt = new Date().toISOString();

        // 11. Record persistent receipt claim with "sent" status only AFTER provider confirmation
        try {
          await saveReceiptEmailClaim({
            orderId: order.orderId,
            status: "sent",
            updatedAt: sentAt,
            sentAt,
            playFabId: order.playFabId,
            maskedEmail: verification.maskedEmail,
            messageId: sentInfo?.messageId || undefined,
          });
        } catch (claimErr) {
          console.warn(`[payment/receipt] Could not persist receipt claim key:`, claimErr);
        }

        // 12. Record success on the order record
        try {
          await updateOrderStatus(order.orderId, {
            receiptEmailStatus: "sent",
            receiptEmailSentAt: sentAt,
            receiptEmailError: null,
            paymentMethod,
            paymentReference,
          });
        } catch (orderUpdateErr) {
          console.warn(
            `[payment/receipt] Could not update order receipt email timestamp:`,
            orderUpdateErr,
          );
        }

        console.log(
          `[payment/receipt] Purchase receipt successfully sent for order ${order.orderId} to ${verification.maskedEmail}.`,
        );

        return { success: true, sentAt };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(
          `[payment/receipt] Error sending receipt email (attempt ${attempt}):`,
          lastError.message,
        );

        if (attempt <= maxRetries) {
          // Short exponential backoff before retry (300ms, 900ms)
          await new Promise((resolve) => setTimeout(resolve, attempt * 300));
        }
      }
    }

    // 13. Record failure state on the order and claim (eligible for safe retry on future webhook)
    const failureMessage = lastError ? lastError.message : "Unknown email delivery failure";
    try {
      await saveReceiptEmailClaim({
        orderId: order.orderId,
        status: "failed",
        updatedAt: new Date().toISOString(),
        error: failureMessage,
        playFabId: order.playFabId,
        maskedEmail: verification.maskedEmail,
      });
      await updateOrderStatus(order.orderId, {
        receiptEmailStatus: "failed",
        receiptEmailError: failureMessage,
        paymentMethod,
        paymentReference,
      });
    } catch {
      /* ignore order status write failure on email failure */
    }

    return { success: false, error: failureMessage };
  } finally {
    // 14. Always release in-memory dispatch lock
    inFlightReceipts.delete(order.orderId);
  }
}
