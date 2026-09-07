/**
 * Administrator server endpoints.
 *
 *   Browser → these server functions → PlayFab Server/Admin API → title 17FA03
 *
 * The Developer Secret Key is only ever read inside the handlers (server
 * side); it is never returned to the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PlayerProfile } from "./types";

const credentials = z.object({
  identifier: z.string().trim().min(3).max(255),
  password: z.string().min(4).max(128),
});

export interface AdminLoginSuccess {
  ok: true;
  playFabId: string;
  displayName: string;
  email?: string;
  token: string;
}

/**
 * A rejected sign-in is a normal outcome, not a crash: it is RETURNED rather
 * than thrown so the browser shows a message instead of an error screen.
 */
export type AdminLoginResult = AdminLoginSuccess | { ok: false; message: string };

/** Authenticates the administrator and verifies the admin role server-side. */
export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credentials.parse(input))
  .handler(async ({ data }): Promise<AdminLoginResult> => {
    const { serverCallPlayFab, isAdminAccount, issueAdminToken } = await import("./admin.server");

    const isEmail = data.identifier.includes("@");
    let login: {
      PlayFabId: string;
      InfoResultPayload?: {
        AccountInfo?: {
          Username?: string;
          TitleInfo?: { DisplayName?: string };
          PrivateInfo?: { Email?: string };
        };
      };
    };
    try {
      login = await serverCallPlayFab(
        isEmail ? "/Client/LoginWithEmailAddress" : "/Client/LoginWithPlayFab",
        {
          ...(isEmail ? { Email: data.identifier } : { Username: data.identifier }),
          Password: data.password,
          InfoRequestParameters: { GetUserAccountInfo: true },
        },
      );
    } catch {
      return { ok: false, message: "Invalid username or password." };
    }

    if (!(await isAdminAccount(login.PlayFabId))) {
      return { ok: false, message: "This account is not an administrator account." };
    }

    const info = login.InfoResultPayload?.AccountInfo;
    const email = info?.PrivateInfo?.Email;
    return {
      ok: true,
      playFabId: login.PlayFabId,
      displayName: info?.TitleInfo?.DisplayName ?? info?.Username ?? "Administrator",
      ...(email ? { email } : {}),
      token: issueAdminToken(login.PlayFabId),
    };
  });

/** Read-only player directory, powered by the PlayFab Admin/Server API. */
export const adminSearchPlayers = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(10), query: z.string().max(120).default("") }).parse(input),
  )
  .handler(async ({ data }): Promise<PlayerProfile[]> => {
    const { serverCallPlayFab, verifyAdminToken } = await import("./admin.server");
    verifyAdminToken(data.token);

    const query = data.query.trim();
    const profiles: PlayerProfile[] = [];

    // A direct lookup by PlayFab id / email / username, as supported by PlayFab.
    if (query) {
      const lookup = query.includes("@")
        ? { Email: query }
        : /^[A-F0-9]{6,20}$/i.test(query)
          ? { PlayFabId: query }
          : { TitleDisplayName: query };
      try {
        const result = await serverCallPlayFab<{
          UserInfo?: {
            PlayFabId: string;
            Username?: string;
            TitleInfo?: { DisplayName?: string; Created?: string; LastLogin?: string };
            PrivateInfo?: { Email?: string };
          };
        }>("/Admin/GetUserAccountInfo", lookup, { secret: true });
        const info = result.UserInfo;
        if (info) {
          profiles.push({
            playFabId: info.PlayFabId,
            displayName: info.TitleInfo?.DisplayName ?? info.Username ?? info.PlayFabId,
            ...(info.PrivateInfo?.Email ? { email: info.PrivateInfo.Email } : {}),
            ...(info.TitleInfo?.Created ? { createdAt: info.TitleInfo.Created } : {}),
            ...(info.TitleInfo?.LastLogin ? { lastActive: info.TitleInfo.LastLogin } : {}),
            level: 0,
            xp: 0,
            xpToNextLevel: 0,
            totalScore: 0,
            rank: null,
            bridgesCompleted: 0,
            challengesCompleted: 0,
            achievementsUnlocked: 0,
            achievementsTotal: 0,
            accountStatus: "active",
          });
        }
      } catch {
        /* no match — return an empty directory rather than fabricated rows */
      }
      return profiles;
    }

    // Without a query PlayFab offers no "list all players" client-safe call:
    // the ranked players on the primary statistic are shown instead.
    try {
      const board = await serverCallPlayFab<{
        Leaderboard?: { PlayFabId: string; DisplayName?: string; StatValue: number; Position: number }[];
      }>(
        "/Server/GetLeaderboard",
        { StatisticName: "TotalScore", StartPosition: 0, MaxResultsCount: 50 },
        { secret: true },
      );
      for (const row of board.Leaderboard ?? []) {
        profiles.push({
          playFabId: row.PlayFabId,
          displayName: row.DisplayName ?? row.PlayFabId,
          level: 0,
          xp: 0,
          xpToNextLevel: 0,
          totalScore: row.StatValue,
          rank: row.Position + 1,
          bridgesCompleted: 0,
          challengesCompleted: 0,
          achievementsUnlocked: 0,
          achievementsTotal: 0,
          accountStatus: "active",
        });
      }
    } catch {
      /* statistic not yet reported by the game */
    }
    return profiles;
  });

/** Moderation — PlayFab Admin API, administrator token required. */
export const adminSetBanned = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().min(10),
        playFabId: z.string().min(3).max(64),
        banned: z.boolean(),
        reason: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { serverCallPlayFab, verifyAdminToken } = await import("./admin.server");
    verifyAdminToken(data.token);
    if (data.banned) {
      await serverCallPlayFab(
        "/Admin/BanUsers",
        { Bans: [{ PlayFabId: data.playFabId, Reason: data.reason ?? "Policy violation" }] },
        { secret: true },
      );
    } else {
      const bans = await serverCallPlayFab<{ BanData?: { BanId: string; Active: boolean }[] }>(
        "/Admin/GetUserBans",
        { PlayFabId: data.playFabId },
        { secret: true },
      );
      const active = (bans.BanData ?? []).filter((b) => b.Active).map((b) => b.BanId);
      if (active.length) {
        await serverCallPlayFab("/Admin/RevokeAllBansForUser", { PlayFabId: data.playFabId }, { secret: true });
      }
    }
    return { playFabId: data.playFabId, banned: data.banned };
  });

/** Harmless reachability probe for Admin → Integration. */
export const testPlayFabConnection = createServerFn({ method: "POST" }).handler(async () => {
  const { serverCallPlayFab, serverTitleId } = await import("./admin.server");
  const checkedAt = new Date().toISOString();
  try {
    await serverCallPlayFab("/Client/GetTitlePublicKey", { TitleSharedSecret: "healthcheck" });
    return { titleId: serverTitleId(), reachable: true, checkedAt, secretConfigured: !!process.env["PLAYFAB_SECRET_KEY"] };
  } catch (error) {
    // A rejected request still proves the title endpoint answered.
    const message = error instanceof Error ? error.message : "";
    const reachable = message.length > 0 && !message.includes("fetch failed");
    return { titleId: serverTitleId(), reachable, checkedAt, secretConfigured: !!process.env["PLAYFAB_SECRET_KEY"] };
  }
});
