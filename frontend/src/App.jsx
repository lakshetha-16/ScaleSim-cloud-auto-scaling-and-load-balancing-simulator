import { useCallback, useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import KpiRow from "./components/KpiRow.jsx";
import FleetView from "./components/FleetView.jsx";
import Charts from "./components/Charts.jsx";
import ControlPanel from "./components/ControlPanel.jsx";
import EventLog from "./components/EventLog.jsx";
import { getState, postConfig, postControl } from "./api.js";

const POLL_MS = 400;

export default function App() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    try {
      setState(await getState());
      setError(null);
    } catch {
      setError("Cannot reach the simulation server. Start it with: npm run dev (port 5002).");
    }
  }, []);

  // Ask the server for the latest state a few times per second
  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const showToast = (text, type = "error") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  async function onConfig(partial) {
    try { await postConfig(partial); } catch (e) { showToast(e.message); }
    load();
  }

  async function onControl(action, extra) {
    try { await postControl(action, extra); } catch (e) { showToast(e.message); }
    load();
  }

  return (
    <div className="app">
      <div className="bg-grid" />
      <div className="container">
        {error && <div className="toast error static">{error}</div>}
        {toast && <div className={`toast ${toast.type}`}>{toast.text}</div>}

        {!state ? (
          <p className="muted loading">Connecting to the simulation…</p>
        ) : (
          <>
            <Header tick={state.tick} running={state.running} />
            <KpiRow state={state} />

            <div className="layout">
              <div className="col">
                <FleetView state={state} />
                <Charts state={state} />
              </div>
              <div className="col side">
                <ControlPanel state={state} onConfig={onConfig} onControl={onControl} />
                <EventLog events={state.events} />
              </div>
            </div>

            <details className="glass howto">
              <summary>How to read this dashboard</summary>
              <ul>
                <li><b>Load balancer</b> shares each incoming request between the servers.</li>
                <li><b>Round Robin</b> takes servers in turn. <b>Least Connections</b> picks the server with the fewest active requests, so heavy requests spread out more evenly. Compare the imbalance number.</li>
                <li><b>Auto-scaler</b> adds servers when average utilisation stays above the scale-out line and removes them below the scale-in line. New servers need a few seconds to boot, so a sudden spike can still drop some requests.</li>
                <li><b>Draining</b> means a server stops taking new requests and shuts down after finishing its current ones.</li>
                <li><b>Cost</b> compares your auto-scaled fleet with always running the maximum number of servers.</li>
              </ul>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
