import { level, money } from "../utils.js";

function Kpi({ label, value, sub, tone }) {
  return (
    <div className={`glass kpi ${tone || ""}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

export default function KpiRow({ state }) {
  const { counts, metrics, cost } = state;
  return (
    <section className="kpis">
      <Kpi label="Active servers" value={counts.running} tone="violet"
        sub={`${counts.booting} booting · ${counts.draining} draining`} />
      <Kpi label="Traffic" value={`${metrics.rps} req/s`} tone="sky"
        sub={`target ${metrics.currentTargetRps} req/s`} />
      <Kpi label="Avg utilisation" value={`${metrics.avgUtil}%`} tone={level(metrics.avgUtil)}
        sub={`imbalance ${metrics.imbalance}%`} />
      <Kpi label="Avg latency" value={`${metrics.latency} ms`} tone={metrics.latency > 200 ? "hot" : "cool"}
        sub="grows as servers fill up" />
      <Kpi label="Dropped requests" value={metrics.droppedTotal} tone={metrics.droppedTotal ? "hot" : "cool"}
        sub={`${metrics.errorRate}% error rate`} />
      <Kpi label="Cost vs fixed fleet" value={money(cost.total)} tone="teal"
        sub={`fixed ${money(cost.fixedFleet)} · saved ${cost.savedPercent}%`} />
    </section>
  );
}
