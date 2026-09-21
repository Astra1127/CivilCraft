import type { CmsState } from "./types";

/**
 * Initial editable website copy. Saved administrator content takes precedence.
 * Never seed sample messages, builds, requirements or publication dates.
 */
export const seedState: CmsState = {
  news: [],
  gallery: [],

  faq: [
    {
      id: "f1",
      question: "What is Civil Craft: Bridge Edition?",
      answer:
        "A 3D educational bridge-construction simulation for Android. Build and test bridges to explore basic structural mechanics, then improve your designs. It is not professional engineering design or analysis software.",
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
        "Progress synced by the game to PlayFab is tied to your Civil Craft account. Sign in with that same account to see the records the game has saved.",
      category: "Account",
      order: 4,
      published: true,
    },
    {
      id: "f5",
      question: "How do I report a bug?",
      answer:
        "Use the Contact page and choose Bug Report. Describe what happened and the steps that caused the issue. Signed-in players can also use Report a Bug from their dashboard.",
      category: "General",
      order: 5,
      published: true,
    },
    {
      id: "f6",
      question: "How do I install Civil Craft?",
      answer:
        "Open the Download page and follow the installation guide for the current Android build. Check the published requirements before installing the APK.",
      category: "Download",
      order: 6,
      published: true,
    },
    {
      id: "f7",
      question: "How do I reset my password?",
      answer:
        "Choose Forgot password on the Login page, enter your account email and request a recovery email. Open its reset link, set a new password and return to Login.",
      category: "Account",
      order: 7,
      published: true,
    },
    {
      id: "f8",
      question: "Are my game and website accounts the same?",
      answer:
        "Yes. Civil Craft and this website use the same PlayFab player account. Sign in with the account you use in the game to view your available progress.",
      category: "Account",
      order: 8,
      published: true,
    },
  ],
  messages: [],
  activity: [],
  releases: [],
  about: {
    story: {
      heading: "One canyon at a time.",
      shortDescription: "An aspiring civil engineer builds new connections across Arcadia.",
      fullStory:
        "Arcadia is divided into three regions where canyons, waterways, and difficult terrain make direct transportation challenging. The player arrives as an aspiring civil engineer with theoretical knowledge but limited practical experience.\n\nGuided at first by Professor Bhan, the player begins completing bridge projects and gradually works more independently with contractors throughout Arcadia.",
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
      "Build. Test. Learn. A 3D educational bridge-construction game where aspiring engineers take on contracts across Arcadia and apply basic structural mechanics.",
    installSteps: [
      "Download the Civil Craft APK.",
      "Install the application on your Android device.",
      "Sign in to your player account.",
      "Start building your first bridge.",
    ],
  },
};
