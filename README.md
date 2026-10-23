# ScaleSim - Cloud Auto-Scaling and Load Balancing Simulator

An interactive simulator that shows how a cloud service copes with changing traffic:
a **load balancer** shares requests between servers, and an **auto-scaler** adds or removes
servers automatically. You can change the rules live and watch the effect on servers,
latency, dropped requests and cost.

## Technology used
| Part | Technology |
|---|---|
| Front end | React 18, Vite, Recharts (charts), plain CSS ("aurora glass" theme) |
| Back end | Node.js, Express (REST API) |
| Simulation | Plain JavaScript engine in `backend/simulator.js` |
| Storage | In memory only. **No database, no Docker, no login needed** |

## Cloud concepts it demonstrates
- **Horizontal scaling** - adding more servers instead of making one bigger
- **Load balancing** - Round Robin versus Least Connections
- **Auto-scaling rules** - thresholds, sustain time (ignore one-second noise), cooldown, target tracking
- **Boot time** - a new server needs a few seconds, so sudden spikes can still drop requests
- **Connection draining** - a removed server finishes its current requests before shutting down
- **Elastic cost** - pay only for the servers you actually run, compared with a fixed fleet

## How the simulation works
One tick = one simulated second. Every tick:
1. Servers finish requests; booting servers get closer to ready; empty draining servers shut down.
2. New requests arrive (the traffic profile plus random noise).
3. The load balancer assigns each request to a server. If every server is full, the request is **dropped**.
4. The auto-scaler checks average utilisation:
   above the scale-out line for 2 ticks in a row, it launches servers; below the scale-in line for 4 ticks, it drains one.
5. Cost and chart history are recorded.

Latency rises steeply as a server fills up, and requests have mixed lengths (most short, some heavy).
That mix is why Least Connections balances better than Round Robin.

## Requirements
Node.js 18 or newer (`node --version`). Nothing else.

## Run it (VS Code terminal)
```
npm run install-all
npm run dev
```
Open **http://localhost:5174**

Optional single-port build:
```
npm run build
npm start
```
then open http://localhost:5002

## Experiments to try (and screenshot)
1. **Spike scaling.** Leave the default "Spike" traffic. Every 100 s the traffic jumps 4x for 30 s.
   Watch servers go from 2 up to about 10, a few requests drop while new servers boot, then servers drain back down.
2. **Round Robin vs Least Connections.** Choose "Steady", base traffic 18, set min and max servers both to 4.
   Note the *Load imbalance* value for each algorithm. Round Robin is usually around 20%, Least Connections around 4%.
3. **Overload.** Press "Send burst" several times. Dropped requests and latency rise, and the log explains why.
4. **Scaling rules.** Raise the scale-out threshold to 90% and see more drops. Lower it to 50% and see more servers and cost.
5. **Cost saving.** After a few minutes compare "Cost vs fixed fleet". Auto-scaling normally saves around 25-30%.

## Screenshots to submit
1. Full dashboard during a spike (servers at peak)
2. The charts showing scale out, then scale in
3. Round Robin and Least Connections imbalance side by side
4. The event log with scaling decisions
5. Your GitHub repository page

## REST API
| Method and path | Purpose |
|---|---|
| `GET /api/state` | everything: servers, metrics, cost, history, events |
| `POST /api/config` | change settings, e.g. `{"algorithm":"least_connections"}` |
| `POST /api/control` | `play`, `pause`, `reset`, `burst`, `add_server`, `remove_server` |
| `GET /api/health` | quick check |

## Tests
`npm test` runs 8 simulator checks (scaling stays inside min/max, servers never exceed capacity,
draining works, Least Connections is better balanced, cost is lower than a fixed fleet) and an API test.

## Common mistakes
- **Page says "Cannot reach the simulation server":** use `npm run dev` from the project root, not only the frontend.
- **Port in use:** another app uses 5002 or 5174. Set `PORT=5003` for the backend and update the proxy in `frontend/vite.config.js`.
- **Sliders feel delayed:** they apply when you let go, by design.

## Questions your teacher may ask
- *Why scale on average utilisation, not on one server?* It reflects the whole fleet and avoids reacting to one busy server.
- *Why a cooldown?* Without it the scaler keeps adding servers before the new ones have started helping.
- *Why do requests drop during a spike even with auto-scaling?* New servers need boot time; real clouds have the same delay.
- *Why is Least Connections better here?* It sees which servers are stuck with long requests; Round Robin does not.

## Limitations and future work
This is a simulation, not real cloud servers. History resets when the backend restarts.
Ideas: connect to a real cloud API, add request queues, add scheduled scaling, add server failures.
