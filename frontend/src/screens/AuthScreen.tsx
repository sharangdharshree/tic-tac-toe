import { useNakama } from "../hooks/useNakama";

export function AuthScreen() {
  const { authenticate } = useNakama();
  return (
    <div>
      <h1>Tic Tac Toe</h1>
      <button onClick={authenticate}>Play as Guest</button>
    </div>
  );
}
