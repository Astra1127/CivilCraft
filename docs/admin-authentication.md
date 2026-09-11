# Civil Craft administrator authentication

Players use PlayFab at `/login` and `/signup`. Administrators use Civil Craft server-verified email/password credentials at `/admin/login`. The identities, cookies, routes, login operations, and logout operations remain separate. Existing privileged PlayFab APIs authorize the Civil Craft session before using their own server credential.

## Required configuration

| Variable               | Purpose                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_USERS_JSON`     | Server-only JSON array of 1–20 administrator records, each with `email`, `displayName`, and `passwordHash`. No plaintext password property.               |
| `ADMIN_SESSION_SECRET` | Cryptographically random session secret, at least 32 bytes.                                                                                               |
| `ADMIN_AUTH_ORIGIN`    | Optional exact website origin, with no path/query. Defaults to `https://civil-craft.vercel.app` in production and `http://localhost:5173` in development. |

Keep `VITE_PLAYFAB_TITLE_ID=17FA03` and the separate server-only `PLAYFAB_SECRET_KEY` setting for game services. No authentication secret or password hash may have a `VITE_` prefix. `.env.example` has blank entries only, and `.env.local` remains ignored by Git.

## Create an administrator

1. Use Node 22.18+ or Node 24. Run `npm run admin:hash-password` in a local interactive terminal. For stdout containing only the hash without npm's command banner, use `npm run --silent admin:hash-password`.
2. Enter and confirm a unique password of at least 15 characters (maximum 1,024 UTF-8 bytes). Input is hidden, and the utility does not accept a password argument, use environment variables for plaintext, or write credentials to disk. Prompts/errors go to stderr; only the resulting hash goes to stdout. Do not put passwords into shell commands or source files.
3. Copy the hash into the `passwordHash` property of your administrator record. Set `email` to the staff email and `displayName` to its display name. Put the record in an array and set that JSON as the server-only `ADMIN_USERS_JSON` value. There is no default account or default password.
4. Generate a separate random session secret locally. For example, `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"` prints a new value for you to place in `ADMIN_SESSION_SECRET`. Do not paste that value into source control or support logs.

For `.env.local`, wrap JSON in single quotes on one line to preserve embedded double quotes. The generated hash uses colon-delimited metadata and base64url fields, so copying it does not trigger dotenv dollar-sign expansion. Do not include the outer dotenv quotes in Vercel's dashboard value: paste raw JSON there. Validate by opening `/admin/login`; malformed JSON, duplicate normalized emails, weak/malformed hashes, or invalid settings leave login disabled with the configuration message. Do not print the JSON while troubleshooting.

The utility uses Node's asynchronous `crypto.scrypt`, with `N=131072`, `r=8`, `p=1`, a random 24-byte salt, and a 64-byte derived key. Verification uses `timingSafeEqual`. This matches [OWASP's recommended scrypt work factors](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html); see [Node's scrypt implementation](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback). Only the fixed supported hash format is accepted, preventing accidental weak settings or excessive work factors. No native addon installation is needed. Passwords are hashed, not encrypted or stored as plain SHA-256 digests.

## Local and Vercel setup

Locally, put the settings in `.env.local`, run `npm run dev`, and open `http://localhost:5173`. If you use another port or `127.0.0.1`, explicitly set `ADMIN_AUTH_ORIGIN` to that exact origin and restart Vite. The login/logout APIs validate Origin; changing hostnames without changing configuration intentionally fails.

In Vercel, set the required variables for the intended environment, keep the production origin `https://civil-craft.vercel.app`, and redeploy. Set a different exact HTTPS origin for each preview deployment that needs login. Remove the previous identity-provider app settings and staff allowlists from the Vercel dashboard; they are no longer read. No app registration, callback URL, provider credentials, or external identity-provider dependency is needed. The existing Nitro serverless runtime handles the endpoints. Allow sufficient function memory for scrypt (about 128 MiB per verification, at most two concurrent verifications per instance, in addition to the app runtime).

## Endpoints and session behavior

| Endpoint                      | Behavior                                                                                                                                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/admin/login`  | Accepts JSON `email` and `password`, checks exact request origin, validates bounded input, applies best-effort per-instance throttling, verifies the hash, issues a fresh signed session, and returns safe identity with an HttpOnly cookie. |
| `GET /api/auth/admin/session` | Returns safe configured/authenticated state and identity only.                                                                                                                                                                               |
| `POST /api/auth/admin/logout` | Expires the admin cookie, and returns success. It does not touch PlayFab or the player session.                                                                                                                                              |

All `/admin/*` pages except `/admin/login` require server verification. The entire `/api/admin/*` namespace uses the same session policy. Guests, player tickets, forged/expired cookies, removed accounts, and changed credentials cannot unlock staff access. Unauthenticated API requests receive 401. Empty or malformed configuration fails closed.

Sessions are stateless JWTs signed with HS256 using `jose`. The signing key is derived with HMAC-SHA256 from `ADMIN_SESSION_SECRET` and the current account ID/password hash. The token contains only subject, issuer, audience, issued-at, expiry, and a random token ID; no password hash, email, or secret is included. Signature, algorithm, format, origin, expiry, and current account are verified on every request. Sessions expire after eight hours (28,800 seconds) with no automatic refresh. Cookies use HttpOnly, SameSite=Lax, Path=/, and Secure on HTTPS. The HTTPS cookie name is `__Host-civilcraft-admin-session`; localhost HTTP uses `civilcraft-admin-session`. Production rejects HTTP.

Logout clears the browser cookie only. There is no persistent session revocation list: a copied token remains valid until expiry. Rotating `ADMIN_SESSION_SECRET` invalidates all sessions; removing an account or changing its password hash invalidates that account's sessions once the updated configuration is deployed. No external session service is required locally or in production.

Login errors do not disclose whether an email exists. Unknown emails perform the same scrypt work before rejection. A bounded in-memory limiter permits five attempts per normalized email in 15 minutes and 30 attempts across emails per minute, per warm server instance. Successful and failed attempts count. Limits reset on restart and are not shared across Vercel instances; this is best-effort throttling, not durable distributed enforcement. At most two password verifications run concurrently per instance.

Safe server audit events record login success, invalid/limited attempts, and logout, using only operation, timestamp, outcome, and the configured administrator's identifier when known. No passwords, hashes, session secrets, cookies, or authorization tokens are logged. Retain Vercel logs if durable cross-device audit history is required; browser-local CMS activity is not an authoritative security log.

## Validation and acceptance

Run `npm run test:auth`, `npm run test:admin`, `npx tsc --noEmit`, and `npm run build`. Tests use in-memory test credentials, prohibit external authentication requests, and intercept PlayFab requests. No real account is provisioned. After setting server environment values and redeploying Vercel, manually verify sign-in, refresh, sign-out, independent player login/logout, and a permitted read-only administrative operation.

The password hashing utility and PlayFab player authentication remain unchanged. Directory pagination uses encrypted expiring continuation tokens; see [the backend guide](playfab-admin-backend.md). No Phase 4 work is included.

Simplification validation: production build, TypeScript, and lint on changed authentication/backend code passed. All 28 tests passed, including continuation tokens used on a fresh module instance, expiry, tampering, and wrong-owner rejection. The development server returned 200 for player/admin login pages, 303 to `/admin/login` for protected pages, and 401 for unauthenticated administrative APIs. All 121 client text assets were free of `passwordHash`, `ADMIN_USERS_JSON`, `ADMIN_SESSION_SECRET`, and `PLAYFAB_SECRET_KEY` markers. Real-account and visual browser acceptance remain manual.
