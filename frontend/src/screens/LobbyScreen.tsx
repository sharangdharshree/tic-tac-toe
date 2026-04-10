import { useNakama } from "../hooks/useNakama";

export function LobbyScreen() {
  const { joinMatchmaker } = useNakama();
  return (
    <div className="screen">
      <p className="lobby-heading">Choose a Mode</p>
      <div className="mode-cards">
        <div className="mode-card" onClick={() => joinMatchmaker("classic")}>
          <span className="mode-card__icon">♟</span>
          <p className="mode-card__title">Classic</p>
          <p className="mode-card__desc">No time limit per move</p>
        </div>
        <div className="mode-card" onClick={() => joinMatchmaker("timed")}>
          <span className="mode-card__icon">⏱</span>
          <p className="mode-card__title">Timed</p>
          <p className="mode-card__desc">10 seconds per turn</p>
        </div>
      </div>
    </div>
  );
}
