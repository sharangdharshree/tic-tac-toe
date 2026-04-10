const matchmakerMatched: nkruntime.MatchmakerMatchedFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  matches: nkruntime.MatchmakerResult[],
): string | void {
  // Log who got matched
  matches.forEach((match) => {
    logger.info("Player matched: %s", match.presence.userId);
  });

  // Extract mode from the first player's properties
  // Both players submitted the same mode so either works
  const mode = matches[0]?.properties?.["mode"] || "classic";

  // Create the match room — returns a match ID
  let matchId: string;
  try {
    matchId = nk.matchCreate(MODULE_NAME, { mode });
  } catch (error) {
    logger.error("Failed to create match: %v", error);
    return;
  }

  logger.info("Match created: %s mode: %s", matchId, mode);

  // Returning the match ID tells Nakama to notify both matched
  // players automatically via their socket connection.
  // They receive a matchmakerMatched notification with this ID.
  return matchId;
};
