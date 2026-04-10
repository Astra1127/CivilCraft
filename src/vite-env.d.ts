/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PlayFab Title ID — must match the Unity game's Title ID */
  readonly VITE_PLAYFAB_TITLE_ID?: string;
  /** Backend webhook URL for bulk account provisioning + email */
  readonly VITE_BULK_PROVISION_WEBHOOK_URL?: string;
  /** EmailJS service ID (frontend email fallback) */
  readonly VITE_EMAILJS_SERVICE_ID?: string;
  /** EmailJS template ID */
  readonly VITE_EMAILJS_TEMPLATE_ID?: string;
  /** EmailJS public key */
  readonly VITE_EMAILJS_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
