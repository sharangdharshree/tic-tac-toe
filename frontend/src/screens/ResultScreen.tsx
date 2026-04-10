import { useNakama } from "../hooks/useNakama";

export function ResultScreen() {
  const { gameState, joinMatchmaker } = useNakama();
  return (
    <div>
      <h2>
        {gameState.gameResult === "win"
          ? "You Win!"
          : gameState.gameResult === "lose"
            ? "You Lose"
            : "Draw"}
      </h2>
      <button onClick={() => joinMatchmaker(gameState.mode)}>Play Again</button>
    </div>
  );
}
