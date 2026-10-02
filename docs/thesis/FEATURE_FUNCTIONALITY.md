# CivilCraft: Feature Functionality & System Inventory
**Thesis System Features, Processes, and Verification Matrix**

---

## 1. Feature Implementation Matrix

| Scope | Feature Name | Status | Technical Evidence & Verification |
| :--- | :--- | :--- | :--- |
| **Player Web** | Account Registration | `IMPLEMENTED` | `src/routes/signup.tsx`, `src/lib/playfab/auth.ts`. Direct integration with PlayFab `Client/RegisterPlayFabUser`. |
| **Player Web** | Portal Login | `IMPLEMENTED` | `src/routes/login.tsx`. Supports Username/Email and password via PlayFab Client API. |
| **Player Web** | Password Recovery | `IMPLEMENTED` | `src/routes/forgot-password.tsx`, `src/routes/reset-password.tsx`. Initiates `Client/SendAccountRecoveryEmail`. |
| **Player Web** | Profile & Username Display | `IMPLEMENTED` | `src/routes/dashboard.profile.tsx`. Displays PlayFab account Username (not email) and created timestamp. |
| **Player Web** | Character Renaming | `IMPLEMENTED` | `src/lib/playfab/account-settings.ts`. Stores custom character name in PlayFab UserData `CharacterName`. |
| **Player Web** | Dashboard Career Metrics | `IMPLEMENTED` | `src/routes/dashboard.index.tsx`. Shows Level, XP progress bar, current region, bridges, challenges, and score. |
| **Player Web** | Wardrobe / Cosmetic Cards | `IMPLEMENTED` | `src/lib/playfab/equipment.ts`. Renders equipped Hair, Top, Pants, Shoes, and multiple Accessories from `EquippedCosmetics`. |
| **Player Web** | Bridge Almanac (Player) | `IMPLEMENTED` | `src/routes/dashboard.almanac.tsx`. Reads and parses `AlmanacProgress` JSON projection from PlayFab. |
| **Player Web** | Completion Records & URLs | `PARTIALLY IMPLEMENTED` | Supported in data schema (`completionScreenshotUrl` in `AlmanacProgress`), but dynamic upload from mobile client is constrained by cloud file quotas. |
| **Player Web** | Educational Almanac (Public)| `IMPLEMENTED` | `src/routes/almanac.tsx`, `src/lib/almanac/content.ts`. Four bridge types (Beam, Truss, Arch, Suspension) with force diagrams. |
| **Player Web** | Global Leaderboards | `IMPLEMENTED` | `src/routes/leaderboards.tsx`, `src/lib/playfab/leaderboard.server.ts`. Queries PlayFab Leaderboard statistics. |
| **Player Web** | Media Gallery | `IMPLEMENTED` | `src/routes/gallery.tsx`. Categorized screenshot gallery loaded from CMS/blob storage. |
| **Player Web** | Game APK Download | `IMPLEMENTED` | `src/routes/download.tsx`. Dynamically provides the latest verified APK build from release management. |
| **Player Web** | Player Coin Shop | `IMPLEMENTED` | `src/routes/dashboard.shop.tsx`. Displays dynamic packages; unauthenticated visitors are safely redirected to login. |
| **Player Web** | PayMongo Coin Checkout | `IMPLEMENTED` | `src/lib/payments/paymongo.server.ts`. Supports GCash, Maya, QR Ph, and Cards; fulfills virtual currency `CO`. |
| **Game (Unity)**| Story Mode & Contracts | `IMPLEMENTED` | `BHAN HOUSE.unity`, `CanyonCrossing.unity`, `PlayerDataManager.cs`. Engineering contracts mentored by Professor Bhan. |
| **Game (Unity)**| 2D Blueprint Build Grid | `IMPLEMENTED` | `Assets/Script/BuildMode/2D/`. Node and member drafting with `BarCreator.cs`, `CommandManager.cs` (undo/redo). |
| **Game (Unity)**| Materials & Costs | `IMPLEMENTED` | `BridgeMaterialSO.cs`. Material definitions (Wood, Steel, Cable) with tension/compression limits and costs. |
| **Game (Unity)**| Structural Stress Solver | `IMPLEMENTED` | `BridgePhysicsManager.cs`, `DeterministicBridgeStressSolver.cs`. Real-time calculation of equilibrium, strain, and color stress. |
| **Game (Unity)**| Vehicle Simulation | `IMPLEMENTED` | `BoatBridgeCrossing.cs`, `SimulationBarricade.cs`. Heavy vehicle load-testing with structural buckling/breakage. |
| **Game (Unity)**| 3-Star Grading System | `IMPLEMENTED` | `ContractStarResult` in `PlayerData.cs`. Grades Clearance, Budgetary Efficiency, and Peak Stress. |
| **Game (Unity)**| In-Game Almanac Hub | `IMPLEMENTED` | `AlmanacManager.cs`, `AlmanacLearningHub.cs`. Unlocks mechanics lessons and bridge types in-game. |
| **Game (Unity)**| In-Game Wardrobe | `IMPLEMENTED` | `CharacterCustomizationController.cs`, `PlayerCosmetics.cs`. Customization of clothing and accessories. |
| **Game (Unity)**| Local & Cloud Save | `IMPLEMENTED` | AES encrypted JSON locally (`SaveEncryption.cs`); cloud backup via PlayFab Entity Files (`CloudSaveManager.cs`). |
| **Game (Unity)**| Dashboard Cloud Sync | `IMPLEMENTED` | `DashboardSyncService.cs`. Pushes unencrypted UserData and statistics via CloudScript `syncDashboardV1`. |
| **Game (Unity)**| Multiplayer / Co-op | `PARTIALLY IMPLEMENTED (GAME)` / `PLACEHOLDER (WEB)` | Game contains `Multiplayer.unity`, room-code host/join flow, and Photon Fusion avatars. Website displays an informational mode card only. |
| **Admin** | Admin Authentication | `IMPLEMENTED` | `src/lib/admin-auth/`. Cryptographic HMAC session cookies, password hashing, and brute-force throttling. |
| **Admin** | System Overview Dashboard | `IMPLEMENTED` | `src/routes/admin.index.tsx`. Key operational metrics, active player counts, bans, and transaction counts. |
| **Admin** | Player Directory & Search | `IMPLEMENTED` | `src/routes/admin.players.tsx`. Paginated search across PlayFab accounts by ID, Username, or Email. |
| **Admin** | Player Dossier Modal | `IMPLEMENTED` | `src/components/admin/PlayerRecordModal.tsx`. Detailed career inspection, progression snapshots, and ban records. |
| **Admin** | Ban Player | `IMPLEMENTED` | Server-side execution of PlayFab Admin API `BanUsers` using `PLAYFAB_SECRET_KEY`. |
| **Admin** | Unban Player | `IMPLEMENTED` | Server-side execution of PlayFab Admin API `RevokeAllBansForUser`. Restores player access immediately. |
| **Admin** | Dynamic Coin Products | `IMPLEMENTED` | `src/routes/admin.products.tsx`. Add, edit, and toggle active status of shop coin packages. |
| **Admin** | Transaction Audit Logs | `IMPLEMENTED` | `src/routes/admin.transactions.tsx`. Audit log matching PayMongo checkout orders with PlayFab credits. |
| **Admin** | Gallery CMS Management | `IMPLEMENTED` | `src/routes/admin.gallery.tsx`. Upload, caption, order, and delete screenshots stored in blob storage. |
| **Admin** | FAQ & News CMS | `IMPLEMENTED` | `src/routes/admin.faq.tsx`, `src/routes/admin.news.tsx`. Content management for public FAQs and updates. |
| **Admin** | Release / APK Management | `IMPLEMENTED` | `src/routes/admin.releases.tsx`. Upload Android APK builds and configure active public download version. |
| **Admin** | Inquiries & Bug Reports | `IMPLEMENTED` | `src/routes/admin.bugs.tsx`, `src/routes/admin.messages.tsx`. Review, filter, and archive user bug reports and contact notes. |

