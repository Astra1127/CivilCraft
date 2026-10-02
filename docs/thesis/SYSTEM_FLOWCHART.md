# CivilCraft: System Flowcharts & Architectural Diagrams
**Thesis System Architecture & Process Workflows**

---

## 1. High-Level System Architecture Flowchart

The following diagram illustrates the overarching architecture of CivilCraft: Bridge Edition, showing the interaction between the player, the public website, the Unity mobile client, PlayFab cloud services, the administrative portal, and external integrations (PayMongo).

```mermaid
flowchart TD
    %% Actors
    ActorPlayer(["Player / Visitor"])
    ActorAdmin(["Administrator"])

    %% Public Web & Account Creation
    subgraph WebPortal ["CivilCraft Public Web Platform"]
        PublicHome["Browse Home, About, Almanac, Gallery"]
        DownloadAPK["Download CivilCraft APK"]
        RegisterWeb["Register Account (Username, Email, Password)"]
        LoginWeb["Login with PlayFab Credentials"]
        AuthDecision{"Credentials Valid?"}
        PlayerDashboard["Player Dashboard<br/>(Level, XP, Cosmetics, Almanac)"]
        ShopCheckout["Player Shop & PayMongo Checkout<br/>(GCash, Maya, QR Ph, Cards)"]
    end

    %% Mobile Android Game
    subgraph MobileGame ["CivilCraft Android Game (Unity)"]
        LaunchGame["Launch CivilCraft Mobile App"]
        GameLogin["Login / Auto-Authenticate"]
        GameAuthDecision{"PlayFab Login OK?"}
        GuestMode["Play as Offline Guest"]
        LoadSave["Load Local Save / Fetch PlayFab Entity File"]
        ConflictDecision{"Cloud Conflict?"}
        ResolveConflict["Authored Save Choice Dialog"]
        GameplayLoop["Story Mode: Contracts, 2D Blueprint Build, Stress Solver"]
        SimulationTest["Load Test Simulation (Vehicles Cross)"]
        TestResultDecision{"Bridge Stable & Under Budget?"}
        ReviseDesign["Revise Structural Layout"]
        SaveLocal["Commit Save & Grade 3-Star Result"]
        DebounceSync["DashboardSyncService<br/>(5s Debounce & Dirty Check)"]
    end

    %% Cloud Infrastructure
    subgraph CloudBackend ["PlayFab & External Cloud Services"]
        PFAuth["PlayFab Auth Service<br/>(Title ID: 17FA03)"]
        CloudScript["CloudScript Handler<br/>(syncDashboardV1)"]
        UserDataStore[("PlayFab UserData<br/>(15 Dashboard Keys)")]
        UserStatsStore[("PlayFab Statistics<br/>(TotalScore, Bridges, Challenges)")]
        EntitySaveStore[("PlayFab Entity Files<br/>(Full Encrypted Save)")]
        PayMongoGW["PayMongo API & Webhooks"]
    end

    %% Admin Portal
    subgraph AdminPortal ["Admin Operations Dashboard"]
        AdminLogin["Admin Login Screen"]
        AdminAuthCheck{"Session Token Valid?"}
        AdminHub["Admin Hub<br/>(Metrics & Operations)"]
        ModPlayers["Player Management<br/>(Search, Ban, Unban)"]
        ModProducts["Coin Products Management"]
        ModCMS["CMS (Gallery, Releases, FAQ, News)"]
    end

    %% Player / Web Flows
    ActorPlayer --> PublicHome
    PublicHome --> DownloadAPK
    PublicHome --> RegisterWeb
    RegisterWeb --> PFAuth
    PublicHome --> LoginWeb
    LoginWeb --> PFAuth
    PFAuth --> AuthDecision
    AuthDecision -- "No" --> LoginWeb
    AuthDecision -- "Yes" --> PlayerDashboard
    PlayerDashboard --> ShopCheckout
    ShopCheckout --> PayMongoGW
    PayMongoGW -- "Webhook Success" --> CloudScript

    %% Game Flows
    ActorPlayer --> LaunchGame
    LaunchGame --> GameLogin
    GameLogin --> PFAuth
    PFAuth --> GameAuthDecision
    GameAuthDecision -- "No / Offline" --> GuestMode
    GameAuthDecision -- "Yes" --> LoadSave
    GuestMode --> GameplayLoop
    LoadSave --> ConflictDecision
    ConflictDecision -- "Yes" --> ResolveConflict
    ConflictDecision -- "No" --> GameplayLoop
    ResolveConflict --> GameplayLoop
    GameplayLoop --> SimulationTest
    SimulationTest --> TestResultDecision
    TestResultDecision -- "No (Collapses)" --> ReviseDesign
    ReviseDesign --> GameplayLoop
    TestResultDecision -- "Yes (Passed)" --> SaveLocal
    SaveLocal --> EntitySaveStore
    SaveLocal --> DebounceSync
    DebounceSync --> CloudScript

    %% Synchronization to Web
    CloudScript --> UserDataStore
    CloudScript --> UserStatsStore
    UserDataStore -.->|Client/GetUserData| PlayerDashboard
    UserStatsStore -.->|Client/GetPlayerStatistics| PlayerDashboard

    %% Admin Flow
    ActorAdmin --> AdminLogin
    AdminLogin --> AdminAuthCheck
    AdminAuthCheck -- "Yes" --> AdminHub
    AdminHub --> ModPlayers
    AdminHub --> ModProducts
    AdminHub --> ModCMS
    ModPlayers --> PFAuth
```

