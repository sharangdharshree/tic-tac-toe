import { useNakama } from "../hooks/useNakama";

const CAUSE_LABELS: Record<string, string> = {
  forfeit: "Opponent forfeited",
  timeout: "Time ran out",
  disconnect: "Opponent disconnected",
  completion: "",
};

export function ResultScreen() {
  const { gameState, joinMatchmaker } = useNakama();
  const { gameResult, gameOverCause, mode } = gameState;

  const resultClass =
    gameResult === "win" ? "result-text--win"
    : gameResult === "lose" ? "result-text--lose"
    : "result-text--draw";

  const resultLabel =
    gameResult === "win" ? "You Win!"
    : gameResult === "lose" ? "You Lose"
    : "Draw";

  const causeLabel = gameOverCause ? CAUSE_LABELS[gameOverCause] ?? "" : "";

  return (
    <div className="screen">
      <p className={`result-text ${resultClass}`}>{resultLabel}</p>
      {causeLabel && <p className="result-cause">{causeLabel}</p>}
      <button className="btn btn-primary" onClick={() => joinMatchmaker(mode)}>
        Play Again
      </button>
    </div>
  );
}
