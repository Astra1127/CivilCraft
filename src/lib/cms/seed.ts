import type { CmsState } from "./types";

/**
 * Initial website CMS content. Everything here is an editable placeholder —
 * it is fully manageable from the Admin Dashboard and contains no invented
 * official Civil Craft information.
 */
export const seedState: CmsState = {
  news: [],
  gallery: [],

  faq: [
    {
      id: "f1",
      question: "Is Civil Craft free?",
      answer: "Civil Craft: Bridge Edition is a student educational project and is free to play.",
      category: "Download",
      order: 1,
      published: true,
    },
    {
      id: "f2",
      question: "Does Civil Craft require an internet connection?",
      answer:
        "Player accounts, scores and leaderboards are handled by PlayFab, which requires a connection for syncing.",
      category: "Gameplay",
      order: 2,
      published: true,
    },
    {
      id: "f3",
      question: "What Android version is required?",
      answer:
        "See the minimum requirements on the Download page for the currently published build.",
      category: "Download",
      order: 3,
      published: true,
    },
    {
      id: "f4",
      question: "Where is my player progress stored?",
      answer:
        "Progress is stored in the game backend (PlayFab) and tied to your player account, not to your device.",
      category: "Account",
      order: 4,
      published: true,
    },
    {
      id: "f5",
      question: "How do I report a bug?",
      answer: "Use the Contact page and choose the Game Support inquiry type.",
      category: "General",
      order: 5,
      published: true,
    },
  ],
  messages: [
    {
      id: "m1",
      name: "Sample Sender",
      email: "sample@example.com",
      subject: "Sample inquiry",
      inquiryType: "General Inquiry",
      message: "Sample inquiry retained so the support inbox is not empty during review.",
      createdAt: "2026-08-19T10:00:00.000Z",
      status: "New",
    },
  ],
  activity: [],
  releases: [
    {
      id: "r1",
      version: "0.1.0",
      build: "100",
      title: "Prototype Build",
      platform: "Android",
      fileName: null,
      fileSizeBytes: null,
      fileUrl: null,
      minAndroid: "9.0",
      minRequirements: ["Android 9.0+", "4 GB RAM", "Quad-core processor", "1.5 GB free storage"],
      recommendedRequirements: [
        "Android 11+",
        "6 GB RAM",
        "Octa-core processor",
        "2 GB free storage",
      ],
      notes: "First playable prototype build.",
      releaseDate: "2026-08-10",
      status: "current",
      downloads: 0,
    },
  ],
  about: {
    story: {
      heading: "One canyon at a time.",
      shortDescription: "A region divided by deep canyons, and an engineer sent to reconnect it.",
      fullStory:
        "Civil Craft takes place across a region divided by deep canyons and difficult terrain. Communities that once depended on one another have become separated, leaving important routes incomplete.\n\nThe player arrives as an engineer tasked with restoring these connections.\n\nEach new region presents a different engineering problem. Wider gaps, heavier loads, limited materials and tighter budgets require the player to rethink how each bridge should be designed.\n\nEvery successful crossing brings another part of the region back together.",
      imageUrl: null,
      published: true,
    },
    team: [
      {
        id: "t1",
        fullName: "[Team Member Name]",
        roles: ["[Project Role]"],
        responsibilities: "[Short responsibility description]",
        contribution: "",
        photoUrl: null,
        order: 1,
        published: true,
      },
      {
        id: "t2",
        fullName: "[Team Member Name]",
        roles: ["[Project Role]"],
        responsibilities: "[Short responsibility description]",
        contribution: "",
        photoUrl: null,
        order: 2,
        published: true,
      },
      {
        id: "t3",
        fullName: "[Team Member Name]",
        roles: ["[Project Role]"],
        responsibilities: "[Short responsibility description]",
        contribution: "",
        photoUrl: null,
        order: 3,
        published: true,
      },
      {
        id: "t4",
        fullName: "[Team Member Name]",
        roles: ["[Project Role]"],
        responsibilities: "[Short responsibility description]",
        contribution: "",
        photoUrl: null,
        order: 4,
        published: true,
      },
    ],
    academic: {
      institution: "[School / Institution]",
      department: "[Department]",
      program: "[Academic Program]",
      academicYear: "[Academic Year]",
      adviser: "[Adviser Name]",
    },
  },
  settings: {
    siteName: "Civil Craft: Bridge Edition",
    supportEmail: "",
    phone: "",
    address: "",
    officeHours: "",
    social: { facebook: "", youtube: "", discord: "" },
    maintenanceMode: false,
    metaTitle: "Civil Craft: Bridge Edition",
    metaDescription:
      "An educational 3D bridge-building game where players design, build and load-test bridges while learning structural engineering.",
    installSteps: [
      "Download the Civil Craft APK.",
      "Install the application on your Android device.",
      "Sign in to your player account.",
      "Start building your first bridge.",
    ],
  },
};
