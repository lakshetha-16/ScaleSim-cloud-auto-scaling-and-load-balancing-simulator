export default function Header({ tick, running }) {
  return (
    <header className="header">
      <div>
        <h1><span className="logo">⚖</span> ScaleSim</h1>
        <p className="subtitle">Cloud Auto-Scaling and Load Balancing Simulator</p>
      </div>
      <div className="header-right">
        <span className="clock">t = {tick}s</span>
        <span className={`status ${running ? "on" : "off"}`}>
          <span className="dot" /> {running ? "Running" : "Paused"}
        </span>
      </div>
    </header>
  );
}
