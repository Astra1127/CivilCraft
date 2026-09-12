/** Browser-safe DTOs. Missing game values are null, never demo defaults. */
export interface AdminPlayer {
  playFabId: string;
  displayName: string | null;
  username: string | null;
  createdAt: string | null;
  lastActive: string | null;
  accountStatus: "active" | "banned" | null;
  level: number | null;
  xp: number | null;
  xpToNextLevel: number | null;
  totalScore: number | null;
  bridgesCompleted: number | null;
  challengesCompleted: number | null;
  achievementsUnlocked: number | null;
  achievementsTotal: number | null;
  currentRegion: string | null;
}
export interface AdminPlayerDetail extends AdminPlayer {
  rank: number | null;
  statistics: { name: string; value: number }[] | null;
  currencies: { code: string; balance: number }[] | null;
  inventory: { itemId: string; name: string | null; purchasedAt: string | null }[] | null;
  achievements:
    { id: string; name: string | null; progress: number | null; unlocked: boolean | null }[] | null;
  bans:
    | {
        reason: string | null;
        createdAt: string | null;
        expiresAt: string | null;
        active: boolean;
      }[]
    | null;
  unavailable: string[];
}
export interface AdminPlayerPage {
  totalPlayers?: number;
  snapshotCursor?: string;
  players: AdminPlayer[];
  nextCursor: string | null;
  pending: boolean;
  snapshotAt: string | null;
}
export interface AdminIntegrationStatus {
  titleId: string;
  mode: "Live";
  connection: "Connected" | "Partially configured" | "Unavailable";
  adminApi: "Available" | "Not configured" | "Unavailable";
  checkedAt: string;
  message: string;
}
export type PlayerSearchKind = "PlayFabId" | "TitleDisplayName" | "Username";
