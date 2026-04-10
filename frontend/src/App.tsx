import { useNakama } from "./hooks/useNakama";
import { AuthScreen } from "./screens/AuthScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { MatchmakingScreen } from "./screens/MatchmakingScreen";
import { CountdownScreen } from "./screens/CountdownScreen";
import { GameScreen } from "./screens/GameScreen";
import { ReconnectingScreen } from "./screens/ReconnectingScreen";
import { ResultScreen } from "./screens/ResultScreen";

export default function App() {
  const { session, gameState } = useNakama();

  // Not authenticated yet
  if (!session) return <AuthScreen />;

  // Route based on match status
  // This is your client-side state machine —
  // mirrors the server-side match status
  switch (gameState.status) {
    case "idle":
      return <LobbyScreen />;
    case "matchmaking":
      return <MatchmakingScreen />;
    case "waiting":
    case "countdown":
      return <CountdownScreen />;
    case "active":
      return <GameScreen />;
    case "reconnecting":
      return <ReconnectingScreen />;
    case "over":
    case "ended":
      return <ResultScreen />;
    default:
      return <LobbyScreen />;
  }
}
