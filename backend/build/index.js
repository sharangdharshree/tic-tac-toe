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
// Opcodes — client to server (1-49), server to client (50-99)
var OPCODE = {
    // C->S
    JOIN_MATCHMAKER: 1,
    CANCEL_MATCHMAKER: 2,
    JOIN_MATCH: 3,
    PLACE_MARK: 4,
    RECONNECT_MATCH: 5,
    LEAVE_MATCH: 6,
    PLAY_AGAIN: 7,
    // S->C
    MATCHMAKER_MATCHED: 50,
    MATCH_JOINED: 51,
    OPPONENT_JOINED: 52,
    PRESENCE_TIMEOUT: 53,
    COUNTDOWN_START: 54,
    COUNTDOWN_ABORT: 55,
    MATCH_START: 56,
    STATE_UPDATE: 57,
    MOVE_REJECTED: 58,
    TURN_TIMER_START: 59,
    TURN_TIMER_WARNING: 60,
    TURN_TIMER_EXPIRED: 61,
    OPPONENT_DISCONNECTED: 62,
    OPPONENT_RECONNECTED: 63,
    RECONNECT_STATE: 64,
    OPPONENT_FORFEIT: 65,
    GAME_OVER: 66,
    LEADERBOARD_UPDATED: 67,
    MATCH_END: 68,
};
var TURN_DURATION_MS = 30000;
var CLASSIC_TURN_DURATION_MS = Infinity;
var COUNTDOWN_DURATION_MS = 3000;
var RECONNECT_WINDOW_MS = 15000;
var PRESENCE_TIMEOUT_MS = 10000;
var GRACE_BUFFER_MS = 300;
var RESULT_SCREEN_MS = 5000;
// Win combinations — all 8 possible lines on a 3x3 board
var WIN_COMBINATIONS = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8], // rows
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8], // columns
    [0, 4, 8],
    [2, 4, 6], // diagonals
];
/// <reference path="./types.ts" />
var MODULE_NAME = "tic_tac_toe";
// ─── Helpers ────────────────────────────────────────────────────────────────
// Encodes a JS object to a string for dispatcher.broadcastMessage
function encode(data) {
    return JSON.stringify(data);
}
function decode(data) {
    // Nakama JS SDK sends data as base64-encoded string
    // Convert ArrayBuffer to string first, then parse JSON
    var bytes = new Uint8Array(data);
    var str = "";
    for (var i = 0; i < bytes.length; i++) {
        str += String.fromCharCode(bytes[i]);
    }
    return JSON.parse(str);
}
// Checks all 8 win combinations against the current board
// Returns the winning line [i,j,k] or null if no winner yet
function checkWinner(board) {
    for (var _i = 0, WIN_COMBINATIONS_1 = WIN_COMBINATIONS; _i < WIN_COMBINATIONS_1.length; _i++) {
        var combo = WIN_COMBINATIONS_1[_i];
        var a = combo[0], b = combo[1], c = combo[2];
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return combo;
        }
    }
    return null;
}
// Returns the opponent PlayerState given one player's ID
function getOpponent(state, playerId) {
    return state.players.find(function (p) { return p.id !== playerId; }) || null;
}
// Sends a message to one specific player using their presence handle
// This is how directed messages (move_rejected, reconnect_state) work
function sendToPlayer(dispatcher, opCode, data, presence) {
    dispatcher.broadcastMessage(opCode, encode(data), [presence]);
}
// Broadcasts a message to all players in the match
// Passing null as presences = send to everyone currently in the match
function broadcast(dispatcher, opCode, data) {
    dispatcher.broadcastMessage(opCode, encode(data), null);
}
// ─── Match lifecycle functions ───────────────────────────────────────────────
var matchInit = function (ctx, logger, nk, params) {
    var mode = params["mode"] === "timed" ? "timed" : "classic";
    // Build the initial MatchState — matches the state object we designed
    var state = {
        board: Array(9).fill(null),
        moveCount: 0,
        winningLine: null,
        currentTurn: "", // set in matchJoin when both players present
        players: [],
        status: "waiting",
        mode: mode,
        timerStartedAt: null,
        turnDuration: mode === "timed" ? TURN_DURATION_MS : CLASSIC_TURN_DURATION_MS,
        reconnectWindowMs: RECONNECT_WINDOW_MS,
        result: null,
        matchEndedAt: null,
    };
    logger.info("Match initialized — mode: %s", mode);
    return {
        state: state,
        tickRate: 5, // matchLoop called 5 times per second
        label: mode, // label appears in match listings
    };
};
var matchJoinAttempt = function (ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
    var s = state;
    // Reject if match is already over — prevents late joins
    if (s.status === "over" || s.status === "ended") {
        return { state: state, accept: false, rejectMessage: "Match already ended" };
    }
    // Reject if match is full (2 players already present)
    if (s.players.length >= 2) {
        // Check if this is a reconnecting player
        var isReconnecting = s.players.some(function (p) { return p.id === presence.userId; });
        if (!isReconnecting) {
            return { state: state, accept: false, rejectMessage: "Match is full" };
        }
    }
    return { state: state, accept: true };
};
var matchJoin = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    var s = state;
    var _loop_1 = function (presence) {
        var existingPlayer = s.players.find(function (p) { return p.id === presence.userId; });
        if (existingPlayer) {
            // Reconnecting player — update their presence handle and connection status
            // The presence handle changes on reconnect so we must update it
            existingPlayer.presence = presence;
            existingPlayer.isConnected = true;
            existingPlayer.disconnectedAt = null;
            var opponent = getOpponent(s, presence.userId);
            // Send full state snapshot to reconnecting player
            // They rebuild their entire UI from this
            sendToPlayer(dispatcher, OPCODE.RECONNECT_STATE, {
                board: s.board,
                currentTurn: s.currentTurn,
                status: s.status,
                yourToken: existingPlayer.token,
                opponentId: (opponent === null || opponent === void 0 ? void 0 : opponent.id) || null,
                timerStartedAt: s.timerStartedAt,
                turnDuration: s.turnDuration,
                mode: s.mode,
            }, presence);
            // Notify the other player their opponent is back
            if (opponent === null || opponent === void 0 ? void 0 : opponent.presence) {
                sendToPlayer(dispatcher, OPCODE.OPPONENT_RECONNECTED, {
                    playerId: presence.userId,
                }, opponent.presence);
            }
            logger.info("Player reconnected: %s", presence.userId);
        }
        else {
            // New player joining — assign token based on join order
            // First to join = X, second = O
            var token = s.players.length === 0 ? "X" : "O";
            s.players.push({
                id: presence.userId,
                token: token,
                presence: presence,
                isConnected: true,
                disconnectedAt: null,
            });
            logger.info("Player joined: %s as %s", presence.userId, token);
            // Send join confirmation to this player
            sendToPlayer(dispatcher, OPCODE.MATCH_JOINED, {
                yourToken: token,
                matchId: ctx.matchId,
                mode: s.mode,
            }, presence);
            // If this is the second player, notify the first player
            // and start the countdown
            if (s.players.length === 2) {
                var firstPlayer = s.players[0];
                sendToPlayer(dispatcher, OPCODE.OPPONENT_JOINED, {
                    opponentId: presence.userId,
                }, firstPlayer.presence);
                // Start countdown — send timestamp anchor to both players
                s.status = "countdown";
                s.timerStartedAt = Date.now();
                broadcast(dispatcher, OPCODE.COUNTDOWN_START, {
                    startTimestamp: s.timerStartedAt,
                    durationMs: COUNTDOWN_DURATION_MS,
                });
                logger.info("Countdown started for match: %s", ctx.matchId);
            }
        }
    };
    for (var _i = 0, presences_1 = presences; _i < presences_1.length; _i++) {
        var presence = presences_1[_i];
        _loop_1(presence);
    }
    return { state: s };
};
var matchLeave = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    var s = state;
    var _loop_2 = function (presence) {
        var player = s.players.find(function (p) { return p.id === presence.userId; });
        if (!player)
            return "continue";
        player.isConnected = false;
        player.disconnectedAt = Date.now();
        logger.info("Player disconnected: %s status: %s", presence.userId, s.status);
        // Only pause and notify if game is active
        // If game is already over, disconnection is irrelevant
        if (s.status === "active" || s.status === "countdown") {
            var opponent = getOpponent(s, presence.userId);
            if ((opponent === null || opponent === void 0 ? void 0 : opponent.presence) && opponent.isConnected) {
                sendToPlayer(dispatcher, OPCODE.OPPONENT_DISCONNECTED, {
                    playerId: presence.userId,
                    reconnectWindowMs: RECONNECT_WINDOW_MS,
                }, opponent.presence);
            }
        }
    };
    for (var _i = 0, presences_2 = presences; _i < presences_2.length; _i++) {
        var presence = presences_2[_i];
        _loop_2(presence);
    }
    return { state: s };
};
// ─── matchLoop ───────────────────────────────────────────────────────────────
// Called every tick (5Hz = every 200ms)
// This is the heart of the game — all opcodes processed here
var matchLoop = function (ctx, logger, nk, dispatcher, tick, state, messages) {
    var s = state;
    var now = Date.now();
    var _loop_3 = function (message) {
        var senderId = message.sender.userId;
        var opCode = message.opCode;
        var data = {};
        try {
            data = message.data ? decode(message.data) : {};
        }
        catch (e) {
            logger.warn("Failed to decode message from %s", senderId);
            return "continue";
        }
        switch (opCode) {
            case OPCODE.PLACE_MARK: {
                // Validate: game must be active
                if (s.status !== "active") {
                    sendToPlayer(dispatcher, OPCODE.MOVE_REJECTED, {
                        reason: "game_not_active",
                    }, message.sender);
                    break;
                }
                // Validate: must be this player's turn
                if (s.currentTurn !== senderId) {
                    sendToPlayer(dispatcher, OPCODE.MOVE_REJECTED, {
                        reason: "wrong_turn",
                    }, message.sender);
                    break;
                }
                var cellIndex = data.cellIndex;
                // Validate: cell index in range
                if (cellIndex < 0 || cellIndex > 8) {
                    sendToPlayer(dispatcher, OPCODE.MOVE_REJECTED, {
                        reason: "invalid_cell",
                    }, message.sender);
                    break;
                }
                // Validate: cell must be empty
                if (s.board[cellIndex] !== null) {
                    sendToPlayer(dispatcher, OPCODE.MOVE_REJECTED, {
                        reason: "cell_occupied",
                    }, message.sender);
                    break;
                }
                // Move is valid — apply it
                var player = s.players.find(function (p) { return p.id === senderId; });
                s.board[cellIndex] = player.token;
                s.moveCount++;
                // Reset turn timer for timed mode
                s.timerStartedAt = Date.now();
                // Check win condition
                var winLine = checkWinner(s.board);
                if (winLine) {
                    s.winningLine = winLine;
                    s.status = "over";
                    var opponent_1 = getOpponent(s, senderId);
                    s.result = {
                        winner: senderId,
                        loser: opponent_1.id,
                        cause: "completion",
                    };
                    broadcast(dispatcher, OPCODE.STATE_UPDATE, {
                        board: s.board,
                        nextTurn: null,
                        lastMove: { cell: cellIndex, playerId: senderId },
                        moveCount: s.moveCount,
                    });
                    broadcast(dispatcher, OPCODE.GAME_OVER, {
                        winner: senderId,
                        winningLine: winLine,
                        cause: "completion",
                    });
                    // Write to leaderboard and persist match result
                    handleMatchEnd(ctx, logger, nk, dispatcher, s);
                    break;
                }
                // Check draw condition
                if (s.moveCount === 9) {
                    s.status = "over";
                    s.result = { winner: null, loser: null, cause: "completion" };
                    broadcast(dispatcher, OPCODE.STATE_UPDATE, {
                        board: s.board,
                        nextTurn: null,
                        lastMove: { cell: cellIndex, playerId: senderId },
                        moveCount: s.moveCount,
                    });
                    broadcast(dispatcher, OPCODE.GAME_OVER, {
                        result: "draw",
                        winner: null,
                        winningLine: null,
                        cause: "completion",
                    });
                    handleMatchEnd(ctx, logger, nk, dispatcher, s);
                    break;
                }
                // Game continues — switch turns
                var opponent = getOpponent(s, senderId);
                s.currentTurn = opponent.id;
                broadcast(dispatcher, OPCODE.STATE_UPDATE, {
                    board: s.board,
                    nextTurn: s.currentTurn,
                    lastMove: { cell: cellIndex, playerId: senderId },
                    moveCount: s.moveCount,
                });
                // Send new turn timer in timed mode
                if (s.mode === "timed") {
                    broadcast(dispatcher, OPCODE.TURN_TIMER_START, {
                        startTimestamp: s.timerStartedAt,
                        durationMs: s.turnDuration,
                        activePlayer: s.currentTurn,
                    });
                }
                break;
            }
            case OPCODE.LEAVE_MATCH: {
                // Voluntary quit — treat as forfeit immediately
                // matchLeave will fire separately from Nakama when socket closes
                // This handles the case where the player explicitly quits
                handleForfeit(ctx, logger, nk, dispatcher, s, senderId, "forfeit");
                break;
            }
            default:
                logger.warn("Unknown opcode %d from %s", opCode, senderId);
        }
    };
    // ── 1. Process incoming messages ─────────────────────────────────────────
    for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
        var message = messages_1[_i];
        _loop_3(message);
    }
    // ── 2. Timer checks — run every tick regardless of messages ──────────────
    if (s.status === "countdown" && s.timerStartedAt !== null) {
        var elapsed = now - s.timerStartedAt;
        if (elapsed >= COUNTDOWN_DURATION_MS) {
            // Countdown expired — start the game
            s.status = "active";
            s.timerStartedAt = Date.now();
            // First turn goes to the X player (first to join)
            var xPlayer = s.players.find(function (p) { return p.token === "X"; });
            s.currentTurn = xPlayer.id;
            broadcast(dispatcher, OPCODE.MATCH_START, {
                firstTurn: s.currentTurn,
                board: s.board,
                mode: s.mode,
            });
            // Start turn timer immediately if timed mode
            if (s.mode === "timed") {
                broadcast(dispatcher, OPCODE.TURN_TIMER_START, {
                    startTimestamp: s.timerStartedAt,
                    durationMs: s.turnDuration,
                    activePlayer: s.currentTurn,
                });
            }
            logger.info("Match started: %s", ctx.matchId);
        }
    }
    if (s.status === "active" &&
        s.mode === "timed" &&
        s.timerStartedAt !== null) {
        var elapsed = now - s.timerStartedAt;
        var remaining = s.turnDuration - elapsed;
        // Warning at 5 seconds remaining
        if (remaining <= 5000 && remaining > 4800) {
            broadcast(dispatcher, OPCODE.TURN_TIMER_WARNING, {
                remainingMs: Math.max(0, remaining),
                activePlayer: s.currentTurn,
            });
        }
        // Timer expired — include grace buffer before declaring forfeit
        if (elapsed >= s.turnDuration + GRACE_BUFFER_MS) {
            broadcast(dispatcher, OPCODE.TURN_TIMER_EXPIRED, {
                penalizedPlayer: s.currentTurn,
                consequence: "forfeit",
            });
            handleForfeit(ctx, logger, nk, dispatcher, s, s.currentTurn, "timeout");
        }
    }
    // Presence timeout — opponent never joined within 10 seconds
    if (s.status === "waiting" && s.players.length === 1) {
        // timerStartedAt is null in waiting — use match creation time proxy
        // We use tick count as a proxy: at 5Hz, 50 ticks = 10 seconds
        if (tick >= 50) {
            var presentPlayer = s.players[0];
            sendToPlayer(dispatcher, OPCODE.PRESENCE_TIMEOUT, {
                reason: "opponent_absent",
            }, presentPlayer.presence);
            logger.info("Presence timeout — match ending: %s", ctx.matchId);
            return null; // Returning null terminates the match
        }
    }
    // Disconnection timeout — reconnect window expired
    if (s.status === "active") {
        for (var _a = 0, _b = s.players; _a < _b.length; _a++) {
            var player = _b[_a];
            if (!player.isConnected && player.disconnectedAt !== null) {
                var elapsed = now - player.disconnectedAt;
                if (elapsed >= RECONNECT_WINDOW_MS) {
                    logger.info("Reconnect window expired for: %s", player.id);
                    handleForfeit(ctx, logger, nk, dispatcher, s, player.id, "disconnect");
                }
            }
        }
    }
    // Match ended — terminate the process after result screen
    if (s.status === "over" && s.matchEndedAt !== null) {
        if (Date.now() - s.matchEndedAt >= RESULT_SCREEN_MS) {
            s.status = "ended";
        }
    }
    return { state: s };
};
// ─── Post-game handlers ──────────────────────────────────────────────────────
function handleForfeit(ctx, logger, nk, dispatcher, s, forfeitingPlayerId, cause) {
    if (s.status === "over" || s.status === "ended")
        return;
    var opponent = getOpponent(s, forfeitingPlayerId);
    s.status = "over";
    s.result = {
        winner: (opponent === null || opponent === void 0 ? void 0 : opponent.id) || null,
        loser: forfeitingPlayerId,
        cause: cause,
    };
    broadcast(dispatcher, OPCODE.OPPONENT_FORFEIT, {
        forfeitedPlayer: forfeitingPlayerId,
        reason: cause,
    });
    broadcast(dispatcher, OPCODE.GAME_OVER, {
        winner: (opponent === null || opponent === void 0 ? void 0 : opponent.id) || null,
        winningLine: null,
        cause: cause,
    });
    handleMatchEnd(ctx, logger, nk, dispatcher, s);
}
function handleMatchEnd(ctx, logger, nk, dispatcher, s) {
    if (!s.result)
        return;
    var _a = s.result, winner = _a.winner, loser = _a.loser;
    // Write results to leaderboard and update player stats
    // We'll expand this fully in Step 6 — for now basic writes
    for (var _i = 0, _b = s.players; _i < _b.length; _i++) {
        var player = _b[_i];
        var isWinner = player.id === winner;
        var isDraw = winner === null;
        try {
            // leaderboardRecordWrite(leaderboardId, ownerId, username, score, subscore, metadata)
            // Score = wins. Subscore = total matches. Nakama sorts by score descending.
            nk.leaderboardRecordWrite("global_wins", player.id, player.id, isWinner ? 1 : 0, // increment wins by 1 if winner
            1, // increment total matches by 1
            {});
        }
        catch (e) {
            logger.error("Failed to write leaderboard for %s: %v", player.id, e);
            // Do not rethrow — leaderboard failure should not crash match cleanup
        }
    }
    // Notify players of updated leaderboard
    broadcast(dispatcher, OPCODE.LEADERBOARD_UPDATED, {
        winnerId: winner,
    });
    // Start result screen timer — match transitions to ended after this
    // matchLoop will see status === "ended" on next tick and return null
    s.matchEndedAt = Date.now();
    broadcast(dispatcher, OPCODE.MATCH_END, {
        resultScreenDurationMs: RESULT_SCREEN_MS,
    });
    logger.info("Match ended: %s winner: %s cause: %s", ctx.matchId, winner || "draw", s.result.cause);
}
// ─── Remaining stubs — unchanged from before ────────────────────────────────
var matchTerminate = function (ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
    logger.info("Match terminating: %s", ctx.matchId);
    return { state: state };
};
var matchSignal = function (ctx, logger, nk, dispatcher, tick, state, data) {
    return { state: state };
};
var matchmakerMatched = function (ctx, logger, nk, matches) {
    var _a, _b;
    // Log who got matched
    matches.forEach(function (match) {
        logger.info("Player matched: %s", match.presence.userId);
    });
    // Extract mode from the first player's properties
    // Both players submitted the same mode so either works
    var mode = ((_b = (_a = matches[0]) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b["mode"]) || "classic";
    // Create the match room — returns a match ID
    var matchId;
    try {
        matchId = nk.matchCreate(MODULE_NAME, { mode: mode });
    }
    catch (error) {
        logger.error("Failed to create match: %v", error);
        return;
    }
    logger.info("Match created: %s mode: %s", matchId, mode);
    // Returning the match ID tells Nakama to notify both matched
    // players automatically via their socket connection.
    // They receive a matchmakerMatched notification with this ID.
    return matchId;
};
/// <reference path="./types.ts" />
/// <reference path="./auth.ts" />
/// <reference path="./match.ts" />
/// <reference path="./matchmaker.ts" />
var InitModule = function (ctx, logger, nk, initializer) {
    initializer.registerAfterAuthenticateDevice(afterAuthenticateDevice);
    initializer.registerMatch(MODULE_NAME, {
        matchInit: matchInit,
        matchJoinAttempt: matchJoinAttempt,
        matchJoin: matchJoin,
        matchLeave: matchLeave,
        matchLoop: matchLoop,
        matchTerminate: matchTerminate,
        matchSignal: matchSignal,
    });
    // Create leaderboard if it doesn't exist
    // operator: "increment" means scores accumulate — wins add up over time
    // sort: "desc" means highest wins at the top
    // reset: "" means no automatic reset (permanent leaderboard)
    try {
        nk.leaderboardCreate("global_wins", // leaderboard ID — must match what handleMatchEnd uses
        false, // authoritative — only server can write
        "descending" /* nkruntime.SortOrder.DESCENDING */, "increment" /* nkruntime.Operator.INCREMENTAL */, "", // reset schedule — empty = never resets
        {});
        logger.info("Leaderboard created or already exists");
    }
    catch (error) {
        logger.error("Failed to create leaderboard: %v", error);
    }
    initializer.registerMatchmakerMatched(matchmakerMatched);
    logger.info("Tic-tac-toe server initialized");
};
