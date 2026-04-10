import type {
  GameMode,
  PlayerToken,
  MatchStatus,
  MatchmakerMatchedPayload,
  MatchJoinedPayload,
  CountdownStartPayload,
  MatchStartPayload,
  StateUpdatePayload,
  MoveRejectedPayload,
  TurnTimerStartPayload,
  TurnTimerWarningPayload,
  TurnTimerExpiredPayload,
  OpponentDisconnectedPayload,
  ReconnectStatePayload,
  GameOverPayload,
  MatchEndPayload,
} from "../nakama/types";
import { OPCODE } from "../nakama/types";

export interface GameState {
  // Match identity
  matchId: string | null;
  mode: GameMode;
  status: MatchStatus;

  // Player identity
  myId: string | null; // Nakama user ID of local player
  myToken: PlayerToken | null; // X or O
  opponentId: string | null;

  // Board
  board: (string | null)[];
  moveCount: number;
  winningLine: number[] | null;
  currentTurn: string | null; // player ID whose turn it is

  // Timer — null when no timer running
  timerStartedAt: number | null;
  timerDurationMs: number | null;
  timerActivePlayer: string | null;

  // Result
  gameResult: "win" | "lose" | "draw" | null;
  gameOverCause: string | null;

  // Reconnection
  reconnectWindowMs: number | null;
  disconnectedOpponentId: string | null;

  // UI feedback
  lastRejectedReason: string | null;
}

export const initialGameState: GameState = {
  matchId: null,
  mode: "classic",
  status: "idle",
  myId: null,
  myToken: null,
  opponentId: null,
  board: Array(9).fill(null),
  moveCount: 0,
  winningLine: null,
  currentTurn: null,
  timerStartedAt: null,
  timerDurationMs: null,
  timerActivePlayer: null,
  gameResult: null,
  gameOverCause: null,
  reconnectWindowMs: null,
  disconnectedOpponentId: null,
  lastRejectedReason: null,
};

