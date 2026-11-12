# CivilCraft Account Deletion & Data Dependency Security Audit

**Document Version:** 1.0.0  
**Target Environment:** CivilCraft Production Architecture (PlayFab Title `17FA03` + PostgreSQL Database + Unity Client)  
**Audience:** Backend Engineers, Security Auditors, Compliance Reviewers  

---

## 1. Executive Summary

This document details the multi-system data dependency security audit conducted for account deletion in CivilCraft. 

Because CivilCraft coordinates account credentials, encrypted game saves, level progression, real-time leaderboards, virtual currency ledgers, and local mobile storage across independent systems, automated self-service account deletion cannot be safely executed via client-side endpoints. 

In particular, the PostgreSQL virtual currency database enforces immutable audit triggers that strictly reject SQL `DELETE` operations, while the Unity Android client retains local save files that require an explicit client-side wipe protocol.

Consequently, the player-facing Player Settings dashboard displays an honest **"Currently Unavailable"** status for account deletion, avoiding any misleading or simulated request submission until the coordinated multi-system backend erasure pipeline is implemented.

---

## 2. Multi-System Architecture Audit

CivilCraft player data is distributed across six distinct architectural layers:

```
+-----------------------------------------------------------------------------------+
|                            1. PlayFab Master Account                              |
|   (Credentials, Login Email, Username, Linked Devices, Contact Email, Passwords)  |
+-----------------------------------------------------------------------------------+
                                         |
         +-------------------------------+-------------------------------+
         |                               |                               |
+-------------------+           +-------------------+           +-------------------+
|  2. Entity Files  |           | 3. Title UserData |           |  4. PostgreSQL    |
| playerSaveData    |           | Levels, XP, Keys  |           | Currency Accounts |
| characterPortrait |           | Statistics/Leader |           | Purchase Receipts |
+-------------------+           +-------------------+           +-------------------+
         |                                                               |
+-------------------+                                           +-------------------+
|  5. Unity Client  |                                           | 6. Client Session |
| persistentDataPath|                                           | LocalStorage      |
| PlayerPrefs       |                                           | SessionTicket     |
+-------------------+                                           +-------------------+
```

### Layer 1: Authentication & Credentials (PlayFab Master Account)
- **Data Covered:** Master Player Account ID, username, login email, password hash, device IDs, contact email addresses, account status (active/banned).
- **Technical Constraint:** The PlayFab Client API provides no endpoint for account deletion. Deletion requires privileged invocation of `Admin/DeleteMasterPlayerAccount` using the `PLAYFAB_SECRET_KEY`.
- **Security Requirement:** Secret keys must never be exposed to the browser. Deletion must be executed through a secured, authenticated server endpoint.

### Layer 2: Game Saves & Customization (PlayFab Title Entity Files)
- **Data Covered:** `playerSaveData.json` (encrypted level progress, bridge geometry, placed components) and `characterPortrait.png` (rendered chibi character avatar).
- **Technical Constraint:** Entity files are stored as Title Player Account objects in PlayFab's Entity File service. Deleting the master player account without first purging entity objects can leave orphaned binary blobs in the title's storage quota.
- **Security Requirement:** The deletion worker must invoke `File/DeleteFiles` for the player's entity context before or during master account removal.

### Layer 3: Player Progression & Almanac (PlayFab Title UserData & Statistics)
- **Data Covered:** `UserData` keys (`CurrentLevel`, `XP`, `MapProgress`, `EquippedCosmetics`, `AlmanacProgress`, `PolicyAgreement`, etc.) and `Statistics` (`TotalScore`, `BridgesCompleted`, `ChallengesCompleted`, `BestSingleBuildScore`).
- **Technical Constraint:** PlayFab leaderboard rankings remain indexed in the title leaderboard even if UserData is cleared.
- **Security Requirement:** Leaderboard statistic values must be reset or cleared before account unlinking to prevent ghost entries on global rankings.