---

## 2. Feature Functionality Table

| Feature | Actor | Purpose | Input | Process | Output | Data/Service Used |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Account Registration** | Visitor | Create persistent game/web identity | Username, Email, Password | Client validation, PlayFab `RegisterPlayFabUser` | Account created, session ticket issued | PlayFab Client API |
| **Portal Login** | Player | Authenticate user session | Username/Email, Password | Call PlayFab login endpoint, check active bans | Session cookie, redirect to dashboard | PlayFab Client API |
| **Dashboard Display** | Player | View real-time progression | Session ticket | Query `GetUserData` and `GetPlayerStatistics` | Formatted XP bar, level, cosmetics, regional stats | PlayFab UserData & Statistics |
| **Character Renaming** | Player | Set custom persona name | Character Name string | Validate length & sanitization, update UserData | Success notification, updated UI | PlayFab UserData (`CharacterName`) |
| **Almanac Reader** | Player | Review bridge learning & history | Session ticket | Parse `AlmanacProgress` JSON, merge with educational CMS | Interactive regions, levels, bridge types, and force diagrams | PlayFab UserData & Web CMS |
| **Coin Pack Purchase** | Player | Purchase in-game coins | Product selection, Payment details | Call PayMongo checkout API, process redirect | Paid order, PlayFab currency credited | PayMongo & PlayFab Admin API |
| **Blueprint Construction** | Game Player | Design bridge structures | Touch/mouse node and bar placement | Spatial snap, calculate member cost, undo/redo stack | Geometric truss representation | Unity Engine (`BarCreator.cs`) |
| **Stress Simulation** | Game Player | Validate structural integrity | Simulation launch command | Iterative matrix/FEA stress solver, vehicle pathing | Deflection, color stress, pass/collapse | Unity Engine (`DeterministicBridgeStressSolver.cs`) |
| **Dashboard Cloud Sync** | Game Player | Push mobile progress to web | Save event trigger | Construct 15-field payload, invoke `syncDashboardV1` | Updated PlayFab UserData & Statistics | PlayFab CloudScript |
| **Player Directory Search** | Admin | Find player accounts | Search query (ID/Name/Email) | Server-side directory query, filtering by ban state | Filtered player records table | PlayFab Admin API |
| **Ban Player** | Admin | Suspend abusive player | Reason, Duration, PlayFab ID | Invoke PlayFab `BanUsers` with secret key | Account banned, access terminated | PlayFab Admin API |
| **Unban Player** | Admin | Restore banned player access | PlayFab ID | Invoke PlayFab `RevokeAllBansForUser` | Account restored to Active | PlayFab Admin API |
| **Coin Products CRUD** | Admin | Configure shop pricing | Name, Coin amount, PHP price | Validate price, update server product repository | Updated catalog in shop | Server Storage / API |
| **Release Management** | Admin | Publish new game builds | APK file, version, release notes | Upload to blob storage, update release manifest | Download page reflects new APK | Vercel Blob Storage & CMS |

