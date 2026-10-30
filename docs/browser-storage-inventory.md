# CivilCraft Browser Storage & Cookie Technical Inventory

**Document Version:** 1.0.0  
**Target Environment:** CivilCraft Production Web Client & Dashboard  
**Audience:** Developers, Systems Architects, Security Auditors  

---

## 1. Overview

This developer documentation provides a code-level technical inventory of all browser storage mechanisms (HTTP cookies, `localStorage`, and `sessionStorage`) implemented in the CivilCraft website. 

The public Cookie Policy at `/cookies` presents a simplified, player-friendly overview grouped into **Essential Storage**, **Functional Storage**, and **Temporary Storage**. Technical key names, internal storage tokens, and administrative implementation details are maintained here for engineering reference.

---

## 2. Technical Inventory Matrix

| Technology | Storage Type | Scope | Key / Name | Purpose & Code Location | Lifespan / Expiration |
|---|---|---|---|---|---|
| **Cookie (Client-side)** | Document Cookie | Public & Dashboard | `sidebar_state` | Remembers whether the dashboard navigation sidebar is expanded (`true`) or collapsed (`false`). Set in `src/components/ui/sidebar.tsx`. | 7 days (`max-age=604800`) |
| **Cookie (Server-side)** | HttpOnly, Secure, SameSite=Lax | Admin Only (`/admin/*`) | Configured via `cookieName(config, "session")` (default `civilcraft_admin_session`) | Cryptographically signed administrative session token for staff login and endpoint protection. Set in `src/lib/admin-auth/session.server.ts`. Never issued to normal players. | Active session (max 8 hours) |
| **Local Storage (`localStorage`)** | Web Storage | Player Dashboard | `civilcraft.session.player.v1` | Serialized JSON containing active PlayFab session ticket, PlayFab ID, and display name. Managed by `src/lib/playfab/session-store.ts`. | Persistent until player clicks "Sign Out" or ticket expires |
| **Local Storage (`localStorage`)** | Web Storage | Player Dashboard | `civilcraft.session.end_reason.v1` | Flags reason for session termination (e.g., `"expired"`). Triggers session expiry notification banner upon subsequent navigation. Managed in `src/lib/playfab/session-store.ts`. | Cleared automatically upon new login |
| **Local Storage (`localStorage`)** | Web Storage | CMS / Demo Mode | `civilcraft.cms.v1` | Local fallback state for news, releases, FAQ, and team members when operating in offline demo or mock mode. Implemented in `src/lib/cms/store.ts`. | Persistent in mock/local mode |
| **Local Storage (`localStorage`)** | Web Storage | Player Dashboard | `unlocked-levels-<playFabId>` | Client-side cache of completed level IDs to minimize duplicate API calls on dashboard navigation. Implemented in `src/lib/playfab/index.ts`. | Persistent until browser cache cleared |
| **Session Storage (`sessionStorage`)** | Web Storage | Admin Directory | `civilcraft.admin.directory.rows` | Remembers selected pagination row count (e.g. 20, 50, 100) in the admin player directory table. Implemented in `src/routes/admin.players.tsx`. | Ephemeral (cleared on browser tab close) |

---

## 3. Privacy & Compliance Analysis

### Republic Act No. 10173 (Philippine Data Privacy Act of 2012)
- **Strictly Necessary Exemption:** Under National Privacy Commission (NPC) advisory opinions and international data privacy frameworks, storage technologies strictly necessary for providing an explicitly requested service (such as player authentication tickets in `localStorage` and admin session cookies) do not require prior consent banners because they are essential to contract fulfillment.
- **Zero Third-Party Tracking:** The website loads no advertising tags, no Google Analytics scripts, no Meta (Facebook) tracking pixels, and no behavioral profiling cookies.
- **Player Data Erasure:** When a player clicks **Sign Out** in the dashboard, `src/lib/playfab/session-store.ts` immediately invokes `localStorage.removeItem(PLAYER_SESSION_KEY)`, terminating local authentication tokens.