### Layer 4: Virtual Currency & Purchases (PostgreSQL Database)
- **Data Covered:** In-game currency accounts (`civilcraft_currency.accounts`) and purchase receipts (`civilcraft_currency.receipts`).
- **Technical Blocker & Constraint:** The PostgreSQL database enforces strict financial ledger immutability via table triggers:
  ```sql
  -- Trigger: permanent_account on civilcraft_currency.accounts
  CREATE OR REPLACE FUNCTION check_account_immutable() RETURNS TRIGGER AS $$
  BEGIN
    RAISE EXCEPTION 'Currency accounts must not be deleted';
  END;
  $$ LANGUAGE plpgsql;

  -- Trigger: permanent_receipt on civilcraft_currency.receipts
  CREATE OR REPLACE FUNCTION check_receipt_immutable() RETURNS TRIGGER AS $$
  BEGIN
    RAISE EXCEPTION 'Purchase receipts must never be deleted';
  END;
  $$ LANGUAGE plpgsql;
  ```
  Any attempt to execute an SQL `DELETE` on a player who has made a purchase or holds a currency account will abort with a fatal exception.
- **Compliance Requirement:** Financial accounting regulations require retention of transaction records. To comply with privacy laws (GDPR/CCPA/DPA), the system must implement a **pseudonymization / anonymization** procedure rather than a hard delete:
  - Personal identifiers (`playfab_id`, linked email, order references) must be cryptographically hashed or overwritten with an anonymous UUID (`DELETED_PLAYER_<hash>`).
  - Purchase amounts, timestamps, and receipt tokens are preserved for tax and financial auditing without referencing identifiable individual data.

### Layer 5: Local Device Storage (Unity Mobile Client)
- **Data Covered:** Local encrypted `playerSaveData.json` in `Application.persistentDataPath` and cached authentication tokens in Unity's `PlayerPrefs`.
- **Technical Constraint:** If server records are deleted while the player's Android device retains local saves, the next game launch will attempt to sync an orphaned save to a nonexistent backend account, triggering unhandled exceptions or recreating a blank account.
- **Security Requirement:** A client-side reset protocol must be built into the Unity APK (or handled upon 404/deleted login response) to wipe local save files and clear device storage.

### Layer 6: Active Browser Sessions & Cache
- **Data Covered:** Session tickets stored in `localStorage` (`civilcraft.session.player.v1`), cached user profile queries in `@tanstack/react-query`, and browser cookies.
- **Security Requirement:** Upon confirmed deletion, the server must revoke the session ticket in PlayFab, and the client must call `logout("player")` and invalidate all query caches.

---

## 3. Audit Matrix Table

| System | Storage Component | Data Covered | Deletion Blocker / Constraint | Required Resolution |
|---|---|---|---|---|
| **PlayFab Master Account** | Server-side credentials | Username, login email, password hash, device IDs | No Client API method; requires Server Secret Key (`Admin/DeleteMasterPlayerAccount`) | Server-side orchestration endpoint |
| **PlayFab Title Entity Files** | Blob / Entity Storage | `playerSaveData.json`, `characterPortrait.png` | Orphaned storage blobs if master account is deleted first | Explicit `File/DeleteFiles` call prior to account deletion |
| **PlayFab Title UserData** | UserData & Statistics | Progression, scores, cosmetics, policy records | Leaderboards retain statistics until cleared | Bulk UserData wipe & statistics zeroing |
| **PostgreSQL Database** | Currency & Receipts | Account balances, transaction receipts | Database triggers (`permanent_account`, `permanent_receipt`) reject `DELETE` queries | Anonymization/pseudonymization migration pipeline |
| **Unity Android Client** | Device Storage | Local save files, `PlayerPrefs` credentials | Device retains orphaned saves causing launch crashes | APK update with remote wipe / local clear on 401/404 |
| **Browser Client** | LocalStorage / Cookies | `SessionTicket`, cached queries | Stale sessions and cached data | Complete session revocation & storage purge |

---

## 4. Player Settings UI Integration Rationale

1. **No Simulated Deletion Requests:**  
   Because no verified background worker or database queue currently exists to orchestrate the 6-layer deletion flow, the player dashboard must **not** claim that deletion requests are submitted, queued, or processed.
2. **Clear "Currently Unavailable" Status:**  
   The player interface displays an unambiguous **Currently Unavailable** status badge and notice, clearly stating that automated self-service account deletion is under development.
3. **Player-Friendly Language:**  
   Internal database trigger names (`permanent_account`, `permanent_receipt`), PlayFab Admin API method signatures, and schema technicalities are reserved for this developer documentation rather than exposing confusing developer jargon to players.
4. **Reauthentication Readiness:**  
   The reauthentication logic (`reauthenticatePlayer`) is preserved in `src/lib/playfab/account-settings.ts` and covered by automated regression tests so that when the server-side deletion pipeline is deployed, identity verification can be connected seamlessly.

