// Run: node tests/test_api.js   (starts the real server on port 5059 at 5x speed)
const assert = require("assert");
const { spawn } = require("child_process");
const path = require("path");

const PORT = 5059, BASE = `http://localhost:${PORT}`;
const server = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
  env: { ...process.env, PORT: String(PORT), SIM_SEED: "7" }, stdio: "ignore",
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => (await fetch(BASE + p)).json();
const post = (p, body) => fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

(async () => {
  try {
    await sleep(1200);
    assert.strictEqual((await get("/api/health")).ok, true);

    let r = await post("/api/config", { speed: 5, algorithm: "least_connections" });
    assert.strictEqual(r.status, 200);
    await sleep(1500);
    let st = await get("/api/state");
    assert.strictEqual(st.config.algorithm, "least_connections");
    assert.ok(st.tick >= 3, "simulation is ticking");
    assert.ok(st.servers.length >= 2 && st.history.length >= 3);

    await post("/api/control", { action: "pause" });
    const t1 = (await get("/api/state")).tick;
    await sleep(700);
    assert.strictEqual((await get("/api/state")).tick, t1, "paused simulation must not advance");
    await post("/api/control", { action: "play" });

    r = await post("/api/control", { action: "burst", size: 500 });
    assert.strictEqual(r.status, 200);
    r = await post("/api/control", { action: "add_server" });
    assert.ok([200, 400].includes(r.status));

    r = await post("/api/control", { action: "explode" });
    assert.strictEqual(r.status, 400, "unknown action rejected");
    r = await post("/api/config", [1, 2]);
    assert.strictEqual(r.status, 400, "non-object config rejected");

    await post("/api/control", { action: "reset" });
    st = await get("/api/state");
    assert.ok(st.tick <= 2, "reset returns to the start");
    console.log("API tests passed.");
  } catch (e) {
    console.error("API test FAILED:", e.message);
    process.exitCode = 1;
  } finally {
    server.kill();
  }
})();
