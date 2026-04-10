/// <reference path="./types.ts" />

const MODULE_NAME = "tic_tac_toe";

// ─── Helpers ────────────────────────────────────────────────────────────────
// Encodes a JS object to a string for dispatcher.broadcastMessage
function encode(data: object): string {
  return JSON.stringify(data);
}

function decode(data: ArrayBuffer): any {
  // Nakama JS SDK sends data as base64-encoded string
  // Convert ArrayBuffer to string first, then parse JSON
  const bytes = new Uint8Array(data);
  let str = "";
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return JSON.parse(str);
}

// Checks all 8 win combinations against the current board
// Returns the winning line [i,j,k] or null if no winner yet
function checkWinner(board: (string | null)[]): number[] | null {
  for (const combo of WIN_COMBINATIONS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return combo;
    }
  }
  return null;
}

// Returns the opponent PlayerState given one player's ID
function getOpponent(state: MatchState, playerId: string): PlayerState | null {
  return state.players.find((p) => p.id !== playerId) || null;
}

// Sends a message to one specific player using their presence handle
// This is how directed messages (move_rejected, reconnect_state) work
function sendToPlayer(
  dispatcher: nkruntime.MatchDispatcher,
  opCode: number,
  data: object,
  presence: nkruntime.Presence,
): void {
  dispatcher.broadcastMessage(opCode, encode(data), [presence]);
}

// Broadcasts a message to all players in the match
// Passing null as presences = send to everyone currently in the match
function broadcast(
  dispatcher: nkruntime.MatchDispatcher,
  opCode: number,
  data: object,
): void {
  dispatcher.broadcastMessage(opCode, encode(data), null);
}

// ─── Match lifecycle functions ───────────────────────────────────────────────

const matchInit: nkruntime.MatchInitFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  params: { [key: string]: string },
): { state: nkruntime.MatchState; tickRate: number; label: string } {
  const mode = params["mode"] === "timed" ? "timed" : "classic";

  // Build the initial MatchState — matches the state object we designed
  const state: MatchState = {
    board: Array(9).fill(null),
    moveCount: 0,
    winningLine: null,
    currentTurn: "", // set in matchJoin when both players present
    players: [],
    status: "waiting",
    mode,
    timerStartedAt: null,
    turnDuration:
      mode === "timed" ? TURN_DURATION_MS : CLASSIC_TURN_DURATION_MS,
    reconnectWindowMs: RECONNECT_WINDOW_MS,
    result: null,
    matchEndedAt: null,
  };

  logger.info("Match initialized — mode: %s", mode);

  return {
    state,
    tickRate: 5, // matchLoop called 5 times per second
    label: mode, // label appears in match listings
  };
};

const matchJoinAttempt: nkruntime.MatchJoinAttemptFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  presence: nkruntime.Presence,
  metadata: { [key: string]: any },
): {
  state: nkruntime.MatchState;
  accept: boolean;
  rejectMessage?: string;
} | null {
  const s = state as MatchState;

  // Reject if match is already over — prevents late joins
  if (s.status === "over" || s.status === "ended") {
    return { state, accept: false, rejectMessage: "Match already ended" };
  }

  // Reject if match is full (2 players already present)
  if (s.players.length >= 2) {
    // Check if this is a reconnecting player
    const isReconnecting = s.players.some((p) => p.id === presence.userId);
    if (!isReconnecting) {
      return { state, accept: false, rejectMessage: "Match is full" };
    }
  }

  return { state, accept: true };
};

