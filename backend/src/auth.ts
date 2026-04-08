const STATS_COLLECTION = "player_stats";
const STATS_KEY = "stats";

interface PlayerStats {
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
  bestStreak: number;
  totalMatches: number;
  totalPlaytimeMs: number;
}

const defaultStats: PlayerStats = {
  wins: 0,
  losses: 0,
  draws: 0,
  winStreak: 0,
  bestStreak: 0,
  totalMatches: 0,
  totalPlaytimeMs: 0,
};

function afterAuthenticateDevice(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  data: nkruntime.Session,
): void {
  const userId = ctx.userId;

  if (!userId) {
    logger.error("afterAuthenticateDevice called with no userId in context");
    return;
  }

  let existingStats: nkruntime.StorageObject[];
  try {
    existingStats = nk.storageRead([
      {
        collection: STATS_COLLECTION,
        key: STATS_KEY,
        userId: userId,
      },
    ]);
  } catch (error) {
    logger.error("Failed to read player stats: %v", error);
    return;
  }

  if (existingStats.length > 0) {
    logger.debug("Existing player authenticated: %s", userId);
    return;
  }

  try {
    nk.storageWrite([
      {
        collection: STATS_COLLECTION,
        key: STATS_KEY,
        userId: userId,
        value: defaultStats as any,
        permissionRead: 2,
        permissionWrite: 0,
      },
    ]);
    logger.info("New player initialized: %s", userId);
  } catch (error) {
    logger.error("Failed to initialize player stats: %v", error);
  }
}