---

## 2. Detailed Process Flowcharts

### 2.1 Registration & Authentication Flow
```mermaid
flowchart TD
    Start(["User initiates sign-up / login"]) --> Mode{"Action"}
    Mode -- "Sign-Up" --> InputReg["Enter Username, Email, Password, Confirm Password"]
    InputReg --> ClientVal{"Passes Client Password Rules?<br/>(>=8 chars, lowercase, uppercase, number)"}
    ClientVal -- "Fail" --> RegError["Show Validation Error"]
    ClientVal -- "Pass" --> PFRegCall["Call PlayFab Client/RegisterPlayFabUser"]
    PFRegCall --> PFRegRes{"Registration Success?"}
    PFRegRes -- "Fail" --> ShowPFError["Display PlayFab Error (e.g. Email in use)"]
    PFRegRes -- "Pass" --> AutoLog["Automatically Authenticate & Store Session Ticket"]

    Mode -- "Login" --> InputLog["Enter Username/Email & Password"]
    InputLog --> CallLogin["Call PlayFab Client/LoginWithPlayFab or LoginWithEmailAddress"]
    CallLogin --> LogRes{"Valid Credentials?"}
    LogRes -- "Fail" --> LogError["Show Invalid Credentials Notice"]
    LogRes -- "Pass" --> CheckBan{"Is Account Banned?"}
    CheckBan -- "Yes" --> BanLock["Deny Access with Ban Notice"]
    CheckBan -- "No" --> StoreSession["Set Auth State in Browser Session Storage"]
    AutoLog --> StoreSession
    StoreSession --> GoDash(["Redirect to /dashboard"])
```

### 2.2 Player Dashboard Data Retrieval Flow
```mermaid
flowchart TD
    OpenDash(["Player navigates to /dashboard"]) --> CheckTicket{"Valid Session Ticket in Memory?"}
    CheckTicket -- "No" --> RedirectLog["Redirect to /login"]
    CheckTicket -- "Yes" --> ParallelFetch["Issue Parallel Requests to PlayFab"]

    ParallelFetch --> ReqProfile["Client/GetPlayerCombinedInfo<br/>(Username, CreatedAt, LastLogin)"]
    ParallelFetch --> ReqUserData["Client/GetUserData<br/>(15 Dashboard Keys)"]
    ParallelFetch --> ReqStats["Client/GetPlayerStatistics<br/>(TotalScore, BridgesCompleted, etc.)"]

    ReqProfile --> Merge["Merge & Sanitize Dashboard Data"]
    ReqUserData --> Merge
    ReqStats --> Merge

    Merge --> ParseCheck{"Are UserData Keys Present?"}
    ParseCheck -- "Missing / Null" --> ShowAwaiting["Display 'Awaiting Game Sync' Banner & Empty Cards"]
    ParseCheck -- "Present" --> ParseJSON["Parse MapProgress, EquippedCosmetics, AlmanacProgress"]
    ParseJSON --> RenderUI["Render XP Bar, Cosmetic Avatars, Regional Status & Stats"]
    RenderUI --> EndDash(["Dashboard Ready"])
```

