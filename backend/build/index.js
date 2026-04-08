"use strict";
var STATS_COLLECTION = "player_stats";
var STATS_KEY = "stats";
var defaultStats = {
    wins: 0,
    losses: 0,
    draws: 0,
    winStreak: 0,
    bestStreak: 0,
    totalMatches: 0,
    totalPlaytimeMs: 0,
};
function afterAuthenticateDevice(ctx, logger, nk, data) {
    var userId = ctx.userId;
    if (!userId) {
        logger.error("afterAuthenticateDevice called with no userId in context");
        return;
    }
    var existingStats;
    try {
        existingStats = nk.storageRead([
            {
                collection: STATS_COLLECTION,
                key: STATS_KEY,
                userId: userId,
            },
        ]);
    }
    catch (error) {
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
                value: defaultStats,
                permissionRead: 2,
                permissionWrite: 0,
            },
        ]);
        logger.info("New player initialized: %s", userId);
    }
    catch (error) {
        logger.error("Failed to initialize player stats: %v", error);
    }
}
/// <reference path="./auth.ts" />
var InitModule = function (ctx, logger, nk, initializer) {
    initializer.registerAfterAuthenticateDevice(afterAuthenticateDevice);
    logger.info("Tic-tac-toe server initialized");
};
