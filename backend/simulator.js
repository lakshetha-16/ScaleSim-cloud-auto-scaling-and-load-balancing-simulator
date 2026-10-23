"use strict";
/**
 * simulator.js - the heart of the project: a tiny model of a cloud web service.
 *
 * One call to tick() = one simulated second. Every tick:
 *   1. Servers finish some requests; booting servers get closer to ready; empty draining servers shut down.
 *   2. New requests arrive (traffic profile + random noise + optional burst).
 *   3. The LOAD BALANCER sends each request to a server (round robin or least connections).
 *      If every server is full, the request is DROPPED (an error for the user).
 *   4. The AUTO-SCALER looks at average utilisation and adds or removes servers.
 *   5. Cost and history are recorded for the charts.
 *
 * The simulator knows nothing about HTTP or React, so it is easy to test.
 */

// Small seedable random generator, so tests give the same result every time.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALGORITHMS = ["round_robin", "least_connections"];
const PROFILES = ["steady", "wave", "spike", "manual"];
const SPEEDS = [1, 2, 5];

const DEFAULTS = {
  algorithm: "round_robin",
  trafficProfile: "spike",
  baseRps: 12,            // normal requests per second
  manualRps: 20,          // used only by the "manual" profile
  capacityPerServer: 20,  // how many requests one server can handle at the same time
  minServers: 2,
  maxServers: 10,
  scaleOutThreshold: 70,  // add servers when average utilisation is above this (%)
  scaleInThreshold: 30,   // remove servers when average utilisation is below this (%)
  scaleOutSustain: 2,     // ...for this many ticks in a row (avoids reacting to one-second noise)
  scaleInSustain: 4,
  cooldownTicks: 5,       // wait this long after a scaling action before the next one
  bootTicks: 3,           // a new server needs this long before it can take traffic
  costPerServerTick: 0.01,
  speed: 2,
};

const HISTORY_LIMIT = 120;
const EVENT_LIMIT = 60;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

class Simulator {
  constructor(seed = Date.now()) {
    this.seed = seed;
    this.config = { ...DEFAULTS };
    this.running = true;
    this.reset();
  }

  reset() {
    this.rng = mulberry32(this.seed);
    this.tickCount = 0;
    this.servers = [];
    this.nextId = 1;
    this.rrIndex = 0;
    this.servedTotal = 0;
    this.droppedTotal = 0;
    this.arrivalsTotal = 0;
    this.cost = 0;
    this.baselineCost = 0;
    this.pendingBurst = 0;
    this.outStreak = 0;
    this.inStreak = 0;
    this.cooldown = 0;
    this.lastDropEvent = -100;
    this.history = [];
    this.events = [];
    this.last = { rps: 0, avgUtil: 0, latency: 0, dropped: 0, imbalance: 0 };
    for (let i = 0; i < this.config.minServers; i++) this._addServer(true);
    this._log("info", `Simulation started with ${this.config.minServers} servers.`);
  }

  // ---------- configuration ----------
  setConfig(partial = {}) {
    const c = this.config;
    const num = (key, lo, hi) => {
      if (partial[key] !== undefined && Number.isFinite(Number(partial[key]))) {
        c[key] = clamp(Math.round(Number(partial[key])), lo, hi);
      }
    };
    if (ALGORITHMS.includes(partial.algorithm) && partial.algorithm !== c.algorithm) {
      c.algorithm = partial.algorithm;
      this._log("info", `Load balancing algorithm changed to ${partial.algorithm === "round_robin" ? "Round Robin" : "Least Connections"}.`);
    }
    if (PROFILES.includes(partial.trafficProfile) && partial.trafficProfile !== c.trafficProfile) {
      c.trafficProfile = partial.trafficProfile;
      this._log("info", `Traffic profile changed to ${partial.trafficProfile}.`);
    }
    if (SPEEDS.includes(Number(partial.speed))) c.speed = Number(partial.speed);
    num("baseRps", 1, 100);
    num("manualRps", 0, 200);
    num("capacityPerServer", 5, 100);
    num("minServers", 1, 20);
    num("maxServers", 1, 30);
    num("scaleOutThreshold", 40, 95);
    num("scaleInThreshold", 5, 60);
    num("scaleOutSustain", 1, 20);
    num("scaleInSustain", 1, 30);
    num("cooldownTicks", 0, 60);
    num("bootTicks", 0, 15);
    // keep the rules consistent
    if (c.maxServers < c.minServers) c.maxServers = c.minServers;
    if (c.scaleInThreshold > c.scaleOutThreshold - 10) c.scaleInThreshold = c.scaleOutThreshold - 10;
    return this.config;
  }

  // ---------- traffic ----------
  currentRps() {
    const { trafficProfile: p, baseRps: base, manualRps } = this.config;
    const t = this.tickCount;
    if (p === "steady") return base;
    if (p === "wave") return Math.max(0.2 * base, base * (1 + 0.8 * Math.sin((2 * Math.PI * t) / 80)));
    if (p === "spike") {
      const phase = t % 100; // every 100 s a "flash sale" lasts 30 s at 4x traffic
      return phase >= 25 && phase < 55 ? base * 4 : base;
    }
    return manualRps;
  }