---

## 3. Detailed Technical Feature Breakdown

### 3.1 Feature: Player Registration & Authentication
* **Actor**: Visitor / Registered Player
* **Purpose**: Provide a single, secure identity valid across both the Android mobile client and the web application.
* **Precondition**: User is not logged in and has internet access.
* **Input**: Username (3–20 alphanumeric chars), valid Email, Password (minimum 8 chars with uppercase, lowercase, numbers).
* **Process**: Form input passes client sanitization and complexity verification. The client dispatches `Client/RegisterPlayFabUser` to Title ID `17FA03`. On success, PlayFab provisions a player master entity and issues an authenticated session ticket.
* **Output**: Persistent account created; session stored in browser session storage; automated redirect to `/dashboard`.
* **Postcondition**: User exists in PlayFab database and can authenticate immediately into either game or website.
* **Data Used**: Username, Email, Password, PlayFab ID, Session Ticket.
* **Backend/API Used**: PlayFab Client API (`/Client/RegisterPlayFabUser`, `/Client/LoginWithPlayFab`).
* **Error/Alternative Flow**:
  * If Username or Email already exists, PlayFab returns error code 1007 or 1009. UI highlights input with inline remediation guidance.

### 3.2 Feature: Player Dashboard Progression View
* **Actor**: Registered Player
* **Purpose**: Provide players with a web-accessible summary of their in-game career, level, experience points, equipped wardrobe items, and contract achievements.
* **Precondition**: Player is authenticated with a valid PlayFab session ticket.
* **Input**: Active session ticket.
* **Process**: Website dispatches concurrent queries: `Client/GetUserData` requesting 15 designated keys and `Client/GetPlayerStatistics` requesting career aggregates (`TotalScore`, `BridgesCompleted`, etc.). The system verifies the existence of `CharacterSyncedAt`. If present, JSON sub-documents (`MapProgress`, `EquippedCosmetics`, `AlmanacProgress`) are parsed safely through schema sanitizers.
* **Output**: Formatted level ring, XP progress bar, wardrobe preview cards, regional completion tags, and score cards.
* **Postcondition**: Real-time read-only projection rendered; raw save files remain untouched.
* **Data Used**: `CurrentLevel`, `XP`, `XPToNextLevel`, `MapProgress`, `EquippedCosmetics`, `TotalScore`, `BridgesCompleted`.
* **Backend/API Used**: PlayFab Client API (`/Client/GetUserData`, `/Client/GetPlayerStatistics`).
* **Error/Alternative Flow**:
  * If the player has not yet completed a game session on Android, `CharacterSyncedAt` is absent. The dashboard displays an "Awaiting game sync" indicator with clean empty states rather than fabricated default scores.

