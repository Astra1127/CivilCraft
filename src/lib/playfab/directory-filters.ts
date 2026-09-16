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
export function filterSortPlayers(
  players: AdminPlayer[],
  options: DirectoryOptions,
  now = Date.now(),
) {
  const date = (v: string | null) => (v && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null);
  const day = 86400000;
  return players
    .filter((p) => {
      if (options.status !== "all" && p.accountStatus !== options.status) return false;
      const login = date(p.lastActive);
      if (options.activity === "recent")
        return login !== null && login <= now && now - login <= 7 * day;
      if (options.activity === "inactive") return login === null || now - login > 30 * day;
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