  _gaussian() {
    const u = 1 - this.rng();
    const v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  _poisson(lambda) {
    if (lambda <= 0) return 0;
    if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * this._gaussian()));
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= this.rng(); } while (p > L);
    return k - 1;
  }

  // Most requests are quick (1-2 s) but some are heavy (4-8 s). This is why
  // "least connections" can beat "round robin": it notices servers stuck with heavy requests.
  _duration() {
    return this.rng() < 0.7 ? 1 + Math.floor(this.rng() * 2) : 4 + Math.floor(this.rng() * 5);
  }

  burst(size) {
    const n = clamp(Math.round(Number(size) || 0), 1, 1000);
    this.pendingBurst += n;
    this._log("warn", `Traffic burst: ${n} extra requests incoming.`);
  }

  // ---------- servers ----------
  _addServer(instant = false) {
    const boot = instant ? 0 : this.config.bootTicks;
    const s = { id: `srv-${this.nextId++}`, state: boot > 0 ? "booting" : "running", bootRemaining: boot, requests: [], served: 0 };
    this.servers.push(s);
    return s;
  }

  fleetSize() { return this.servers.filter((s) => s.state !== "draining").length; }
  _running() { return this.servers.filter((s) => s.state === "running"); }

  _drainLeastBusy() {
    const candidates = this._running();
    if (candidates.length === 0) return null;
    const s = candidates.reduce((a, b) => (b.requests.length < a.requests.length ? b : a));
    s.state = "draining"; // connection draining: no new requests, finish the ones in progress
    return s;
  }

  addServerManually() {
    if (this.fleetSize() >= this.config.maxServers) return { ok: false, message: `Already at the maximum of ${this.config.maxServers} servers.` };
    const s = this._addServer();
    this._log("out", `Manual: ${s.id} launched.`);
    return { ok: true, message: `${s.id} launched.` };
  }

  removeServerManually() {
    if (this.fleetSize() <= this.config.minServers) return { ok: false, message: `Cannot go below the minimum of ${this.config.minServers} servers.` };
    const s = this._drainLeastBusy();
    if (!s) return { ok: false, message: "No running server to remove." };
    this._log("in", `Manual: ${s.id} is draining.`);
    return { ok: true, message: `${s.id} is draining.` };
  }

  // ---------- load balancer ----------
  _pick() {
    const running = this._running();
    if (running.length === 0) return null;
    if (this.config.algorithm === "least_connections") {
      let best = null;
      for (const s of running) {
        if (s.requests.length >= this.config.capacityPerServer) continue;
        if (!best || s.requests.length < best.requests.length) best = s;
      }
      return best;
    }
    // round robin: take the servers in turn, skipping any that are full
    for (let i = 0; i < running.length; i++) {
      const idx = (this.rrIndex + i) % running.length;
      if (running[idx].requests.length < this.config.capacityPerServer) {
        this.rrIndex = idx + 1;
        return running[idx];
      }
    }
    return null;
  }

  // ---------- one second of simulated time ----------
  tick() {
    const cfg = this.config;
    this.tickCount += 1;

    // 1. progress servers
    for (const s of [...this.servers]) {
      if (s.state === "booting") {
        s.bootRemaining -= 1;
        if (s.bootRemaining <= 0) { s.state = "running"; this._log("ready", `${s.id} is ready and now receiving traffic.`); }
        continue;
      }
      const before = s.requests.length;
      s.requests = s.requests.map((r) => r - 1).filter((r) => r > 0);
      const done = before - s.requests.length;
      s.served += done;
      this.servedTotal += done;
      if (s.state === "draining" && s.requests.length === 0) {
        this.servers.splice(this.servers.indexOf(s), 1);
        this._log("in", `${s.id} finished its requests and was terminated.`);
      }
    }

    // 2 + 3. arrivals and load balancing
    const rps = this.currentRps();
    const arrivals = this._poisson(rps) + this.pendingBurst;
    this.pendingBurst = 0;
    let dropped = 0;
    for (let i = 0; i < arrivals; i++) {
      const target = this._pick();
      if (target) target.requests.push(this._duration());
      else dropped++;
    }
    this.arrivalsTotal += arrivals;
    this.droppedTotal += dropped;
    if (dropped > 0 && this.tickCount - this.lastDropEvent >= 8) {
      this.lastDropEvent = this.tickCount;
      this._log("drop", `${dropped} request(s) dropped: all running servers are at capacity.`);
    }

    // metrics
    const running = this._running();
    const utils = running.map((s) => s.requests.length / cfg.capacityPerServer);
    const avgUtil = utils.length ? (utils.reduce((a, b) => a + b, 0) / utils.length) * 100 : arrivals > 0 ? 100 : 0;
    const imbalance = utils.length > 1 ? (Math.max(...utils) - Math.min(...utils)) * 100 : 0;
    let weighted = 0, active = 0;
    for (const s of running) {
      const u = s.requests.length / cfg.capacityPerServer;
      weighted += s.requests.length * 60 * (1 + 5 * u ** 3); // latency climbs steeply as a server fills up
      active += s.requests.length;
    }
    const latency = active ? weighted / active : 60;

    // 4. auto-scaler
    this._autoscale(avgUtil);

    // 5. cost + history
    const billed = this.servers.length; // booting and draining servers are still billed
    this.cost += billed * cfg.costPerServerTick;
    this.baselineCost += cfg.maxServers * cfg.costPerServerTick; // "just run the maximum all the time"
    this.last = { rps: arrivals, avgUtil, latency, dropped, imbalance };
    this.history.push({
      t: this.tickCount, rps: arrivals, servers: running.length, billed,
      util: +avgUtil.toFixed(1), latency: Math.round(latency), dropped,
    });
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  _autoscale(avgUtil) {
    const cfg = this.config;
    if (this.cooldown > 0) this.cooldown -= 1;
    let fleet = this.fleetSize();

    // keep the fleet inside the min/max the user set
    if (fleet < cfg.minServers) {
      const n = cfg.minServers - fleet;
      for (let i = 0; i < n; i++) this._addServer();
      this._log("out", `Fleet below minimum: launched ${n} server(s).`);
      return;
    }
    if (fleet > cfg.maxServers) {
      const n = fleet - cfg.maxServers;
      for (let i = 0; i < n; i++) this._drainLeastBusy();
      this._log("in", `Fleet above maximum: draining ${n} server(s).`);
      return;
    }

    if (avgUtil > cfg.scaleOutThreshold) { this.outStreak += 1; this.inStreak = 0; }
    else if (avgUtil < cfg.scaleInThreshold) { this.inStreak += 1; this.outStreak = 0; }
    else { this.outStreak = 0; this.inStreak = 0; }

    if (this.cooldown > 0) return;

    if (this.outStreak >= cfg.scaleOutSustain && fleet < cfg.maxServers) {
      // "target tracking": aim for a utilisation 10 points below the threshold
      const target = cfg.scaleOutThreshold - 10;
      const desired = Math.ceil((fleet * avgUtil) / target);
      const add = clamp(desired - fleet, 1, Math.min(4, cfg.maxServers - fleet));
      for (let i = 0; i < add; i++) this._addServer();
      this._log("out", `Scale OUT: avg utilisation ${avgUtil.toFixed(0)}% > ${cfg.scaleOutThreshold}%  →  +${add} server(s) (${fleet} → ${fleet + add}).`);
      this.cooldown = cfg.cooldownTicks;
      this.outStreak = 0;
    } else if (this.inStreak >= cfg.scaleInSustain && fleet > cfg.minServers) {
      const s = this._drainLeastBusy();
      if (s) {
        this._log("in", `Scale IN: avg utilisation ${avgUtil.toFixed(0)}% < ${cfg.scaleInThreshold}%  →  draining ${s.id} (${fleet} → ${fleet - 1}).`);
        this.cooldown = cfg.cooldownTicks;
        this.inStreak = 0;
      }
    }
  }

  _log(type, message) {
    this.events.unshift({ t: this.tickCount, type, message });
    if (this.events.length > EVENT_LIMIT) this.events.pop();
  }

  // ---------- data for the API ----------
  snapshot() {
    const cfg = this.config;
    const servers = [...this.servers]
      .sort((a, b) => parseInt(a.id.slice(4), 10) - parseInt(b.id.slice(4), 10))
      .map((s) => ({
        id: s.id, state: s.state, active: s.requests.length, capacity: cfg.capacityPerServer,
        util: +((s.requests.length / cfg.capacityPerServer) * 100).toFixed(1),
        served: s.served, bootRemaining: s.bootRemaining,
      }));
    const saved = this.baselineCost > 0 ? ((this.baselineCost - this.cost) / this.baselineCost) * 100 : 0;
    return {
      tick: this.tickCount,
      running: this.running,
      config: { ...cfg },
      servers,
      counts: {
        running: servers.filter((s) => s.state === "running").length,
        booting: servers.filter((s) => s.state === "booting").length,
        draining: servers.filter((s) => s.state === "draining").length,
      },
      metrics: {
        rps: this.last.rps,
        avgUtil: +this.last.avgUtil.toFixed(1),
        latency: Math.round(this.last.latency),
        dropped: this.last.dropped,
        imbalance: +this.last.imbalance.toFixed(1),
        arrivalsTotal: this.arrivalsTotal,
        servedTotal: this.servedTotal,
        droppedTotal: this.droppedTotal,
        errorRate: this.arrivalsTotal ? +((this.droppedTotal / this.arrivalsTotal) * 100).toFixed(2) : 0,
        currentTargetRps: +this.currentRps().toFixed(1),
      },
      cost: {
        total: +this.cost.toFixed(2),
        fixedFleet: +this.baselineCost.toFixed(2),
        savedPercent: +saved.toFixed(1),
      },
      history: this.history,
      events: this.events,
    };
  }
}

module.exports = { Simulator, DEFAULTS, ALGORITHMS, PROFILES, SPEEDS };
