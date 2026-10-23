import { useEffect, useRef, useState } from "react";

// A slider that only talks to the server when you let go (not on every pixel of dragging).
function Slider({ label, value, min, max, unit = "", onCommit }) {
  const [v, setV] = useState(value);
  const dragging = useRef(false);
  useEffect(() => { if (!dragging.current) setV(value); }, [value]);
  const commit = () => { dragging.current = false; if (v !== value) onCommit(v); };
  return (
    <label className="slider">
      <span>{label}<b>{v}{unit}</b></span>
      <input
        type="range" min={min} max={max} value={v}
        onChange={(e) => { dragging.current = true; setV(Number(e.target.value)); }}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit}
      />
    </label>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? "active" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export default function ControlPanel({ state, onConfig, onControl }) {
  const c = state.config;
  return (
    <section className="glass controls">
      <h2>Controls</h2>

      <div className="btn-row">
        <button className="btn primary" onClick={() => onControl(state.running ? "pause" : "play")}>
          {state.running ? "⏸ Pause" : "▶ Play"}
        </button>
        <button className="btn" onClick={() => onControl("reset")}>↺ Reset</button>
      </div>

      <h4>Load balancing algorithm</h4>
      <Segmented
        value={c.algorithm}
        onChange={(v) => onConfig({ algorithm: v })}
        options={[{ value: "round_robin", label: "Round Robin" }, { value: "least_connections", label: "Least Connections" }]}
      />

      <h4>Traffic</h4>
      <select value={c.trafficProfile} onChange={(e) => onConfig({ trafficProfile: e.target.value })}>
        <option value="spike">Spike (flash sale every 100 s)</option>
        <option value="wave">Wave (day / night cycle)</option>
        <option value="steady">Steady</option>
        <option value="manual">Manual</option>
      </select>
      {c.trafficProfile === "manual"
        ? <Slider label="Requests per second" value={c.manualRps} min={0} max={120} onCommit={(v) => onConfig({ manualRps: v })} />
        : <Slider label="Base requests per second" value={c.baseRps} min={1} max={40} onCommit={(v) => onConfig({ baseRps: v })} />}
      <button className="btn warn full" onClick={() => onControl("burst", { size: 150 })}>⚡ Send burst (+150 requests)</button>

      <h4>Simulation speed</h4>
      <Segmented
        value={c.speed}
        onChange={(v) => onConfig({ speed: v })}
        options={[{ value: 1, label: "1x" }, { value: 2, label: "2x" }, { value: 5, label: "5x" }]}
      />

      <h4>Scaling rules</h4>
      <Slider label="Minimum servers" value={c.minServers} min={1} max={10} onCommit={(v) => onConfig({ minServers: v })} />
      <Slider label="Maximum servers" value={c.maxServers} min={2} max={20} onCommit={(v) => onConfig({ maxServers: v })} />
      <Slider label="Scale out above" value={c.scaleOutThreshold} min={50} max={95} unit="%" onCommit={(v) => onConfig({ scaleOutThreshold: v })} />
      <Slider label="Scale in below" value={c.scaleInThreshold} min={10} max={50} unit="%" onCommit={(v) => onConfig({ scaleInThreshold: v })} />
      <Slider label="Capacity per server" value={c.capacityPerServer} min={5} max={50} onCommit={(v) => onConfig({ capacityPerServer: v })} />

      <h4>Manual scaling</h4>
      <div className="btn-row">
        <button className="btn" onClick={() => onControl("add_server")}>＋ Add server</button>
        <button className="btn" onClick={() => onControl("remove_server")}>－ Remove server</button>
      </div>
    </section>
  );
}
