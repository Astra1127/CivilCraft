# Civil Craft: Bridge Edition — Policy Institutional Review Checklist

**Document Version:** 1.0.0  
**Date:** November 10, 2026  
**Auditor Role:** Senior Full-Stack Developer, Technical Auditor & Privacy Policy Implementation Reviewer  
**Context:** Undergraduate Academic Capstone Research Demonstration, Republic of the Philippines  
**Associated Policies:** [`/cookies`](file:///c:/Users/jemma/Documents/Thesis/Website/src/routes/cookies.tsx), [`/privacy`](file:///c:/Users/jemma/Documents/Thesis/Website/src/routes/privacy.tsx), [`/terms`](file:///c:/Users/jemma/Documents/Thesis/Website/src/routes/terms.tsx), and [`PolicyNav.tsx`](file:///c:/Users/jemma/Documents/Thesis/Website/src/components/site/PolicyNav.tsx)

---

## Overview

This checklist identifies **nine critical governance and legal decisions** that require formal institutional determination by university faculty advisers, the research ethics board, technology transfer officers, or institutional legal counsel before the website policies can be transitioned from technical review drafts to formally approved institutional policies.

Codebase audits have confirmed that the technical implementation accurately matches the policy descriptions (e.g., PayMongo sandbox enforcement, PlayFab password handling, cookie and storage lifespans, and manual account deletion workflows). However, technical auditing cannot substitute for formal institutional determinations.

---

## Institutional Confirmation Matrix

| # | Unresolved Decision | Primary Decision Maker | Required Documentation / Input | Affected Policy Sections |
| :- | :--- | :--- | :--- | :--- |
| **1** | **Personal Information Controller (PIC) Identity** | University Legal Counsel / Academic Dean | Formal entity designation (University vs. College vs. Student Team) | Privacy §1, §10; Terms §1, §10; Cookies §1, §4 |
| **2** | **Registered Data Protection Officer (DPO)** | University DPO / Compliance Office | DPO name, institutional contact email, and NPC registration status | Privacy §7, §10; Terms §10; PolicyNav Notice |
| **3** | **Minimum Account Age & Research Eligibility** | Research Ethics Board / Thesis Committee | Minimum age limit (13+ with consent vs. 17+ college cohort); minor consent protocol | Terms §2; Privacy §2, §3; Signup page |
| **4** | **Data Retention & Post-Defense Archiving** | Thesis Advisory Committee / University Archivist | Retention timeframe during study and post-defense decommissioning protocol | Privacy §5; Terms §8 |
| **5** | **Account Deletion & Financial Ledger Retention** | Ethics Committee / System Architects | Resolution between immutable PostgreSQL triggers and RA 10173 erasure rights | Privacy §7, §8; Terms §8; Dashboard Settings |
| **6** | **PayMongo Commercialization & Tax Obligations** | Technology Transfer Office / Business Counsel | Decision on non-commercial capstone status vs. live commercial entity and BIR tax compliance | Terms §1, §5; Privacy §2, §4 |
| **7** | **Intellectual Property (IP) Allocation** | Intellectual Property / Tech Transfer Office | University student thesis IP sharing policy, copyright allocation, open-source licensing | Terms §6; Website footer |
| **8** | **Public Leaderboard Privacy & Opt-Out** | Thesis Adviser / Ethics Committee | Decision on mandatory public display vs. player privacy opt-out toggle | Privacy §3, §7; Terms §3; Dashboard Leaderboards |
| **9** | **Research Ethics Clearance for Telemetry & Feedback** | Institutional Review Board (IRB) / Ethics Committee | Formal ethics clearance protocol number, participant consent scope, publication parameters | Privacy §3; Terms §1; PolicyNav Notice |

---

## Detailed Review Items

### 1. Official Personal Information Controller (PIC) Identity

- **Why Confirmation is Needed:**  
  Under Section 3(h) and Section 14 of the Philippine Data Privacy Act of 2012 (Republic Act No. 10173), a Personal Information Controller (PIC) is the entity that controls the collection, holding, processing, or use of personal data. The current policy text describes the PIC on an interim basis as the undergraduate student development team under faculty supervision. Because this project is an academic capstone conducted under university auspices, Philippine privacy regulations require clarification on whether the legal PIC is:
  1. The University as a corporate/educational entity;
  2. The Academic Department / College of Engineering;
  3. The Faculty Thesis Adviser; or
  4. The individual Student Researchers.
- **Who Should Confirm It:**  
  University Legal Counsel, University Data Protection Officer, Academic Department Chair, and Thesis Advisory Committee.
- **What Information Must Be Supplied:**  
  - Official legal entity name and registered organizational title.  
  - Clear designation of institutional versus student responsibility.  
  - Physical university mailing address and official registration status under RA 10173.  
- **Policy Sections That May Need Updating Afterward:**  
  - `Privacy Policy`: Section 1 (*About CivilCraft & Legal Framework*), Section 10 (*Contacting the Development Team & DPO*).  
  - `Terms of Use`: Section 1 (*Educational Purpose & Academic Scope*), Section 10 (*Governing Law & Contact Information*).  
  - `Cookie Policy`: Section 1 (*What Are Cookies & Browser Storage*), Section 4 (*Legal Basis & Consent Notice under RA 10173*).

---

### 2. Registered Data Protection Officer (DPO) and Official Contact Details

- **Why Confirmation is Needed:**  
  Section 21(b) of RA 10173 and NPC Circular No. 16-01 require designated PICs to appoint and register a Data Protection Officer (DPO) with the National Privacy Commission (NPC). The current website policies provide an interim contact mechanism via the public Contact form and an environment-configurable support email (`support@civilcraft.game`), explicitly noting that formal DPO appointment and NPC registration remain subject to university review.
- **Who Should Confirm It:**  
  University Data Protection Officer / Institutional Compliance Office.
- **What Information Must Be Supplied:**  
  - Official name, title, or office designation of the appointed DPO or departmental privacy contact.  
  - Official institutional email address dedicated to privacy inquiries (e.g., `dpo@<university>.edu.ph` or dedicated privacy inbox).  
  - NPC DPO Registration number (if registered) or written institutional determination of student project exemption.  
  - Official telephone number and institutional office location.  
- **Policy Sections That May Need Updating Afterward:**  
  - `Privacy Policy`: Section 10 (*Contacting the Development Team & DPO*), Section 7 (*Player Privacy Rights Under RA 10173*).  
  - `Terms of Use`: Section 10 (*Governing Law & Contact Information*).  
  - `Cookie Policy`: Section 4 (*Legal Basis & Consent Notice under RA 10173*).  
  - `PolicyNav.tsx`: `DraftReviewNotice` banner text.

---

### 3. Minimum Website Account Age and Research Participant Eligibility

- **Why Confirmation is Needed:**  
  There is an operational and research discrepancy between:
  1. The website's current Terms of Use and Privacy Policy, which allow accounts for individuals aged 13 and older (requiring parental/guardian consent for minors under Philippine law, following standard web conventions).  
  2. The thesis research methodology, which evaluates educational effectiveness among senior high school and tertiary undergraduate civil engineering learners (typically aged 17 to 24).  
  If minors (under 18 under Philippine law, RA 6809) are permitted to create accounts without verifiable parental consent, this introduces compliance risks under NPC Advisory Opinion No. 2017-023. If the research protocol restricts participation to individuals aged 18+ (or 17+ with institutional assent forms), website registration rules must be updated accordingly.
- **Who Should Confirm It:**  
  Institutional Review Board (IRB) / Research Ethics Committee, Thesis Advisory Committee.
- **What Information Must Be Supplied:**  
  - Definitive minimum age requirement for website registration and game access.  
  - Policy on whether minor registration (ages 13–17) is permitted or prohibited.  
  - If minors are permitted, the required parental consent collection or educational assent verification mechanism.  
  - Formal ethics clearance alignment regarding research subject demographics.  
- **Policy Sections That May Need Updating Afterward:**  
  - `Terms of Use`: Section 2 (*Player Registration & Account Security* — Eligibility).  
  - `Privacy Policy`: Section 2 (*Personal Data We Collect* — Account Registration Data), Section 3 (*Why We Process Personal Data* — Academic Research & Educational Evaluation).  
  - `src/routes/signup.tsx`: Age verification input or confirmation checkbox.

---

### 4. Data Retention and Post-Defense Archiving Schedule

- **Why Confirmation is Needed:**  
  The Storage Limitation Principle under RA 10173 (Section 11) mandates that personal data must not be retained longer than necessary for the fulfillment of its declared purposes. The current Privacy Policy documents the active research testing phase and notes that post-defense retention schedules require institutional confirmation.
- **Who Should Confirm It:**  
  Thesis Advisory Committee, Academic Department Chair, University Archivist / Office of Research.
- **What Information Must Be Supplied:**  
  - Specific duration for retaining player account data and telemetry during the active thesis study.  
  - Mandatory archiving timeframe following the final oral defense and approval of the thesis manuscript (e.g., 1 year, 3 years, or 5 years for academic auditability).  
  - Trigger conditions and protocol for data disposal: de-identification schedule, database purge steps, and PlayFab title deactivation or archiving.  
  - Policy regarding whether anonymized/aggregated bridge test metrics may be retained indefinitely for academic publications.  
- **Policy Sections That May Need Updating Afterward:**  
  - `Privacy Policy`: Section 5 (*Data Storage, Security & Retention*).  
  - `Terms of Use`: Section 8 (*Account Deletion & Data Removal Requests*).

---

### 5. Account Deletion and Financial Ledger Retention

- **Why Confirmation is Needed:**  
  A technical audit of the codebase (`docs/account-deletion-audit.md`) confirmed that self-service account deletion is offline in the player dashboard (`Delete Account (Unavailable)`). This is because the backend includes PostgreSQL immutable relational triggers (`permanent_account` and `permanent_receipt`) that prevent cascading row deletion in order to safeguard financial ledger integrity. However, Section 16(e) of RA 10173 guarantees data subjects the right to erasure and blocking of personal data.
- **Who Should Confirm It:**  
  University Research Ethics Committee, Institutional Legal Counsel, and Software Architecture Supervisors.
- **What Information Must Be Supplied:**  
  - Determination of whether simulated financial records (created in sandbox mode) must be retained for academic auditability or permanently deleted upon player request.  
  - Formal approval of the interim manual deletion workflow handled via the `/contact` form.  
  - Authorization to implement programmatic cascading erasure scripts (e.g., modifying database triggers to allow pseudonymization of financial ledger records while purging all identifiable personal data).  
- **Policy Sections That May Need Updating Afterward:**  
  - `Privacy Policy`: Section 7 (*Player Privacy Rights Under RA 10173*), Section 8 (*Account Deletion & Data Removal Requests*).  
  - `Terms of Use`: Section 8 (*Account Deletion & Data Removal Requests*).  
  - `src/components/dashboard/AccountSettings.tsx`: Activation and release of the self-service deletion workflow.

---

### 6. Future PayMongo Commercialization and Tax Obligations

- **Why Confirmation is Needed:**  
  The codebase strictly enforces PayMongo test mode (`sk_test_...`) in `src/lib/payments/paymongo.server.ts` and throws an explicit error if a live production key is provided. The policies accurately state that all purchases are simulated test transactions for academic evaluation. Prior policy drafts contained inaccurate claims of BSP regulation and tax compliance. If the project is ever commercialized beyond the academic defense, significant legal, corporate, and tax requirements must be fulfilled.
- **Who Should Confirm It:**  
  University Technology Transfer Office, Academic Business Incubator, Legal and Tax Counsel.
- **What Information Must Be Supplied:**  
  - Formal confirmation that the project remains strictly non-commercial and educational during its academic defense.  
  - If commercial monetization is pursued in the future:  
    - Legal entity structure (corporation, partnership, or university spin-off).  
    - Bureau of Internal Revenue (BIR) registration, Tax Identification Number (TIN), and value-added tax (VAT) electronic invoicing compliance for digital services.  
    - Live merchant underwriting and payment terms with PayMongo or other processors.  
- **Policy Sections That May Need Updating Afterward:**  
  - `Terms of Use`: Section 1 (*Educational Purpose & Academic Scope*), Section 5 (*Virtual Coins, Payments & Purchases*).  
  - `Privacy Policy`: Section 2 (*Personal Data We Collect* — Payment & Coin Shop Data), Section 4 (*Third-Party Services & Data Sharing*).

---

### 7. Intellectual Property (IP) Ownership Agreement

- **Why Confirmation is Needed:**  
  Under the Intellectual Property Code of the Philippines (Republic Act No. 8293) and institutional university policies, ownership of student capstone software, source code, visual artwork, and documentation may be subject to institutional sharing agreements. The Terms of Use currently state that original project assets belong to the student development team and their academic institution, while players retain creative ownership over unique bridge blueprints with a non-exclusive license granted to the project.
- **Who Should Confirm It:**  
  University Intellectual Property / Technology Transfer Office (IP-TTO), Thesis Advisers, and Student Authors.
- **What Information Must Be Supplied:**  
  - Specific university IP policy applicable to undergraduate capstone software.  
  - Written IP assignment or joint-ownership agreement between the university and the student team.  
  - Formal approval of terms governing player-generated bridge designs (player ownership vs. non-exclusive display license).  
  - Selected open-source or academic license designation for the software (e.g., MIT, Apache 2.0, Creative Commons, or proprietary university copyright).  
- **Policy Sections That May Need Updating Afterward:**  
  - `Terms of Use`: Section 6 (*Intellectual Property & Ownership*).  
  - Public website footer copyright notices.

---

### 8. Public Leaderboard Privacy and Opt-Out Decision

- **Why Confirmation is Needed:**  
  Verification of `src/lib/playfab/leaderboard.server.ts` and `src/routes/leaderboard.tsx` confirmed that player display names, total scores, and challenge completions are published to the public website without an individual privacy opt-out toggle. While scores are pseudonymous gaming metrics, publishing performance records without a privacy toggle could raise concerns under Section 16(d) of RA 10173 (Right to Object) if a player objects to public ranking visibility.
- **Who Should Confirm It:**  
  Thesis Research Adviser, Institutional Review Board / Ethics Committee.
- **What Information Must Be Supplied:**  
  - Confirmation whether public leaderboard indexing is an inherent gameplay element covered by acceptable use terms and legitimate research interest.  
  - Decision on whether to implement an opt-out toggle in player dashboard account settings (e.g., "Exclude my profile from public leaderboards").  
  - Display name guidelines prohibiting players from using real full names or email addresses as public handles.  
- **Policy Sections That May Need Updating Afterward:**  
  - `Privacy Policy`: Section 3 (*Why We Process Personal Data* — Public Leaderboards), Section 7 (*Player Privacy Rights Under RA 10173*).  
  - `Terms of Use`: Section 3 (*Acceptable Use & Fair Play*).

---

### 9. Research Ethics Approval for Gameplay Telemetry, Bridge Designs, and Feedback

- **Why Confirmation is Needed:**  
  As an academic thesis capstone, player gameplay interactions, bridge stress calculations, completion times, and feedback submissions may be analyzed, summarized, or quoted in thesis manuscripts, academic journal articles, or conference presentations. Under Philippine research ethics standards and Sections 12(f) and 13 of RA 10173, collecting and analyzing user data for scientific research requires ethical oversight and informed consent protocols.
- **Who Should Confirm It:**  
  University Institutional Review Board (IRB) / Research Ethics Committee, Thesis Advisory Committee.
- **What Information Must Be Supplied:**  
  - Formal Ethics Clearance Protocol Number or Certificate of Exemption from the university ethics review board.  
  - Approved Participant Information Sheet (PIS) and Informed Consent Form (ICF) protocols.  
  - Scope of permissible data publication (e.g., aggregate statistical data only vs. anonymized quotes from player feedback).  
  - Established protocol for participant withdrawal from the study without loss of game access.  
- **Policy Sections That May Need Updating Afterward:**  
  - `Privacy Policy`: Section 3 (*Why We Process Personal Data* — Academic Research & Educational Evaluation).  
  - `Terms of Use`: Section 1 (*Educational Purpose & Academic Scope*).  
  - `PolicyNav.tsx`: Removal of draft review notices upon formal ethics and defense sign-off.
