import { useNakama } from "../hooks/useNakama";

export function CountdownScreen() {
  const { gameState } = useNakama();
  const token = gameState.myToken;

  return (
    <div className="screen">
      <p className="countdown-title">Match Found!</p>
      {token && (
        <span className="countdown-token">
          You are&nbsp;
          <span className={`token-badge token-badge--${token.toLowerCase()}`}>
            {token}
          </span>
        </span>
      )}
      <p className="pulse-text">Get ready...</p>
    </div>
  );
}
