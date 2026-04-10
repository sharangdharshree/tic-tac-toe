import { useNakama } from "../hooks/useNakama";

export function GameScreen() {
  const { gameState, placeMark } = useNakama();
  console.log("myId:", gameState.myId, "currentTurn:", gameState.currentTurn);
  return (
    <div>
      <p>
        Turn:{" "}
        {gameState.currentTurn === gameState.myId
          ? "Your turn"
          : "Opponent's turn"}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 80px)",
          gap: "4px",
        }}
      >
        {gameState.board.map((cell, i) => (
          <button
            key={i}
            onClick={() => placeMark(i)}
            style={{ height: 80, fontSize: 32 }}
          >
            {cell}
          </button>
        ))}
      </div>
    </div>
  );
}