### 3.3 Feature: 2D Blueprint Construction Mode
* **Actor**: CivilCraft Game Player
* **Purpose**: Provide an interactive drafting workspace for engineering bridge trusses across natural canyon spans under financial constraints.
* **Precondition**: Player enters a contract level in the Unity mobile game.
* **Input**: Touch or mouse gestures designating node coordinates and connecting beam members.
* **Process**: `BarCreator.cs` detects start and end nodes, checks span length limits, instantiates structural bar GameObjects, and assigns selected material ScriptableObjects (`BridgeMaterialSO.cs`). `CommandManager.cs` records modifications to support unlimited undo/redo operations. The system dynamically sums member lengths multiplied by unit costs to compute expenditure against the contract budget.
* **Output**: 2D structural frame with distinct material textures and real-time budget indicator.
* **Postcondition**: Bridge topology stored in `SavedBridgeData` (points and bars).
* **Data Used**: Point coordinates, node anchor flags, member start/end indices, material identifiers, contract budget.
* **Backend/API Used**: Unity native engine logic.
* **Error/Alternative Flow**:
  * If a proposed member exceeds maximum structural length, placement is rejected with an audible warning and visual red guide line.

### 3.4 Feature: Structural Mechanics Stress Simulation
* **Actor**: CivilCraft Game Player
* **Purpose**: Validate whether the drafted bridge design can safely support live dynamic vehicle loads according to physical principles.
* **Precondition**: Bridge construction is complete with at least two supported anchor points.
* **Input**: Player taps "Test / Simulate".
* **Process**: `BridgePhysicsManager.cs` instantiates dynamic rigidbodies and joint constraints. `DeterministicBridgeStressSolver.cs` performs iterative force balance equations to compute axial forces (tension and compression) on every member as test vehicles cross the deck. Material shaders dynamically tint bars from green (low stress) to yellow (moderate stress) to crimson red (critical stress).
* **Output**: Dynamic visual deflection, stress heatmaps, and pass/fail crossing result.
* **Postcondition**: Result graded via `ContractStarResult` (Cleared, Efficient, Strong) and saved to local state.
* **Data Used**: Young's Modulus, yield strength, vehicle mass, member geometry.
* **Backend/API Used**: Unity native physics and custom stress solver.
* **Error/Alternative Flow**:
  * If axial stress exceeds yield limits, member snaps. The redistribution of loads causes catastrophic collapse; the vehicle plunges into the canyon. Simulation terminates and prompts design revision.

