import type { AdminPlayer } from "./admin-types.ts";
export const directorySorts = {
  recent: "Recently Active",
  newest: "Newest Accounts",
  oldest: "Oldest Accounts",
  nameAsc: "Name A–Z",
  nameDesc: "Name Z–A",
} as const;
export type DirectoryOptions = {
  sort: keyof typeof directorySorts;
  activity: "all" | "recent" | "inactive";
  status: "all" | "active" | "banned";
};
export const defaultDirectoryOptions: DirectoryOptions = {
  sort: "recent",
  activity: "all",
  status: "all",
};

/** Last-login activity is independent of the backend ban state. */
export function playerActivity(lastLogin: string | null, now = Date.now()) {
  if (!lastLogin) return { key: "inactive", label: "Inactive (never logged in)" };
  const login = Date.parse(lastLogin);
  if (!Number.isFinite(login) || login > now) return { key: "unknown", label: "Unknown" };
  const age = now - login;
  if (age <= 7 * 86400000) return { key: "recent", label: "Recently active" };
  if (age > 30 * 86400000) return { key: "inactive", label: "Inactive" };
  return { key: "other", label: "Last login 7–30 days ago" };
}
export function filterSortPlayers(
  players: AdminPlayer[],
  options: DirectoryOptions,
  now = Date.now(),
) {
  const date = (v: string | null) => (v && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null);
  return players
    .filter((p) => {
      if (options.status !== "all" && p.accountStatus !== options.status) return false;
      if (options.activity !== "all")
        return playerActivity(p.lastActive, now).key === options.activity;
      return true;
    })
    .sort((a, b) => {
      if (options.sort === "nameAsc" || options.sort === "nameDesc") {
        const x = a.displayName?.trim(),
          y = b.displayName?.trim();
        if (!x || !y) return x ? -1 : y ? 1 : 0;
        return (
          x.localeCompare(y, "en", { sensitivity: "base", numeric: true }) *
          (options.sort === "nameAsc" ? 1 : -1)
        );
      }
      const x = date(options.sort === "recent" ? a.lastActive : a.createdAt);
      const y = date(options.sort === "recent" ? b.lastActive : b.createdAt);
      if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1;
      return (x - y) * (options.sort === "oldest" ? 1 : -1);
    });
}
