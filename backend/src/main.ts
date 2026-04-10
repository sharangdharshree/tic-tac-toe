/// <reference path="./types.ts" />
/// <reference path="./auth.ts" />
/// <reference path="./match.ts" />
/// <reference path="./matchmaker.ts" />

const InitModule: nkruntime.InitModule = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer,
): void {
  initializer.registerAfterAuthenticateDevice(afterAuthenticateDevice);

  initializer.registerMatch(MODULE_NAME, {
    matchInit,
    matchJoinAttempt,
    matchJoin,
    matchLeave,
    matchLoop,
    matchTerminate,
    matchSignal,
  });

  // Create leaderboard if it doesn't exist
  // operator: "increment" means scores accumulate — wins add up over time
  // sort: "desc" means highest wins at the top
  // reset: "" means no automatic reset (permanent leaderboard)

  try {
    nk.leaderboardCreate(
      "global_wins", // leaderboard ID — must match what handleMatchEnd uses
      false, // authoritative — only server can write
      nkruntime.SortOrder.DESCENDING,
      nkruntime.Operator.INCREMENTAL,
      "", // reset schedule — empty = never resets
      {}, // metadata
    );
    logger.info("Leaderboard created or already exists");
  } catch (error) {
    logger.error("Failed to create leaderboard: %v", error);
  }

  initializer.registerMatchmakerMatched(matchmakerMatched);

  logger.info("Tic-tac-toe server initialized");
};