// Action type — every socket message becomes one of these
export type GameAction =
  | { type: "SET_MY_ID"; payload: string }
  | { type: "START_MATCHMAKING"; payload: { mode: GameMode } }
  | { type: "CANCEL_MATCHMAKING" }
  | {
      type: typeof OPCODE.MATCHMAKER_MATCHED;
      payload: MatchmakerMatchedPayload;
    }
  | { type: typeof OPCODE.MATCH_JOINED; payload: MatchJoinedPayload }
  | { type: typeof OPCODE.OPPONENT_JOINED }
  | { type: typeof OPCODE.PRESENCE_TIMEOUT }
  | { type: typeof OPCODE.COUNTDOWN_START; payload: CountdownStartPayload }
  | { type: typeof OPCODE.COUNTDOWN_ABORT }
  | { type: typeof OPCODE.MATCH_START; payload: MatchStartPayload }
  | { type: typeof OPCODE.STATE_UPDATE; payload: StateUpdatePayload }
  | { type: typeof OPCODE.MOVE_REJECTED; payload: MoveRejectedPayload }
  | { type: typeof OPCODE.TURN_TIMER_START; payload: TurnTimerStartPayload }
  | { type: typeof OPCODE.TURN_TIMER_WARNING; payload: TurnTimerWarningPayload }
  | { type: typeof OPCODE.TURN_TIMER_EXPIRED; payload: TurnTimerExpiredPayload }
  | {
      type: typeof OPCODE.OPPONENT_DISCONNECTED;
      payload: OpponentDisconnectedPayload;
    }
  | { type: typeof OPCODE.OPPONENT_RECONNECTED }
  | { type: typeof OPCODE.RECONNECT_STATE; payload: ReconnectStatePayload }
  | { type: typeof OPCODE.OPPONENT_FORFEIT }
  | { type: typeof OPCODE.GAME_OVER; payload: GameOverPayload }
  | { type: typeof OPCODE.LEADERBOARD_UPDATED }
  | { type: typeof OPCODE.MATCH_END; payload: MatchEndPayload }
  | { type: "RESET" };

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "SET_MY_ID":
      return { ...state, myId: action.payload };

    case "START_MATCHMAKING":
      return { ...state, status: "matchmaking", mode: action.payload.mode };

    case "CANCEL_MATCHMAKING":
      return { ...state, status: "idle" };

    case OPCODE.MATCHMAKER_MATCHED:
      // Matchmaker found a pair — store match ID, transition to waiting
      // Client will now call join_match using this ID
      return {
        ...state,
        matchId: action.payload.matchId,
        mode: action.payload.mode,
        status: "waiting",
      };

    case OPCODE.MATCH_JOINED:
      // Server confirmed we joined — store our token (X or O)
      return {
        ...state,
        myToken: action.payload.yourToken,
        status: "waiting",
      };

    case OPCODE.OPPONENT_JOINED:
      // Both players present — waiting for countdown_start from server
      return { ...state };

    case OPCODE.PRESENCE_TIMEOUT:
      // Opponent never showed — return to idle
      return { ...initialGameState };

    case OPCODE.COUNTDOWN_START:
      return {
        ...state,
        status: "countdown",
        timerStartedAt: action.payload.startTimestamp,
        timerDurationMs: action.payload.durationMs,
      };

    case OPCODE.COUNTDOWN_ABORT:
      return { ...state, status: "reconnecting" };

    case OPCODE.MATCH_START:
      // Game is live — server fired this, not the client countdown hitting zero
      return {
        ...state,
        status: "active",
        board: action.payload.board,
        currentTurn: action.payload.firstTurn,
        mode: action.payload.mode,
        timerStartedAt: null,
        timerDurationMs: null,
      };

    case OPCODE.STATE_UPDATE:
      // Authoritative board state from server after valid move
      return {
        ...state,
        board: action.payload.board,
        currentTurn: action.payload.nextTurn,
        moveCount: action.payload.moveCount,
        lastRejectedReason: null, // clear any previous rejection
      };

    case OPCODE.MOVE_REJECTED:
      // Server rejected our move — store reason for UI feedback
      // Board stays unchanged — server is source of truth
      return {
        ...state,
        lastRejectedReason: action.payload.reason,
      };

    case OPCODE.TURN_TIMER_START:
      return {
        ...state,
        timerStartedAt: action.payload.startTimestamp,
        timerDurationMs: action.payload.durationMs,
        timerActivePlayer: action.payload.activePlayer,
      };

    case OPCODE.TURN_TIMER_WARNING:
      // Re-sync timer display — corrects any clock drift
      return {
        ...state,
        timerStartedAt:
          Date.now() - (state.timerDurationMs! - action.payload.remainingMs),
      };

    case OPCODE.TURN_TIMER_EXPIRED:
      return {
        ...state,
        timerStartedAt: null,
        timerDurationMs: null,
      };

    case OPCODE.OPPONENT_DISCONNECTED:
      return {
        ...state,
        status: "reconnecting",
        disconnectedOpponentId: action.payload.playerId,
        reconnectWindowMs: action.payload.reconnectWindowMs,
      };

    case OPCODE.OPPONENT_RECONNECTED:
      return {
        ...state,
        status: "active",
        disconnectedOpponentId: null,
        reconnectWindowMs: null,
      };

    case OPCODE.RECONNECT_STATE:
      // Full state snapshot for returning player — rebuild everything
      return {
        ...state,
        board: action.payload.board,
        currentTurn: action.payload.currentTurn,
        myToken: action.payload.yourToken,
        opponentId: action.payload.opponentId,
        timerStartedAt: action.payload.timerStartedAt,
        timerDurationMs: action.payload.turnDuration,
        mode: action.payload.mode,
        status: "active",
      };

    case OPCODE.OPPONENT_FORFEIT:
      // Forfeit broadcast — game_over follows immediately after
      return { ...state };

    case OPCODE.GAME_OVER:
      return {
        ...state,
        status: "over",
        gameResult: action.payload.result,
        gameOverCause: action.payload.cause,
        winningLine: action.payload.winningLine,
        currentTurn: null,
        timerStartedAt: null,
        timerDurationMs: null,
      };

    case OPCODE.LEADERBOARD_UPDATED:
      return { ...state };

    case OPCODE.MATCH_END:
      // Result screen timer started — transition to ended
      return { ...state, status: "ended" };

    case "RESET":
      return { ...initialGameState };

    default:
      return state;
  }
}