### 3.5 Feature: Dashboard Cloud Synchronization
* **Actor**: Game Player / Background Sync Service
* **Purpose**: Project sanitized mobile career progression to PlayFab cloud storage for website presentation.
* **Precondition**: Player is authenticated to PlayFab in the game client; local save committed.
* **Input**: `PlayerDataManager.OnSaveCommitted` event.
* **Process**: `DashboardSyncService.cs` debounces writes for 5 seconds. It computes an MD5 checksum of the current projection. If the checksum differs from the last publication, it serializes 15 fields into a `DashboardPayload` and calls PlayFab `Client/ExecuteCloudScript` targeting `syncDashboardV1`. The handler on Revision 5 validates all fields and updates private UserData and Statistics atomically.
* **Output**: PlayFab UserData and Statistics updated; confirmation returned to client.
* **Postcondition**: Website dashboard immediately reflects latest mobile accomplishments.
* **Data Used**: 15 projection fields (Level, XP, MapProgress, EquippedCosmetics, etc.).
* **Backend/API Used**: PlayFab CloudScript (`syncDashboardV1`).
* **Error/Alternative Flow**:
  * In the event of transient network failure, the service sets a dirty flag and attempts a retry after 30 seconds.

### 3.6 Feature: Admin Player Moderation (Ban / Unban)
* **Actor**: Administrator
* **Purpose**: Moderate player accounts to maintain platform integrity, manage abusive behavior, and reinstate access when appropriate.
* **Precondition**: Administrator possesses an authenticated session cookie on `/admin`.
* **Input**: Target PlayFab ID, moderation action, reason, and duration.
* **Process**:
  * *Ban*: Admin submits reason and duration in dossier modal. Browser posts to `/api/admin/players/ban`. Server executes PlayFab `Admin/BanUsers` using `PLAYFAB_SECRET_KEY`. Active session tickets are invalidated immediately.
  * *Unban*: Admin confirms unban action. Browser posts to `/api/admin/players/unban`. Server executes PlayFab `Admin/RevokeAllBansForUser`.
* **Output**: Authoritative PlayFab account mutation; immediate UI status badge update (Active <-> Banned).
* **Postcondition**: Player is either blocked from logging into game/web or restored to full access.
* **Data Used**: PlayFab ID, Admin session token, ban reason, ban duration.
* **Backend/API Used**: PlayFab Admin API (`Admin/BanUsers`, `Admin/RevokeAllBansForUser`).
* **Error/Alternative Flow**:
  * Requests lacking CSRF protection or issued without active admin authorization are rejected with HTTP 401/403.

### 3.7 Feature: Dynamic Coin Products & PayMongo Checkout
* **Actor**: Administrator / Registered Player
* **Purpose**: Provide an administrative interface to configure coin packages and allow players to purchase coins via domestic payment options.
* **Precondition**: PayMongo API keys configured; player authenticated.
* **Input**: Product ID, payment method details.
* **Process**: Admin defines coin packs with PHP pricing. When a player purchases a pack on `/dashboard/shop`, the server creates a PayMongo checkout session (`/v1/checkout_sessions`). PayMongo redirects the player to complete payment via GCash, Maya, QR Ph, or Card. Upon payment, PayMongo issues a webhook (`checkout_session.payment.paid`). The server verifies the HMAC signature, confirms the order, and calls PlayFab Admin API `AddUserVirtualCurrency` crediting virtual currency `CO`.
* **Output**: Digital coins credited to player account; transaction recorded in audit log.
* **Postcondition**: Player virtual balance increased; transaction visible in admin dashboard.
* **Data Used**: Order ID, Product ID, centavo amount, currency (`PHP`), PlayFab ID, Virtual Currency Code (`CO`).
* **Backend/API Used**: PayMongo REST API, PlayFab Admin API (`Admin/AddUserVirtualCurrency`).
* **Error/Alternative Flow**:
  * If a duplicate webhook event is delivered, the server checks the existing order record and returns 200 OK idempotently without crediting currency a second time.
