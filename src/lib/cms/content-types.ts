import type { GalleryItem, NewsArticle } from "./types";

export const imageTypes = ["image/png", "image/jpeg", "image/webp"] as const;
export const maxImageBytes = 4 * 1024 * 1024;
export const galleryCategories = ["Gameplay", "Bridges", "Maps", "Characters", "UI"] as const;
export const updateCategories = [
  "Announcements",
  "Game Updates",
  "Patch Notes",
  "Development",
] as const;
export type PublishedContent = { gallery: GalleryItem[]; updates: NewsArticle[] };

export function isRealText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !!value.trim() &&
    !/\[[^\]]+\]|placeholder|not set|^tbd$|^coming soon$/i.test(value)
  );
}
