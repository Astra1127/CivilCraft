import type { PolicyRecord } from "./policy-types.ts";

export function getDefaultPolicies(): { privacy: PolicyRecord; terms: PolicyRecord } {
  return {
    privacy: {
      id: "privacy",
      title: "Privacy Policy",
      version: "2026-11-10",
      lastUpdated: "November 10, 2026",
      publishedAt: "2026-11-10T12:00:00.000Z",
      publishedBy: "Civil Craft Administration",
      changeSummary:
        "Audited and verified policy alignment with codebase and Philippine RA 10173 legal framework.",
      sections: [
        {
          id: "privacy-scope",
          title: "1. About CivilCraft & Legal Framework (RA 10173)",
          content:
            "Civil Craft: Bridge Edition is an academic capstone project developed by an undergraduate student team under faculty supervision in the Republic of the Philippines. This Privacy Policy explains how personal data is collected, used, stored, and protected in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173) and its Implementing Rules and Regulations.",
        },
        {
          id: "information-collected",
          title: "2. Personal Information We Collect",
          content:
            "We collect player registration data (username, email address, password hash handled by Microsoft Azure PlayFab), gameplay progress (levels completed, bridge challenge solutions, overall scores), optional feedback submissions, and technical server logs. Civil Craft servers do not store or access plaintext passwords.",
        },
        {
          id: "purposes-processing",
          title: "3. Purposes & Legal Bases for Processing",
          content:
            "Personal data is processed strictly for educational evaluation, gameplay authentication, cloud synchronization of bridge saves, competitive public leaderboards, and administrative communication. Only approved testimonials with explicit player consent are displayed on the public website.",
        },
        {
          id: "third-party-services",
          title: "4. Third-Party Service Providers & Cloud Storage",
          content:
            "We utilize trusted third-party providers including Microsoft Azure PlayFab (cloud BaaS), Vercel (web hosting and serverless APIs), PayMongo (operating in sandbox/test mode), PostgreSQL (currency ledger), and transactional email providers. Data is processed using industry-standard TLS encryption.",
        },
        {
          id: "data-retention",
          title: "5. Data Retention & Archival Timeline",
          content:
            "Player account and gameplay data are retained throughout the active academic capstone study. Post-defense archiving, data disposal, and long-term retention schedules remain subject to university policy and institutional review.",
        },
        {
          id: "data-security",
          title: "6. Security Measures & Technical Safeguards",
          content:
            "All web and API traffic is encrypted via HTTPS/TLS. Passwords are salted and hashed by PlayFab. Administrative access is protected by encrypted HttpOnly cookies and role-based staff authorization.",
        },
        {
          id: "data-subject-rights",
          title: "7. Your Rights Under Philippine Data Privacy Law",
          content:
            "Under RA 10173, players have the right to be informed, access their personal data, object to processing, rectify inaccuracies, and request erasure/blocking when conditions under applicable law are satisfied.",
        },
        {
          id: "deletion-process",
          title: "8. Account Deletion & Right to Erasure",
          content:
            "Self-service account deletion is currently offline in the player dashboard while backend multi-system synchronization across PlayFab, PostgreSQL financial ledgers, and Android client saves is finalized. To request permanent account erasure, contact the team through the Contact page.",
        },
        {
          id: "cookies-reference",
          title: "9. Cookies & Local Browser Storage",
          content:
            "Civil Craft uses essential and functional browser storage (such as administrative session cookies and player session tickets in localStorage). Detailed browser storage information is available in our dedicated Cookie & Browser Storage Policy.",
        },
        {
          id: "contact-dpo",
          title: "10. Contact Us & Data Protection Inquiries",
          content:
            "If you have questions regarding this Privacy Policy or wish to exercise your data privacy rights, please submit an inquiry through the Contact page or email our support address.",
        },
      ],
      draft: null,
      revisions: [
        {
          version: "2026-11-10",
          publishedAt: "2026-11-10T12:00:00.000Z",
          publishedBy: "Civil Craft Administration",
          changeSummary:
            "Initial audited release aligned with Philippine Data Privacy Act of 2012.",
        },
      ],
    },
    terms: {
      id: "terms",
      title: "Terms of Service",
      version: "2026-11-10",
      lastUpdated: "November 10, 2026",
      publishedAt: "2026-11-10T12:00:00.000Z",
      publishedBy: "Civil Craft Administration",
      changeSummary:
        "Audited and verified terms of service for educational bridge simulation and website.",
      sections: [
        {
          id: "educational-scope",
          title: "1. Educational Purpose & Academic Scope",
          content:
            "Civil Craft: Bridge Edition is an educational bridge engineering simulation and academic research project developed by an undergraduate student team under faculty supervision in the Republic of the Philippines. Access to the game is free. The in-game 3D physics simulations are simplified for learning and do not substitute for certified engineering analysis or professional civil engineering design.",
        },
        {
          id: "player-accounts",
          title: "2. Player Registration & Account Security",
          content:
            "Players must register an account to save progression and submit leaderboard scores. Players are responsible for maintaining credential confidentiality. Civil Craft servers do not store or access plaintext passwords.",
        },
        {
          id: "acceptable-use",
          title: "3. Acceptable Use & Fair Play",
          content:
            "Players agree not to use automated bots, memory injection tools, or exploits to falsify bridge physics or leaderboard rankings. Transmitting offensive or harassing content is strictly prohibited. Manipulated scores are subject to administrative removal.",
        },
        {
          id: "apk-distribution",
          title: "4. Official APK Downloads & Device Safety",
          content:
            "The official Civil Craft Android application package (APK) is distributed exclusively through this website at /download. The game requires standard Android network access permissions (INTERNET and ACCESS_NETWORK_STATE) for cloud save synchronization.",
        },
        {
          id: "virtual-currency",
          title: "5. Virtual Coins, Payments & Purchases",
          content:
            "In-game virtual currency (coins) can be earned through bridge construction contracts. Payment integrations operate in sandbox/test mode (sk_test_...) for academic evaluation. Virtual coins have no real-world monetary value and cannot be redeemed or refunded for cash.",
        },
        {
          id: "intellectual-property",
          title: "6. Intellectual Property & Ownership",
          content:
            "Original content created for Civil Craft belongs to the student development team and academic institution. Players retain creative ownership of their unique bridge configurations, granting the project a non-exclusive, royalty-free license to display bridge layouts and scores on the website and leaderboards.",
        },
        {
          id: "moderation-suspension",
          title: "7. Account Suspension & Fair Play Moderation",
          content:
            "Project administrators reserve the right to review and suspend accounts verified to have engaged in cheating or harassment. Where reasonably possible, players will be notified of reasons and may submit an appeal through the Contact page.",
        },
        {
          id: "deletion-requests",
          title: "8. Account Deletion & Data Removal Requests",
          content:
            "Players have the right to request permanent account erasure. Automated self-service deletion is currently offline in the dashboard; manual requests are submitted and verified via the Contact page.",
        },
        {
          id: "limitation-liability",
          title: "9. Disclaimers & Limitation of Liability",
          content:
            "Civil Craft: Bridge Edition and its associated online services are provided on an 'AS IS' and 'AS AVAILABLE' basis without warranties of any kind. To the fullest extent permitted by Philippine law, the student team, advisers, and institution shall not be liable for incidental or consequential damages.",
        },
        {
          id: "governing-law",
          title: "10. Governing Law & Contact Information",
          content:
            "These Terms of Service are governed by the laws of the Republic of the Philippines, including the Electronic Commerce Act of 2000 (RA 8792) and the Data Privacy Act of 2012 (RA 10173). Contact us via the website Contact form for legal notices.",
        },
      ],
      draft: null,
      revisions: [
        {
          version: "2026-11-10",
          publishedAt: "2026-11-10T12:00:00.000Z",
          publishedBy: "Civil Craft Administration",
          changeSummary: "Initial audited terms of service.",
        },
      ],
    },
  };
}
