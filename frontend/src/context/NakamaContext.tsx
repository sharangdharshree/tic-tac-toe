import {
  createContext,
  useReducer,
  useRef,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { Session } from "@heroiclabs/nakama-js";
import type { Socket } from "@heroiclabs/nakama-js";
import { nakamaClient, getDeviceId } from "../nakama/client";
import {
  gameReducer,
  initialGameState,
  type GameState,
  type GameAction,
} from "../store/gameReducer";
import {
  OPCODE,
  type GameMode,
  type MatchJoinedPayload,
  type CountdownStartPayload,
  type MatchStartPayload,
  type StateUpdatePayload,
  type MoveRejectedPayload,
  type TurnTimerStartPayload,
  type TurnTimerWarningPayload,
  type TurnTimerExpiredPayload,
  type OpponentDisconnectedPayload,
  type ReconnectStatePayload,
  type GameOverPayload,
  type MatchEndPayload,
} from "../nakama/types";

interface NakamaContextValue {
  // Auth
  session: Session | null;
  authenticate: () => Promise<void>;

  // Game state — read by all components
  gameState: GameState;
  dispatch: React.Dispatch<GameAction>;

  // Socket actions — called by components to send messages
  joinMatchmaker: (mode: GameMode) => void;
  cancelMatchmaker: () => void;
  placeMark: (cellIndex: number) => void;
  leaveMatch: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const NakamaContext = createContext<NakamaContextValue | null>(null);

export function NakamaProvider({ children }: { children: ReactNode }) {
  const [gameState, dispatch] = useReducer(gameReducer, initialGameState);

  // useRef for session and socket — changes to these should not
  // trigger re-renders. Only gameState changes should cause re-renders.
  const [session, setSession] = useState<Session | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const matchmakerTicketRef = useRef<string | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────

  const authenticate = useCallback(async () => {
    const deviceId = getDeviceId();

    // Authenticates with Nakama using device ID
    // create: true means create account if device is new
    const session = await nakamaClient.authenticateDevice(deviceId, true);
    setSession(session);

    // Store the user ID in game state so components can reference it
    dispatch({ type: "SET_MY_ID", payload: session.user_id! });

    // Open WebSocket connection immediately after auth
    // useSSL false for local dev — matches client.ts config
    const socket = nakamaClient.createSocket(false, false);
    socketRef.current = socket;

    // ── Socket event handlers ─────────────────────────────────────────────
    // All incoming server messages are handled here and dispatched to reducer
    // This is the single point of entry for all real-time events

    socket.onmatchdata = (matchData) => {
      const opCode = matchData.op_code;
      let payload: unknown = {};

      if (matchData.data && matchData.data.byteLength > 0) {
        try {
          payload = JSON.parse(new TextDecoder().decode(matchData.data));
        } catch (e) {
          console.error(
            "Failed to decode match data for opcode",
            opCode,
            (e as Error).message,
          );
          return;
        }
      }

      switch (opCode) {
        case OPCODE.MATCH_JOINED:
          dispatch({
            type: OPCODE.MATCH_JOINED,
            payload: payload as MatchJoinedPayload,
          });
          break;
        case OPCODE.OPPONENT_JOINED:
          dispatch({ type: OPCODE.OPPONENT_JOINED });
          break;
        case OPCODE.PRESENCE_TIMEOUT:
          dispatch({ type: OPCODE.PRESENCE_TIMEOUT });
          break;
        case OPCODE.COUNTDOWN_START:
          dispatch({
            type: OPCODE.COUNTDOWN_START,
            payload: payload as CountdownStartPayload,
          });
          break;
        case OPCODE.COUNTDOWN_ABORT:
          dispatch({ type: OPCODE.COUNTDOWN_ABORT });
          break;
        case OPCODE.MATCH_START:
          dispatch({
            type: OPCODE.MATCH_START,
            payload: payload as MatchStartPayload,
          });
          break;
        case OPCODE.STATE_UPDATE:
          dispatch({
            type: OPCODE.STATE_UPDATE,
            payload: payload as StateUpdatePayload,
          });
          break;
        case OPCODE.MOVE_REJECTED:
          dispatch({
            type: OPCODE.MOVE_REJECTED,
            payload: payload as MoveRejectedPayload,
          });
          break;
        case OPCODE.TURN_TIMER_START:
          dispatch({
            type: OPCODE.TURN_TIMER_START,
            payload: payload as TurnTimerStartPayload,
          });
          break;
        case OPCODE.TURN_TIMER_WARNING:
          dispatch({
            type: OPCODE.TURN_TIMER_WARNING,
            payload: payload as TurnTimerWarningPayload,
          });
          break;
        case OPCODE.TURN_TIMER_EXPIRED:
          dispatch({
            type: OPCODE.TURN_TIMER_EXPIRED,
            payload: payload as TurnTimerExpiredPayload,
          });
          break;
        case OPCODE.OPPONENT_DISCONNECTED:
          dispatch({
            type: OPCODE.OPPONENT_DISCONNECTED,
            payload: payload as OpponentDisconnectedPayload,
          });
          break;
        case OPCODE.OPPONENT_RECONNECTED:
          dispatch({ type: OPCODE.OPPONENT_RECONNECTED });
          break;
        case OPCODE.RECONNECT_STATE:
          dispatch({
            type: OPCODE.RECONNECT_STATE,
            payload: payload as ReconnectStatePayload,
          });
          break;
        case OPCODE.OPPONENT_FORFEIT:
          dispatch({ type: OPCODE.OPPONENT_FORFEIT });
          break;
        case OPCODE.GAME_OVER:
          dispatch({
            type: OPCODE.GAME_OVER,
            payload: payload as GameOverPayload,
          });
          break;
        case OPCODE.LEADERBOARD_UPDATED:
          dispatch({ type: OPCODE.LEADERBOARD_UPDATED });
          break;
        case OPCODE.MATCH_END:
          dispatch({
            type: OPCODE.MATCH_END,
            payload: payload as MatchEndPayload,
          });
          setTimeout(
            () => dispatch({ type: "RESET" }),
            (payload as MatchEndPayload).resultScreenDurationMs,
          );
          break;
        default:
          console.warn("Unhandled opcode:", opCode);
      }
    };

    socket.ondisconnect = () => {
      // Socket closed unexpectedly — show reconnecting state
      // The server will handle the reconnect window
      console.warn("Socket disconnected");
    };

    // Connect the socket using the authenticated session
    await socket.connect(session, true);
  }, []);

  // ── Socket send helpers ───────────────────────────────────────────────────
  // These are the C→S opcodes from your opcode table
  // Components call these — they never touch the socket directly

  const joinMatchmaker = useCallback(
    (mode: GameMode) => {
      if (!socketRef.current) return;
      if (gameState.status !== "idle") return;

      dispatch({ type: "START_MATCHMAKING", payload: { mode } });

      // Re-register handler fresh each time we enter matchmaking
      // Prevents stale handler from previous game accepting a second match
      socketRef.current.onmatchmakermatched = (matched) => {
        dispatch({
          type: OPCODE.MATCHMAKER_MATCHED,
          payload: { matchId: matched.match_id!, mode },
        });
        socketRef.current?.joinMatch(matched.match_id!);
        // Clear handler after firing — one match per queue entry
        if (socketRef.current) socketRef.current.onmatchmakermatched = () => {};
      };

      socketRef.current
        .addMatchmaker("*", 2, 2, { mode }, {})
        .then((ticket) => {
          matchmakerTicketRef.current = ticket.ticket!;
        });
    },
    [gameState.status],
  );

  const cancelMatchmaker = useCallback(() => {
    if (!socketRef.current || !matchmakerTicketRef.current) return;

    socketRef.current.removeMatchmaker(matchmakerTicketRef.current);
    matchmakerTicketRef.current = null;
    dispatch({ type: "CANCEL_MATCHMAKING" });
  }, []);

  const placeMark = useCallback(
    (cellIndex: number) => {
      if (!socketRef.current || !gameState.matchId) return;

      // Send as C→S opcode PLACE_MARK with cell index
      // Server validates before applying — client does not update board here
      socketRef.current.sendMatchState(
        gameState.matchId,
        OPCODE.PLACE_MARK,
        JSON.stringify({ cellIndex }),
      );
    },
    [gameState.matchId],
  );

  const leaveMatch = useCallback(() => {
    if (!socketRef.current || !gameState.matchId) return;

    socketRef.current.sendMatchState(
      gameState.matchId,
      OPCODE.LEAVE_MATCH,
      JSON.stringify({}),
    );
  }, [gameState.matchId]);

  return (
    <NakamaContext.Provider
      value={{
        session,
        authenticate,
        gameState,
        dispatch,
        joinMatchmaker,
        cancelMatchmaker,
        placeMark,
        leaveMatch,
      }}
    >
      {children}
    </NakamaContext.Provider>
  );
}
