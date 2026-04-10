// Opcode constants — must match server exactly
export const OPCODE = {
  // Client → Server
  JOIN_MATCHMAKER: 1,
  CANCEL_MATCHMAKER: 2,
  JOIN_MATCH: 3,
  PLACE_MARK: 4,
  RECONNECT_MATCH: 5,
  LEAVE_MATCH: 6,
  PLAY_AGAIN: 7,
  // Server → Client
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
} as const;

export type GameMode = "classic" | "timed";
export type PlayerToken = "X" | "O";
export type MatchStatus =
  | "idle"
  | "matchmaking"
  | "waiting"
  | "countdown"
  | "active"
  | "reconnecting"
  | "over"
  | "ended";

// Server → Client payload shapes
export interface MatchmakerMatchedPayload {
  matchId: string;
  mode: GameMode;
}

export interface MatchJoinedPayload {
  yourToken: PlayerToken;
  matchId: string;
  mode: GameMode;
}

export interface OpponentJoinedPayload {
  opponentId: string;
}

export interface CountdownStartPayload {
  startTimestamp: number;
  durationMs: number;
}

export interface MatchStartPayload {
  firstTurn: string;
  board: (string | null)[];
  mode: GameMode;
}

export interface StateUpdatePayload {
  board: (string | null)[];
  nextTurn: string | null;
  lastMove: { cell: number; playerId: string } | null;
  moveCount: number;
}

export interface MoveRejectedPayload {
  reason: "wrong_turn" | "cell_occupied" | "game_not_active" | "invalid_cell";
}

export interface TurnTimerStartPayload {
  startTimestamp: number;
  durationMs: number;
  activePlayer: string;
}

export interface TurnTimerWarningPayload {
  remainingMs: number;
  activePlayer: string;
}

export interface TurnTimerExpiredPayload {
  penalizedPlayer: string;
  consequence: "forfeit";
}

export interface OpponentDisconnectedPayload {
  playerId: string;
  reconnectWindowMs: number;
}

export interface ReconnectStatePayload {
  board: (string | null)[];
  currentTurn: string;
  status: string;
  yourToken: PlayerToken;
  opponentId: string | null;
  timerStartedAt: number | null;
  turnDuration: number;
  mode: GameMode;
}

export interface GameOverPayload {
  winner: string | null;
  winningLine: number[] | null;
  cause: "completion" | "forfeit" | "timeout" | "disconnect";
}

export interface LeaderboardUpdatedPayload {
  winnerId: string | null;
}

export interface MatchEndPayload {
  resultScreenDurationMs: number;
}
