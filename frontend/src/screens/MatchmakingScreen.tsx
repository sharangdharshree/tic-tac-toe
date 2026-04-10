import { useNakama } from "../hooks/useNakama";

export function MatchmakingScreen() {
  const { cancelMatchmaker } = useNakama();
  return (
    <div>
      <p>Finding opponent...</p>
      <button onClick={cancelMatchmaker}>Cancel</button>
    </div>
  );
}
