import { useNakama } from "../hooks/useNakama";

export function MatchmakingScreen() {
  const { cancelMatchmaker } = useNakama();
  return (
    <div className="screen">
      <div className="spinner" />
      <p className="pulse-text">Finding opponent...</p>
      <button className="btn btn-secondary" onClick={cancelMatchmaker}>
        Cancel
      </button>
    </div>
  );
}
