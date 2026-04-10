import { useEffect, useRef, useState } from "react";
import { useNakama } from "../hooks/useNakama";

const CAUSE_LABELS: Record<string, string> = {
  wrong_turn: "Not your turn",
  cell_occupied: "Cell already taken",
  game_not_active: "Game not active",
  invalid_cell: "Invalid cell",
};

export function GameScreen() {
  const { gameState, placeMark } = useNakama();
  const {
    board, currentTurn, myId, myToken, winningLine,
    lastRejectedReason, mode,
    timerStartedAt, timerDurationMs, timerActivePlayer,
  } = gameState;

  const isMyTurn = currentTurn === myId;
  const opponentToken = myToken === "X" ? "O" : "X";

  // Shake board on rejected move
  const [shaking, setShaking] = useState(false);
  const prevRejected = useRef(lastRejectedReason);
  useEffect(() => {
    if (lastRejectedReason && lastRejectedReason !== prevRejected.current) {
      setShaking(true);
    }
    prevRejected.current = lastRejectedReason;
  }, [lastRejectedReason]);

  // Timer progress (timed mode)
  const [timerPct, setTimerPct] = useState(100);
  useEffect(() => {
    if (mode !== "timed" || !timerStartedAt || !timerDurationMs) {
      setTimerPct(100);
      return;
    }
    const tick = () => {
      const elapsed = Date.now() - timerStartedAt;
      const pct = Math.max(0, 100 - (elapsed / timerDurationMs) * 100);
      setTimerPct(pct);
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [mode, timerStartedAt, timerDurationMs]);

  const timerSeconds = timerDurationMs
    ? Math.ceil(Math.max(0, timerDurationMs - (Date.now() - (timerStartedAt ?? 0))) / 1000)
    : 0;
  const timerWarning = timerPct < 30;
  const timerIsActive = timerActivePlayer === myId;

  return (
    <div className="game-screen">
      {/* Player info row */}
      <div className="player-info">
        <span className="player-info__you">
          <span className={`token-badge token-badge--${myToken?.toLowerCase()}`}>
            {myToken}
          </span>
          You
        </span>
        <span className="player-info__vs">vs</span>
        <span className="player-info__opp">
          Opponent
          <span className={`token-badge token-badge--${opponentToken.toLowerCase()}`}>
            {opponentToken}
          </span>
        </span>
      </div>

      {/* Turn indicator */}
      <div className={`turn-indicator${isMyTurn ? " turn-indicator--mine" : ""}`}>
        <span className="turn-indicator__dot" />
        {isMyTurn ? "Your turn" : "Opponent's turn"}
      </div>

      {/* Timer bar (timed mode only) */}
      {mode === "timed" && timerStartedAt && (
        <div className="timer-wrap">
          <span className="timer-label">
            {timerIsActive ? `Your time: ${timerSeconds}s` : `Opponent's time: ${timerSeconds}s`}
          </span>
          <div className="timer-track">
            <div
              className={`timer-fill${timerWarning ? " timer-fill--warning" : ""}`}
              style={{ width: `${timerPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Board */}
      <div
        className={`board${shaking ? " board--shake" : ""}`}
        onAnimationEnd={() => setShaking(false)}
      >
        {board.map((cell, i) => {
          const isWinning = winningLine?.includes(i) ?? false;
          const isDisabled = !!cell || !isMyTurn;
          let cls = "cell";
          if (cell === "X") cls += " cell--x";
          else if (cell === "O") cls += " cell--o";
          if (isWinning) cls += " cell--winning";
          if (isDisabled) cls += " cell--disabled";
          return (
            <button
              key={i}
              className={cls}
              onClick={() => !isDisabled && placeMark(i)}
              disabled={isDisabled}
            >
              {cell}
            </button>
          );
        })}
      </div>

      {/* Rejected move feedback */}
      <p className="rejected-reason">
        {lastRejectedReason ? CAUSE_LABELS[lastRejectedReason] ?? lastRejectedReason : ""}
      </p>
    </div>
  );
}
