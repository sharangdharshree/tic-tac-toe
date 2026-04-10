interface PlayerState {
  id: string;
  token: "X" | "O";
  presence: nkruntime.Presence;
  isConnected: boolean;
  disconnectedAt: number | null;
}

interface MatchState {
  board: (string | null)[];
  moveCount: number;
  winningLine: number[] | null;
  currentTurn: string;
  players: PlayerState[];
  status: "waiting" | "countdown" | "active" | "over" | "ended";
  mode: "classic" | "timed";
  timerStartedAt: number | null;
  turnDuration: number;
  reconnectWindowMs: number;
  result: {
    winner: string | null;
    loser: string | null;
    cause: "completion" | "forfeit" | "timeout" | "disconnect";
  } | null;
  matchEndedAt: number | null;
}

// Opcodes — client to server (1-49), server to client (50-99)
const OPCODE = {
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
} as const;

const TURN_DURATION_MS = 30000;
const CLASSIC_TURN_DURATION_MS = Infinity;
const COUNTDOWN_DURATION_MS = 3000;
const RECONNECT_WINDOW_MS = 15000;
const PRESENCE_TIMEOUT_MS = 10000;
const GRACE_BUFFER_MS = 300;
const RESULT_SCREEN_MS = 5000;

// Win combinations — all 8 possible lines on a 3x3 board
const WIN_COMBINATIONS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8], // rows
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8], // columns
  [0, 4, 8],
  [2, 4, 6], // diagonals
];
