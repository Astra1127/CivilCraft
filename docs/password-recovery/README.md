# CivilCraft password recovery template

Ready-to-paste body: [password-recovery.html](password-recovery.html). Subject: **Reset Your CivilCraft Password**.

The existing verification HTML is the visual reference. Only the heading, explanation, button label, fallback instructions and security notice differ. Cream background, brown border, gold/orange button, font stack, card width, spacing, footer and responsive table layout are preserved. Contact Reply and Admin Notification are unchanged.

## Apply both templates in PlayFab Game Manager

Local files do not update live emails. No live settings were read or modified and no emails were sent. These instructions are for your manual application after review.

1. Select the existing CivilCraft title in Game Manager, then **Content > Email Templates**.
2. Back up the current bodies, subjects and settings for **Email Verification** and **CivilCraftPasswordRecovery**, including their IDs, types, sender fields, callbacks, error callbacks and any expiration settings.
3. Open the existing **Email Verification** template. Set **Email subject** to `Verify Your CivilCraft Account`. Replace only **Email body** with the complete raw contents of [email-verification.html](../email-verification/email-verification.html), including the doctype and HTML tags. Keep its existing **Email verification** type and all other settings. Save when ready.
4. Open the existing **CivilCraftPasswordRecovery** template. Set **Email subject** to `Reset Your CivilCraft Password`. Replace only **Email body** with the complete raw contents of [password-recovery.html](password-recovery.html). Keep its existing **Account Recovery** type and all other settings. Save when ready.
5. Do not create replacement templates or change names/IDs, **From Name**, **From Email Address**, **Callback URL**, **Error callback URL**, SMTP configuration, rules or expiration settings. If the existing type differs from the expected type, stop and investigate instead of changing it as part of this visual update. If a named template is missing, locate the existing template used by the flow before proceeding.
6. Verify that the existing deployment variable `PLAYFAB_RECOVERY_EMAIL_TEMPLATE_ID` references that same recovery template ID; this task does not change it. The display name is not the ID. Preserve the verification rule's existing template selection as well.
7. Keep `$ConfirmationUrl$` exactly in both link destinations and the visible fallback text. Do not substitute the website callback or a real token. PlayFab supplies the link and redirects to the existing callback. The website already accepts the recovery token on `/reset-password`; retain the current callback configuration, including its query behavior.

The `.txt` files are plain-text alternatives. Omit the first `Subject:` line when pasting a body. Do not paste plain text over the HTML body if you want the styled design, or assume Game Manager offers a separate multipart text field.

## Validation and live tests

Local checks: balanced HTML; exact placeholders (three per HTML, two per text file); correct button and fallback markup; no embedded tokens, credentials or external assets; browser previews at 760, 390 and 320px with no horizontal overflow. See the [audit](../email-verification/README.md#completion-audit-2026-10-24) for integration findings and limitations. The previews are `preview-desktop.png`, `preview-mobile.png` and `preview-narrow.png`.

After you apply the templates, use dedicated test accounts to check:

- Existing verification trigger sends the intended template; contact email changes to Confirmed and redirects to the unchanged callback.
- Existing forgot-password flow sends CivilCraftPasswordRecovery; PlayFab substitutes every placeholder and both links have the same generated destination.
- Recovery button reaches the existing reset form with its token; a new password can be set and used for website login. Check game login through the existing flow if needed, without changing Unity.
- Fallback link works using a separate fresh email; expired, invalid and reused links follow existing error behavior. Never publish generated links or tokens in screenshots/logs.
- Gmail, Outlook and a mobile inbox show HTML correctly, with readable fonts, wrapped long generated links, intact card/footer and a usable button. Classic Outlook may show square corners and omit shadows; confirm its button spacing/click behavior in an actual received message.
- Delivery and PlayStream events show the expected template IDs. A generic recovery response alone does not prove delivery.

Reference: [Microsoft's account recovery template guide](https://learn.microsoft.com/en-us/gaming/playfab/live-service-management/game-configuration/title-communications/emails/using-email-templates-to-send-an-account-recovery-email).
