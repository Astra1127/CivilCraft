/** Website CMS types. Gallery and updates use server-backed content storage. */

export type NewsCategory =
  "Game Updates" | "Development" | "Patch Notes" | "Announcements" | "Community";

export interface NewsArticle {
  id: string;
  slug: string;
  title: string;
  category: NewsCategory;
  coverAlt: string;
  coverUrl?: string;
  excerpt: string;
  content: string;
  publishedAt: string;
  status: "draft" | "published";
}

export type GalleryCategory = "Gameplay" | "Maps" | "Bridges" | "Characters" | "UI" | "Videos";

export interface GalleryItem {
  id: string;
  caption: string;
  category: GalleryCategory;
  url?: string | undefined;
  visible: boolean;
  createdAt: string;
}

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  category: "Download" | "Gameplay" | "Account" | "General";
  order: number;
  published: boolean;
}

export type MessageStatus = "New" | "In Progress" | "Resolved";

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  inquiryType: string;
  message: string;
  createdAt: string;
  status: MessageStatus;
  ownerId?: string | null;
  replies?: ContactReply[];
  notificationStatus?: string;
}

export interface ContactReply {
  id: string;
  messageId: string;
  author: "admin" | "player";
  message: string;
  createdAt: string;
  notificationStatus?: string;
}

export type BugStatus = "New" | "Investigating" | "Resolved" | "Closed";

export interface BugReport {
  playFabId: string;
  id: string;
  player: string;
  category: string;
  description: string;
  gameVersion: string;
  device: string;
  screenshotUrl?: string;
  createdAt: string;
  status: BugStatus;
}

export interface Release {
  id: string;
  version: string;
  build: string;
  title?: string;
  platform: string;
  fileName: string | null;
  fileSizeBytes: number | null;
  fileUrl: string | null;
  minAndroid: string;
  minRequirements: string[];
  recommendedRequirements: string[];
  notes: string;
  releaseDate: string;
  /** Update publication is independent of the currently downloadable build. */
  published?: boolean;
  status: "draft" | "current" | "archived";
  downloads: number;
}

export interface SiteSettings {
  siteName: string;
  supportEmail: string;
  phone: string;
  address: string;
  officeHours: string;
  social: { facebook: string; youtube: string; discord: string };
  maintenanceMode: boolean;
  metaTitle: string;
  metaDescription: string;
  installSteps: string[];
}

export interface ActivityEntry {
  id: string;
  /** What happened, e.g. "Article published". */
  action: string;
  /** The item it happened to. */
  target: string;
  area: "News" | "Gallery" | "FAQ" | "Messages" | "Releases" | "Settings" | "System";
  at: string;
}

/** Editable Story & Lore block shown on the public About page. */
export interface StoryContent {
  heading: string;
  shortDescription: string;
  fullStory: string;
  imageUrl?: string | null;
  published: boolean;
}

/** A student development team member (thesis/capstone credit). */
export interface TeamMember {
  id: string;
  fullName: string;
  /** A member may hold multiple roles. */
  roles: string[];
  responsibilities: string;
  contribution?: string;
  photoUrl?: string | null;
  order: number;
  published: boolean;
}

/** Academic thesis/capstone metadata. Placeholders until supplied. */
export interface AcademicProject {
  institution: string;
  department: string;
  program: string;
  academicYear: string;
  adviser: string;
}

export interface AboutContent {
  story: StoryContent;
  team: TeamMember[];
  academic: AcademicProject;
}

export interface CmsState {
  news: NewsArticle[];
  gallery: GalleryItem[];
  faq: FaqEntry[];
  messages: ContactMessage[];

  releases: Release[];
  /** About page story, development team and academic project content. */
  about: AboutContent;
  settings: SiteSettings;
  /** Real record of administrative actions performed in this browser. */
  activity: ActivityEntry[];
}
