import { useNakama } from "../hooks/useNakama";

export function AuthScreen() {
  const { authenticate } = useNakama();
  return (
    <div className="screen">
      <h1 className="game-title">Tic Tac Toe</h1>
      <p className="auth-subtitle">Multiplayer. Real-time. No accounts needed.</p>
      <button className="btn btn-primary" onClick={authenticate}>
        Play as Guest
      </button>
    </div>
  );
}
