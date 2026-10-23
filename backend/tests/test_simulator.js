// Run: node tests/test_simulator.js   (no server needed)
const assert = require("assert");
const { Simulator } = require("../simulator");

function run(sim, ticks, each) { for (let i = 0; i < ticks; i++) { sim.tick(); if (each) each(sim); } }

// 1. settings are clamped and kept consistent
{
  const s = new Simulator(1);
  s.setConfig({ capacityPerServer: 9999, minServers: 5, maxServers: 2, scaleOutThreshold: 60, scaleInThreshold: 59, speed: 3, algorithm: "nonsense" });
  assert.strictEqual(s.config.capacityPerServer, 100);
  assert.ok(s.config.maxServers >= s.config.minServers, "max must not be below min");
  assert.ok(s.config.scaleInThreshold <= s.config.scaleOutThreshold - 10, "thresholds need a gap");
  assert.notStrictEqual(s.config.speed, 3, "invalid speed ignored");
  assert.strictEqual(s.config.algorithm, "round_robin", "invalid algorithm ignored");
}

// 2. light steady traffic: stays at the minimum, no drops
{
  const s = new Simulator(2);
  s.setConfig({ trafficProfile: "steady", baseRps: 4 });
  run(s, 120);
  const snap = s.snapshot();
  assert.strictEqual(snap.counts.running, s.config.minServers);
  assert.strictEqual(snap.metrics.droppedTotal, 0);
}

// 3. a spike scales out, then scales back in; fleet always inside [min, max]; no server over capacity
{
  const s = new Simulator(3);
  let peak = 0;
  run(s, 300, (sim) => {
    const fleet = sim.fleetSize();
    assert.ok(fleet >= sim.config.minServers && fleet <= sim.config.maxServers, `fleet ${fleet} out of bounds`);
    for (const srv of sim.servers) assert.ok(srv.requests.length <= sim.config.capacityPerServer, "server over capacity");
    peak = Math.max(peak, sim.snapshot().counts.running);
  });
  const ev = s.snapshot().events.map((e) => e.type);
  assert.ok(peak > s.config.minServers + 2, "spike should add servers (peak " + peak + ")");
  assert.ok(ev.includes("out") && ev.includes("in"), "both scale out and scale in must happen");
  assert.ok(s.snapshot().cost.savedPercent > 0, "autoscaling must be cheaper than a fixed max fleet");
}

// 4. burst beyond capacity causes drops
{
  const s = new Simulator(4);
  s.setConfig({ trafficProfile: "steady", baseRps: 2 });
  run(s, 5);
  s.burst(1000);
  run(s, 1);
  assert.ok(s.snapshot().metrics.droppedTotal > 0, "1000 requests cannot fit in 2 servers");
}

// 5. draining servers get no new requests and disappear when empty
{
  const s = new Simulator(5);
  s.setConfig({ trafficProfile: "steady", baseRps: 8, minServers: 1, maxServers: 5 });
  s.addServerManually(); s.addServerManually();
  run(s, 6);
  assert.ok(s.removeServerManually().ok);
  const draining = s.servers.find((x) => x.state === "draining");
  assert.ok(draining, "one server draining");
  const before = draining.requests.length;
  run(s, 1);
  assert.ok(draining.requests.length <= before, "draining server receives nothing new");
  run(s, 15);
  assert.ok(!s.servers.includes(draining), "drained server is removed");
}

// 6. manual limits
{
  const s = new Simulator(6);
  s.setConfig({ minServers: 2, maxServers: 3 });
  assert.ok(s.addServerManually().ok);
  assert.ok(!s.addServerManually().ok, "cannot exceed max");
  s.removeServerManually();
  assert.ok(!s.removeServerManually().ok, "cannot go below min");
}

// 7. least connections balances load better than round robin (average over several seeds)
{
  function avgImbalance(algorithm, seed) {
    const s = new Simulator(seed);
    s.setConfig({ algorithm, trafficProfile: "steady", baseRps: 18, minServers: 4, maxServers: 4 });
    let total = 0;
    run(s, 400, (sim) => { total += sim.last.imbalance; });
    return total / 400;
  }
  let rr = 0, lc = 0;
  for (const seed of [11, 12, 13, 14, 15]) { rr += avgImbalance("round_robin", seed); lc += avgImbalance("least_connections", seed); }
  console.log(`   avg load imbalance  round robin: ${(rr / 5).toFixed(1)}%   least connections: ${(lc / 5).toFixed(1)}%`);
  assert.ok(lc < rr, "least connections should be more balanced");
}

// 8. reset really resets
{
  const s = new Simulator(8);
  run(s, 50);
  s.reset();
  const snap = s.snapshot();
  assert.strictEqual(snap.tick, 0);
  assert.strictEqual(snap.metrics.droppedTotal, 0);
  assert.strictEqual(snap.servers.length, s.config.minServers);
}
console.log("Simulator tests passed.");
