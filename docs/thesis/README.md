# CivilCraft: Thesis Documentation Package
**Structural Simulation, Cloud Synchronization, and Web Administration System**

This directory contains the formal system documentation, architectural flowcharts, and functional specifications for the CivilCraft thesis project.

---

## Documentation Index

1. [**SYSTEM_FLOWCHART.md**](SYSTEM_FLOWCHART.md)
   * High-level system architecture flowchart connecting Player, Website, Android Client, PlayFab, and Admin portal.
   * Detailed module flowcharts:
     * Registration & Authentication
     * Player Dashboard Data Retrieval
     * Game → PlayFab → Website Cloud Synchronization
     * 2D Drafting & Stress Simulation Gameplay
     * Bridge Almanac Discovery & Progression
     * Admin Player Moderation (Ban / Unban)
     * PayMongo Payment & Coin Fulfillment
     * Administrative Back-Office Management

2. [**USE_CASES.md**](USE_CASES.md)
   * System Actor Inventory (Visitor, Registered Player, CivilCraft Game Player, Administrator, PlayFab Backend, PayMongo Gateway).
   * Complete Use Case Inventory (`UC-01` to `UC-38`).
   * Standard PlantUML Use Case Diagram syntax.
   * Formal Thesis Use Case Specifications (`UC-05`, `UC-08`, `UC-09`, `UC-11`, `UC-14`, `UC-20`, `UC-21`, `UC-25`, `UC-31`, `UC-32`).

3. [**FEATURE_FUNCTIONALITY.md**](FEATURE_FUNCTIONALITY.md)
   * System Feature Implementation Matrix with verified implementation tags (`IMPLEMENTED`, `PARTIALLY IMPLEMENTED`, `PLACEHOLDER / COMING SOON`).
   * Complete Feature Functionality Table (Feature, Actor, Purpose, Input, Process, Output, Data/Service Used).
   * Detailed technical deep-dives for each major subsystem.

4. [**DATA_FLOW.md**](DATA_FLOW.md)
   * End-to-end data flow architecture between Unity Android, PlayFab Cloud, and Web Frontend.
   * Data Store Segregation (Entity Files vs Private UserData vs Statistics vs CMS Assets).
   * Exact 15 Synchronized Fields under CloudScript Revision 5 (`syncDashboardV1`).
   * Character Wardrobe & Equipment Resolution Model (multi-accessory support).
   * Security, Token Isolation, and Credential Boundaries.

---

## Academic Presentation Summary

* **Project Scope**: Mobile 3D physics-based simulation game paired with a modern cloud-synchronized web portal and administrative management dashboard.
* **Technology Stack**:
  * **Simulation Client**: Unity Engine (Android), C#, Custom Matrix Deterministic Stress Solver.
  * **Cloud Services**: Microsoft Azure PlayFab (Title ID `17FA03`), CloudScript Revision 5.
  * **Web Application**: React 19, TanStack Start, TypeScript, Tailwind CSS, Nitro Server.
  * **Payment Processing**: PayMongo API (GCash, Maya, QR Ph, Credit/Debit Cards).
  * **Media Storage**: Vercel Blob Storage.
