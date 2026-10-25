# CivilCraft email verification template

Subject: **Verify Your CivilCraft Account**

Copy the complete contents of `email-verification.html` into the existing PlayFab Email Verification template's Email body field. `email-verification.txt` provides an alternative plain-text body; omit its first Subject line when pasting a body. Do not assume the editor supports a separate multipart plain-text field: the text file is a manual alternative if no such field exists.

## Branding and support

This template reuses the Support Reply layout in the player/user reply branch of `src/lib/email/contact-resend.server.ts`: cream background #F3E7D1, centered 600px off-white card #FCF6EC, brown border #4A3428, 5px gold accent #C58A42, Nunito/system font stack, 11px uppercase label, 22px heading, and 32px horizontal padding. The instructions use the existing rounded reply box (#FAF2E6 with a gold left border), and the security note uses the original-inquiry box styling (#F2E5D3). The button reuses #C58A42 fill, #A87332 border, 6px radius, and 12px/26px padding. The footer reuses #F5ECE0, 12px text, and 20px/32px padding. Support Reply source was inspected but not changed.

Microsoft documents HTML directly in the Email Verification Email body, including an anchor using `$ConfirmationUrl$`:
https://learn.microsoft.com/en-us/xbox/playfab/live-service-management/game-configuration/title-communications/emails/using-a-rule-to-verify-a-contact-email-address

Both button and fallback link preserve that variable exactly. PlayFab supplies the confirmation destination and performs verification before redirecting to the configured callback. There is no custom verification endpoint or hardcoded verification URL here.

## Apply manually

1. In PlayFab Game Manager, select the existing CivilCraft title, then Content > Email Templates.
2. Open **Email Verification** and retain a copy of the original settings/body.
3. Keep the existing template name, ID, type **Email verification**, From name, From email, Callback URL, Error Callback URL, and any expiration settings unchanged. The previous documentation listed a callback of `https://civil-craft.vercel.app`; live settings were not inspected, so retain the actual existing value rather than copying that historical URL.
4. Change only Email subject to **Verify Your CivilCraft Account** and Email body to the complete HTML file. Paste raw HTML in the body/source field; do not paste a screenshot or rendered page. Do not replace `$ConfirmationUrl$` with the callback URL.
5. Save the existing template only when you choose to apply it. For the separate recovery template, follow [Password Recovery](../password-recovery/README.md). Leave Contact Reply, Admin Notification, and existing email-trigger rules untouched.

## Verification checklist

- Send through the existing verification flow using a dedicated test account. No test email has been sent by this task.
- In Gmail, Outlook, and a mobile client, confirm the message renders as HTML rather than showing tags; inspect wrapping, button, fallback link, and footer.
- Confirm PlayFab replaced all `$ConfirmationUrl$` occurrences with the generated confirmation URL. Treat the actual URL/token as private.
- Confirm the button and visible fallback link point to the same generated PlayFab destination, not directly to the website callback.
- Open the button in an unverified test email. Confirm PlayFab contact-email status becomes Confirmed/Verified and redirects to the unchanged callback.
- Test the fallback link using another fresh verification email/test account, since link reuse or expiration may affect the result.
- Confirm existing expired/invalid-link behavior remains unchanged; the template introduces no expiration claims.
- Confirm Password Recovery and Contact Reply settings remain unchanged.

## Validation limits

Desktop and mobile screenshots are local browser previews, not Gmail/Outlook compatibility tests. Table structure, inline CSS, system fonts, and an Outlook conditional width wrapper provide conservative layout fallbacks. Classic Outlook may display square corners and omit shadows. Live placeholder substitution, verification, delivery MIME type, and actual email-client rendering require the checklist above.

## Completion audit (2026-10-24)

- Existing HTML and plain text were complete and are unchanged. Their colors, 600px card, typography, spacing, button and footer styling match the contact email renderer; the account-specific wording is preserved.
- No local recovery template existed. Matching HTML and plain text are now available in `../password-recovery/`.
- Recovery is sent by PlayFab: `src/lib/playfab/auth.ts` calls `/api/email/recovery`; `src/lib/email/api.server.ts` calls `Client/SendAccountRecoveryEmail` with the existing `PLAYFAB_RECOVERY_EMAIL_TEMPLATE_ID`. It does not load either local HTML file. If that variable is absent, delivery is skipped while the response remains generic.
- Registration/login synchronizes contact email through `src/lib/playfab/contact-email.ts` using `Client/AddOrUpdateContactEmail`. No direct verification-email sender or local HTML loader was found. The verification trigger and selected template must be confirmed in the existing PlayFab rules/backend configuration; those live settings were not accessed.
- Both HTML files retain two exact `href="$ConfirmationUrl$"` attributes and one visible `$ConfirmationUrl$`; each text alternative retains two placeholders. No hardcoded confirmation URL/token, credentials, scripts, forms, images or external assets are present in these artifacts.
- Chromium previews were checked at 760px desktop, 390px mobile and 320px narrow widths, with no horizontal overflow and two matching placeholder links. `preview-desktop.png` and `preview-mobile.png` were refreshed; `preview-narrow.png` was added. These are browser previews, not inbox certification.
- Markup uses balanced presentation tables, inline styles, background attributes, a conditional 600px Outlook wrapper and an Outlook padding fallback. Rounded corners/shadows remain optional enhancements. Gmail, classic/new Outlook and mobile inbox tests are still required.
- No website source, authentication logic, environment configuration or live PlayFab settings changed. TypeScript checks, application tests and production build were not run because only documentation, standalone templates and previews changed.

Official references: [verification templates and rules](https://learn.microsoft.com/en-us/gaming/playfab/live-service-management/game-configuration/title-communications/emails/using-a-rule-to-verify-a-contact-email-address), [account recovery templates](https://learn.microsoft.com/en-us/gaming/playfab/live-service-management/game-configuration/title-communications/emails/using-email-templates-to-send-an-account-recovery-email).
