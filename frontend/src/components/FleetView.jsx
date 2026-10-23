import { ALGO_LABEL, level } from "../utils.js";

function Server({ s }) {
  const lvl = s.state === "running" ? level(s.util) : s.state;
  return (
    <div className={`server ${s.state} ${lvl}`}>
      <div className="tank">
        <div className="fill" style={{ height: `${s.state === "running" ? Math.min(s.util, 100) : 0}%` }} />
      </div>
      <div className="server-info">
        <strong>{s.id}</strong>
        {s.state === "booting" && <span className="tag boot">Booting {s.bootRemaining}s</span>}
        {s.state === "draining" && <span className="tag drain">Draining</span>}
        {s.state === "running" && <span className="tag live">{s.util.toFixed(0)}%</span>}
        <span className="conn">{s.active}/{s.capacity} conn</span>
        <small>{s.served} served</small>
      </div>
    </div>
  );
}

export default function FleetView({ state }) {
  const { servers, config, metrics } = state;
  return (
    <section className="glass fleet fleet-card">
      <div className="card-head">
        <h2>Server fleet</h2>
        <span className="muted">Load imbalance: <b>{metrics.imbalance}%</b></span>
      </div>

      <div className="lb-wrap">
        <div className="lb">
          <div className="lb-title">Load Balancer</div>
          <div className="lb-algo">{ALGO_LABEL[config.algorithm]}</div>
          <div className="lb-rps">{metrics.rps} req/s in</div>
        </div>
        <div className="flow" />
      </div>

      <div className="servers">
        {servers.map((s) => <Server key={s.id} s={s} />)}
      </div>
      <p className="legend">
        <span className="swatch cool" /> low
        <span className="swatch warm" /> busy
        <span className="swatch hot" /> near capacity
        <span className="swatch boot" /> booting
        <span className="swatch drain" /> draining
      </p>
    </section>
  );
}