const matchJoin: nkruntime.MatchJoinFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  presences: nkruntime.Presence[],
): { state: nkruntime.MatchState } | null {
  const s = state as MatchState;

  for (const presence of presences) {
    const existingPlayer = s.players.find((p) => p.id === presence.userId);

    if (existingPlayer) {
      // Reconnecting player — update their presence handle and connection status
      // The presence handle changes on reconnect so we must update it
      existingPlayer.presence = presence;
      existingPlayer.isConnected = true;
      existingPlayer.disconnectedAt = null;

      const opponent = getOpponent(s, presence.userId);

      // Send full state snapshot to reconnecting player
      // They rebuild their entire UI from this
      sendToPlayer(
        dispatcher,
        OPCODE.RECONNECT_STATE,
        {
          board: s.board,
          currentTurn: s.currentTurn,
          status: s.status,
          yourToken: existingPlayer.token,
          opponentId: opponent?.id || null,
          timerStartedAt: s.timerStartedAt,
          turnDuration: s.turnDuration,
          mode: s.mode,
        },
        presence,
      );

      // Notify the other player their opponent is back
      if (opponent?.presence) {
        sendToPlayer(
          dispatcher,
          OPCODE.OPPONENT_RECONNECTED,
          {
            playerId: presence.userId,
          },
          opponent.presence,
        );
      }

      logger.info("Player reconnected: %s", presence.userId);
    } else {
      // New player joining — assign token based on join order
      // First to join = X, second = O
      const token: "X" | "O" = s.players.length === 0 ? "X" : "O";

      s.players.push({
        id: presence.userId,
        token,
        presence,
        isConnected: true,
        disconnectedAt: null,
      });

      logger.info("Player joined: %s as %s", presence.userId, token);

      // Send join confirmation to this player
      sendToPlayer(
        dispatcher,
        OPCODE.MATCH_JOINED,
        {
          yourToken: token,
          matchId: ctx.matchId,
          mode: s.mode,
        },
        presence,
      );

      // If this is the second player, notify the first player
      // and start the countdown
      if (s.players.length === 2) {
        const firstPlayer = s.players[0];
        sendToPlayer(
          dispatcher,
          OPCODE.OPPONENT_JOINED,
          {
            opponentId: presence.userId,
          },
          firstPlayer.presence,
        );

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
  }

  return { state: s };
};

const matchLeave: nkruntime.MatchLeaveFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  presences: nkruntime.Presence[],
): { state: nkruntime.MatchState } | null {
  const s = state as MatchState;

  for (const presence of presences) {
    const player = s.players.find((p) => p.id === presence.userId);
    if (!player) continue;

    player.isConnected = false;
    player.disconnectedAt = Date.now();

    logger.info(
      "Player disconnected: %s status: %s",
      presence.userId,
      s.status,
    );

    // Only pause and notify if game is active
    // If game is already over, disconnection is irrelevant
    if (s.status === "active" || s.status === "countdown") {
      const opponent = getOpponent(s, presence.userId);

      if (opponent?.presence && opponent.isConnected) {
        sendToPlayer(
          dispatcher,
          OPCODE.OPPONENT_DISCONNECTED,
          {
            playerId: presence.userId,
            reconnectWindowMs: RECONNECT_WINDOW_MS,
          },
          opponent.presence,
        );
      }
    }
  }

  return { state: s };
};

// ─── matchLoop ───────────────────────────────────────────────────────────────
// Called every tick (5Hz = every 200ms)
// This is the heart of the game — all opcodes processed here

const matchLoop: nkruntime.MatchLoopFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  messages: nkruntime.MatchMessage[],
): { state: nkruntime.MatchState } | null {
  const s = state as MatchState;
  const now = Date.now();

  // ── 1. Process incoming messages ─────────────────────────────────────────
  for (const message of messages) {
    const senderId = message.sender.userId;
    const opCode = message.opCode;
    let data: any = {};

    try {
      data = message.data ? decode(message.data) : {};
    } catch (e) {
      logger.warn("Failed to decode message from %s", senderId);
      continue;
    }

    switch (opCode) {
      case OPCODE.PLACE_MARK: {
        // Validate: game must be active
        if (s.status !== "active") {
          sendToPlayer(
            dispatcher,
            OPCODE.MOVE_REJECTED,
            {
              reason: "game_not_active",
            },
            message.sender,
          );
          break;
        }

        // Validate: must be this player's turn
        if (s.currentTurn !== senderId) {
          sendToPlayer(
            dispatcher,
            OPCODE.MOVE_REJECTED,
            {
              reason: "wrong_turn",
            },
            message.sender,
          );
          break;
        }

        const cellIndex = data.cellIndex as number;

        // Validate: cell index in range
        if (cellIndex < 0 || cellIndex > 8) {
          sendToPlayer(
            dispatcher,
            OPCODE.MOVE_REJECTED,
            {
              reason: "invalid_cell",
            },
            message.sender,
          );
          break;
        }

        // Validate: cell must be empty
        if (s.board[cellIndex] !== null) {
          sendToPlayer(
            dispatcher,
            OPCODE.MOVE_REJECTED,
            {
              reason: "cell_occupied",
            },
            message.sender,
          );
          break;
        }

        // Move is valid — apply it
        const player = s.players.find((p) => p.id === senderId)!;
        s.board[cellIndex] = player.token;
        s.moveCount++;

        // Reset turn timer for timed mode
        s.timerStartedAt = Date.now();

        // Check win condition
        const winLine = checkWinner(s.board);
        if (winLine) {
          s.winningLine = winLine;
          s.status = "over";
          const opponent = getOpponent(s, senderId)!;
          s.result = {
            winner: senderId,
            loser: opponent.id,
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
        const opponent = getOpponent(s, senderId)!;
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
  }

  // ── 2. Timer checks — run every tick regardless of messages ──────────────

  if (s.status === "countdown" && s.timerStartedAt !== null) {
    const elapsed = now - s.timerStartedAt;

    if (elapsed >= COUNTDOWN_DURATION_MS) {
      // Countdown expired — start the game
      s.status = "active";
      s.timerStartedAt = Date.now();

      // First turn goes to the X player (first to join)
      const xPlayer = s.players.find((p) => p.token === "X")!;
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

  if (
    s.status === "active" &&
    s.mode === "timed" &&
    s.timerStartedAt !== null
  ) {
    const elapsed = now - s.timerStartedAt;
    const remaining = s.turnDuration - elapsed;

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
      const presentPlayer = s.players[0];
      sendToPlayer(
        dispatcher,
        OPCODE.PRESENCE_TIMEOUT,
        {
          reason: "opponent_absent",
        },
        presentPlayer.presence,
      );
      logger.info("Presence timeout — match ending: %s", ctx.matchId);
      return null; // Returning null terminates the match
    }
  }

  // Disconnection timeout — reconnect window expired
  if (s.status === "active") {
    for (const player of s.players) {
      if (!player.isConnected && player.disconnectedAt !== null) {
        const elapsed = now - player.disconnectedAt;
        if (elapsed >= RECONNECT_WINDOW_MS) {
          logger.info("Reconnect window expired for: %s", player.id);
          handleForfeit(
            ctx,
            logger,
            nk,
            dispatcher,
            s,
            player.id,
            "disconnect",
          );
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

function handleForfeit(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  s: MatchState,
  forfeitingPlayerId: string,
  cause: "forfeit" | "timeout" | "disconnect",
): void {
  if (s.status === "over" || s.status === "ended") return;

  const opponent = getOpponent(s, forfeitingPlayerId);
  s.status = "over";
  s.result = {
    winner: opponent?.id || null,
    loser: forfeitingPlayerId,
    cause,
  };

  broadcast(dispatcher, OPCODE.OPPONENT_FORFEIT, {
    forfeitedPlayer: forfeitingPlayerId,
    reason: cause,
  });

  broadcast(dispatcher, OPCODE.GAME_OVER, {
    winner: opponent?.id || null,
    winningLine: null,
    cause,
  });

  handleMatchEnd(ctx, logger, nk, dispatcher, s);
}

function handleMatchEnd(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  s: MatchState,
): void {
  if (!s.result) return;

  const { winner, loser } = s.result;

  // Write results to leaderboard and update player stats
  // We'll expand this fully in Step 6 — for now basic writes
  for (const player of s.players) {
    const isWinner = player.id === winner;
    const isDraw = winner === null;

    try {
      // leaderboardRecordWrite(leaderboardId, ownerId, username, score, subscore, metadata)
      // Score = wins. Subscore = total matches. Nakama sorts by score descending.
      nk.leaderboardRecordWrite(
        "global_wins",
        player.id,
        player.id,
        isWinner ? 1 : 0, // increment wins by 1 if winner
        1, // increment total matches by 1
        {},
      );
    } catch (e) {
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

  logger.info(
    "Match ended: %s winner: %s cause: %s",
    ctx.matchId,
    winner || "draw",
    s.result.cause,
  );
}

// ─── Remaining stubs — unchanged from before ────────────────────────────────

const matchTerminate: nkruntime.MatchTerminateFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  graceSeconds: number,
): { state: nkruntime.MatchState } | null {
  logger.info("Match terminating: %s", ctx.matchId);
  return { state };
};

const matchSignal: nkruntime.MatchSignalFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  data: string,
): { state: nkruntime.MatchState; data?: string } | null {
  return { state };
};