### 2.3 Game → PlayFab → Website Synchronization Flow
```mermaid
flowchart TD
    UnityEvent(["Player completes contract / changes outfit in Unity"]) --> Trigger["PlayerDataManager commits local save"]
    Trigger --> Debounce["DashboardSyncService: 5-Second Debounce Timer"]
    Debounce --> AuthCheck{"Is Client Logged in to PlayFab & Non-Guest?"}
    AuthCheck -- "No" --> SkipSync["Suppress Cloud Sync"]
    AuthCheck -- "Yes" --> ChecksumCheck{"Has Payload Changed from Last Sync?"}
    ChecksumCheck -- "No" --> SkipSync
    ChecksumCheck -- "Yes" --> BuildPayload["Construct DashboardPayload<br/>(15 Projection Fields)"]

    BuildPayload --> ExecCloudScript["Call PlayFab Client/ExecuteCloudScript<br/>(FunctionName: 'syncDashboardV1')"]
    ExecCloudScript --> CSExec{"CloudScript Validation Passed?"}
    CSExec -- "No" --> LogRetry["Log Error & Schedule 30s Retry"]
    CSExec -- "Yes" --> AtomicWrite["PlayFab Handler Writes:<br/>1. Private UserData (11 keys)<br/>2. Statistics (4 metrics)<br/>3. Timestamp (CharacterSyncedAt)"]

    AtomicWrite --> CloudReady[("PlayFab Database Updated")]
    CloudReady --> WebPoll["Website queries /Client/GetUserData upon next page open"]
    WebPoll --> WebRender(["Player sees updated Level, Score, Cosmetics, & Almanac"])
```

### 2.4 Bridge Construction & Load-Testing Gameplay Flow
```mermaid
flowchart TD
    EnterLevel(["Enter Engineering Contract"]) --> ViewBrief["Review Budget, Span Length & Required Load"]
    ViewBrief --> BuildMode["Open 2D Drafting Grid"]

    BuildMode --> Action{"Player Action"}
    Action -- "Draw Member" --> DrawBar["Click start node to end node -> Create Bar"]
    Action -- "Select Material" --> ChangeMat["Toggle Wood, Steel, or Cable"]
    Action -- "Edit" --> UndoAction["Undo / Redo / Delete Node"]
    Action -- "Calculate Cost" --> BudgetCalc["Calculate Length * Material Cost -> Update Spent Budget"]

    BudgetCalc --> ReadyTest{"Ready to Test?"}
    ReadyTest -- "No" --> BuildMode
    ReadyTest -- "Yes" --> StartSim["Initialize Deterministic Physics Simulation"]

    StartSim --> SpawnVehicle["Dispatch Test Vehicles Across Bridge"]
    SpawnVehicle --> LoopPhysics["Frame Step: Calculate Joint Moments & Bar Forces"]
    LoopPhysics --> StressEval{"Member Stress > Material Limit?"}
    StressEval -- "Yes" --> BreakMember["Structural Failure: Member Snaps & Bridge Collapses"]
    BreakMember --> SimFail["Simulation Fails: Vehicle Plummets"]
    SimFail --> ReturnDraft["Prompt Player: Modify and Reinforce Truss Design"]
    ReturnDraft --> BuildMode

    StressEval -- "No" --> VehicleAcross{"Vehicle Reaches Other Side?"}
    VehicleAcross -- "No" --> LoopPhysics
    VehicleAcross -- "Yes" --> SimPass["Simulation Success: Contract Completed!"]
    SimPass --> GradeResult["Calculate 3-Star Score:<br/>1. Cleared Crossing<br/>2. Cost <= Budget<br/>3. Peak Stress <= Stress Limit"]
    GradeResult --> SaveResult(["Save to Local Archive & Trigger Cloud Sync"])
```

