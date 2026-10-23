"use strict";
/**
 * server.js - Express API around the simulator.
 *
 * A timer calls sim.tick() once per simulated second (faster when speed is 2x or 5x).
 * React polls GET /api/state a few times per second and draws whatever it receives.
 * No database: everything lives in memory and resets when the server restarts.
 */
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { Simulator } = require("./simulator");

const PORT = Number(process.env.PORT) || 5002;
const SEED = process.env.SIM_SEED ? Number(process.env.SIM_SEED) : Date.now();
const sim = new Simulator(SEED);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true, tick: sim.tickCount, running: sim.running }));

app.get("/api/state", (_req, res) => res.json(sim.snapshot()));

// Change settings. Unknown keys are ignored and numbers are clamped to safe ranges.
app.post("/api/config", (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ ok: false, error: "Send a JSON object of settings." });
  }
  sim.setConfig(req.body);
  schedule(); // speed may have changed
  res.json({ ok: true, config: sim.config });
});

app.post("/api/control", (req, res) => {
  const { action, size } = req.body || {};
  switch (action) {
    case "play": sim.running = true; return res.json({ ok: true, message: "Simulation running." });
    case "pause": sim.running = false; return res.json({ ok: true, message: "Simulation paused." });
    case "reset": sim.reset(); return res.json({ ok: true, message: "Simulation reset." });
    case "burst": sim.burst(size || 150); return res.json({ ok: true, message: "Burst sent." });
    case "add_server": {
      const r = sim.addServerManually();
      return res.status(r.ok ? 200 : 400).json(r.ok ? r : { ok: false, error: r.message });
    }
    case "remove_server": {
      const r = sim.removeServerManually();
      return res.status(r.ok ? 200 : 400).json(r.ok ? r : { ok: false, error: r.message });
    }
    default:
      return res.status(400).json({ ok: false, error: "Unknown action." });
  }
});

// After `npm run build`, this same server also serves the React app (one port).
const dist = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(dist)) app.use(express.static(dist));

// setTimeout (not setInterval) so the delay can change when the speed changes
let timer = null;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (sim.running) sim.tick();
    schedule();
  }, 1000 / sim.config.speed);
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ScaleSim API running on http://localhost:${PORT}`);
    schedule();
  });
}

module.exports = { app, sim };
