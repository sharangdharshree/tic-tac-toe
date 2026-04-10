import { useNakama } from "../hooks/useNakama";

export function LobbyScreen() {
  const { joinMatchmaker } = useNakama();
  return (
    <div>
      <h1>Lobby</h1>
      <button onClick={() => joinMatchmaker("classic")}>Classic</button>
      <button onClick={() => joinMatchmaker("timed")}>Timed</button>
    </div>
  );
}