### 2.5 Bridge Almanac Discovery & Progression Flow
```mermaid
flowchart TD
    GameEvent(["In-Game Discovery Event"]) --> DiscoverType{"Discovery Type"}
    DiscoverType -- "Level Cleared" --> AddRegion["Mark Region & Level Completed in PlayerData"]
    DiscoverType -- "Lesson Triggered" --> AddLesson["Mark Engineering Concept Discovered"]
    DiscoverType -- "Material Used" --> AddMaterial["Acknowledge Material Introduction Popup"]

    AddRegion --> CompileAlmanac["Compile AlmanacProgress DTO"]
    AddLesson --> CompileAlmanac
    AddMaterial --> CompileAlmanac

    CompileAlmanac --> CloudSync["DashboardSyncService executes syncDashboardV1"]
    CloudSync --> StoredPF[("PlayFab UserData: AlmanacProgress")]

    StoredPF --> WebVisit(["Player visits /dashboard/almanac"])
    WebVisit --> ReadPF["Website queries Client/GetUserData"]
    ReadPF --> SafeParser["parseAlmanacProgress safely unpacks JSON"]
    SafeParser --> CombineCMS["Merge with Website Educational CMS<br/>(Bridge types, force diagrams, real-world examples)"]
    CombineCMS --> DisplayAlmanac(["Display Completed Badges, Level Records, & Concepts"])
```

### 2.6 Admin Player Moderation Flow (Ban / Unban)
```mermaid
flowchart TD
    AdminNav(["Admin opens /admin/players"]) --> SearchPlayer["Search player by Username, Email, or PlayFab ID"]
    SearchPlayer --> QueryServer["Call /api/admin/players/directory"]
    QueryServer --> DisplayList["Display Player Table"]
    DisplayList --> SelectPlayer["Select Player to Open Dossier"]

    SelectPlayer --> InspectStatus{"Is Player Currently Banned?"}

    InspectStatus -- "Not Banned" --> ShowBanBtn["Show 'Ban Player' Action"]
    ShowBanBtn --> ClickBan["Admin clicks 'Ban Player'"]
    ClickBan --> BanModal["Prompt for Reason and Duration (Hours/Days/Permanent)"]
    BanModal --> ConfirmBan{"Confirm Action?"}
    ConfirmBan -- "Cancel" --> CancelAction["Dismiss Modal"]
    ConfirmBan -- "Confirm" --> CallBanAPI["POST to /api/admin/players/ban"]
    CallBanAPI --> PFAdminBan["Server calls PlayFab Admin/BanUsers using Secret Key"]
    PFAdminBan --> RefreshBan["Reload Player Dossier -> Status changes to 'Banned'"]

    InspectStatus -- "Currently Banned" --> ShowUnbanBtn["Show 'Unban Player' Action"]
    ShowUnbanBtn --> ClickUnban["Admin clicks 'Unban Player'"]
    ClickUnban --> UnbanModal["Show Confirmation: 'Restore Player Access to CivilCraft?'"]
    UnbanModal --> ConfirmUnban{"Confirm Action?"}
    ConfirmUnban -- "Cancel" --> CancelAction
    ConfirmUnban -- "Confirm" --> CallUnbanAPI["POST to /api/admin/players/unban"]
    CallUnbanAPI --> PFAdminUnban["Server calls PlayFab Admin/RevokeAllBansForUser"]
    PFAdminUnban --> RefreshUnban["Reload Player Dossier -> Status changes to 'Active'"]
```

