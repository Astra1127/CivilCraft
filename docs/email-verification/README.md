# CivilCraft email verification template

Subject: **Verify Your CivilCraft Account**

Copy the complete contents of `email-verification.html` into the existing PlayFab Email Verification template's Email body field. `email-verification.txt` provides an alternative plain-text body; omit its first Subject line when pasting a body. Do not assume the editor supports a separate multipart plain-text field: the text file is a manual alternative if no such field exists.

## Branding and support

Branding follows the player reply HTML in `src/lib/email/contact-resend.server.ts`: cream background #F3E7D1, card #FCF6EC, brown #4E372C, gold #C58A42, footer #F5ECE0, and system sans-serif fallbacks. The button uses the existing darker gold border color #A87332 as its fill for clearer white text. Text branding works without downloading a logo or external fonts. Password Recovery is currently plain text according to the supplied configuration; this is a shared visual identity, not a claim to reproduce a branded recovery template.

Microsoft documents HTML directly in the Email Verification Email body, including an anchor using `$ConfirmationUrl$`:
https://learn.microsoft.com/en-us/xbox/playfab/live-service-management/game-configuration/title-communications/emails/using-a-rule-to-verify-a-contact-email-address

Both button and fallback link preserve that variable exactly. PlayFab supplies the confirmation destination and performs verification before redirecting to the configured callback. There is no custom verification endpoint or hardcoded verification URL here.

## Apply manually

1. In PlayFab Game Manager, select the existing CivilCraft title, then Content > Email Templates.
2. Open **Email Verification** and retain a copy of the original settings/body.
3. Keep the template name, ID, type **Email verification**, From name **Civil Craft**, From email, Callback URL **https://civil-craft.vercel.app**, Error Callback URL, and any expiration settings unchanged.
4. Change only Email subject to **Verify Your CivilCraft Account** and Email body to the complete HTML file. Paste raw HTML in the body/source field; do not paste a screenshot or rendered page. Do not replace `$ConfirmationUrl$` with the callback URL.
5. Save the existing template. Leave Password Recovery, Contact Reply, Admin Notification, and existing email-trigger rules untouched.

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

Only new documentation/template/preview artifacts were added. No application or live PlayFab changes were made.
