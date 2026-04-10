import { useEffect, useState } from "react";
import { useNakama } from "../hooks/useNakama";

export function ReconnectingScreen() {
  const { gameState } = useNakama();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    const windowMs = gameState.reconnectWindowMs;
    if (!windowMs) return;
    const end = Date.now() + windowMs;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [gameState.reconnectWindowMs]);

  return (
    <div className="screen">
      <p className="reconnect-title">Opponent disconnected</p>
      <p className="reconnect-sub">Waiting for reconnect</p>
      {secondsLeft !== null && (
        <p className="reconnect-timer">{secondsLeft}s remaining</p>
      )}
    </div>
  );
}