### 2.7 Payment, Coin Purchase & Fulfillment Flow (PayMongo)
```mermaid
flowchart TD
    PlayerShop(["Player opens /dashboard/shop"]) --> FetchProducts["Fetch Active Products from /api/shop/products"]
    FetchProducts --> SelectItem["Select Coin Pack (e.g. 1,000 Coins - ₱100.00)"]
    SelectItem --> ClickBuy["Click 'Purchase Coins'"]

    ClickBuy --> PostCheckout["POST /api/payments/checkout with Product ID & Session Ticket"]
    PostCheckout --> VerifyServer["Server validates Product ID, Price, and Player Identity"]
    VerifyServer --> CreatePayMongo["Server invokes PayMongo API: /v1/checkout_sessions"]
    CreatePayMongo --> RetCheckout["Receive Checkout URL & Order Reference"]
    RetCheckout --> RedirectPayMongo["Redirect Browser to PayMongo Hosted Checkout"]

    RedirectPayMongo --> PayAction{"Player Completes Payment?"}
    PayAction -- "Cancel / Abandon" --> ReturnCancel["Redirect to /dashboard/payment/cancel"]
    PayAction -- "Success (GCash/QR/Card)" --> ReturnSuccess["Redirect to /dashboard/payment/success"]

    PayAction -- "Payment Confirmed" --> WebhookDispatch["PayMongo Dispatches Webhook: 'checkout_session.payment.paid'"]
    WebhookDispatch --> ServerWebhook["POST /api/payments/webhook"]
    ServerWebhook --> VerifySignature{"Valid Webhook Signature & Test Header?"}
    VerifySignature -- "No" --> Reject400["Reject Request with 400 Bad Request"]
    VerifySignature -- "Yes" --> CheckDuplicate{"Has Order Already Been Fulfilled?"}
    CheckDuplicate -- "Yes" --> Ack200["Acknowledge Idempotently with 200 OK"]
    CheckDuplicate -- "No" --> CreditPlayFab["Server calls PlayFab Admin API:<br/>Admin/AddUserVirtualCurrency (Code: 'CO')"]
    CreditPlayFab --> LogOrder["Update Order Status to 'paid' in Audit Database"]
    LogOrder --> Ack200
    ReturnSuccess --> PollStatus["Website polls /api/payments/orders -> Reflects Updated Coin Balance"]
```

### 2.8 Administrative Control & Management Flow
```mermaid
flowchart TD
    AdminEntry(["Administrator visits /admin"]) --> AuthCheck{"Has Active Signed Admin Cookie?"}
    AuthCheck -- "No" --> AdminLogin["Prompt for Master Admin Password"]
    AdminLogin --> VerifyPW{"Constant-Time Hash Matches?"}
    VerifyPW -- "No" --> Throttled["Record Failure & Enforce Throttling"]
    Throttled --> AdminLogin
    VerifyPW -- "Yes" --> IssueToken["Issue HMAC-SHA256 Signed Admin Session Cookie"]
    IssueToken --> AdminHub["Admin Dashboard Home (/admin)"]
    AuthCheck -- "Yes" --> AdminHub

    AdminHub --> Branch{"Select Admin Module"}

    Branch -- "Players" --> PlayersModule["Player Management (/admin/players)"]
    PlayersModule --> SearchDirectory["Search Players by ID, Username, Email"]
    SearchDirectory --> ViewDossier["Open Player Dossier Modal"]
    ViewDossier --> ModerateAction{"Moderation Action"}
    ModerateAction -- "Ban" --> ExecBan["Execute BanUsers via PlayFab Admin API"]
    ModerateAction -- "Unban" --> ExecUnban["Execute RevokeAllBans via PlayFab Admin API"]

    Branch -- "Products" --> ProductsModule["Coin Products (/admin/products)"]
    ProductsModule --> AddProduct["Create New Coin Package"]
    ProductsModule --> EditProduct["Modify PHP Price / Coin Amount"]
    ProductsModule --> ToggleProduct["Enable / Disable Product Availability"]

    Branch -- "Transactions" --> TransModule["Transaction Audit (/admin/transactions)"]
    TransModule --> AuditTrans["Inspect PayMongo Checkout Orders & PlayFab Currency Fulfillment"]

    Branch -- "Releases" --> ReleaseModule["Release Management (/admin/releases)"]
    ReleaseModule --> UploadAPK["Upload New Android APK Build & Set Active Download"]

    Branch -- "Content" --> CMSModule["Content Management (Gallery, FAQ, News)"]
    CMSModule --> ManageGallery["Upload & Edit Gameplay Gallery Screenshots"]
    CMSModule --> ManageFAQ["Add / Edit FAQ Answers"]

    Branch -- "Inquiries" --> MsgModule["Inbox (/admin/messages & /admin/bugs)"]
    MsgModule --> ReviewBugs["Review In-Game Bug Submissions"]
    MsgModule --> ReviewContact["Read & Resolve Contact Inquiries"]
```
