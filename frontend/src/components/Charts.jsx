import {
  ResponsiveContainer, ComposedChart, LineChart, Area, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";

const axis = { fontSize: 11, fill: "#c7d2fe" };
const grid = "rgba(255,255,255,0.09)";
const tip = {
  contentStyle: { background: "rgba(15,23,42,.92)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, color: "#eef2ff" },
  labelFormatter: (t) => `t = ${t}s`,
};

export default function Charts({ state }) {
  const { history, config } = state;
  return (
    <section className="charts">
      <div className="glass chart-card">
        <h3>Traffic and servers</h3>
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={history} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <defs>
              <linearGradient id="rpsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={axis} minTickGap={28} />
            <YAxis yAxisId="l" tick={axis} />
            <YAxis yAxisId="r" orientation="right" tick={axis} allowDecimals={false} domain={[0, config.maxServers + 1]} />
            <Tooltip {...tip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area yAxisId="l" type="monotone" dataKey="rps" name="Requests/s" stroke="#38bdf8" fill="url(#rpsFill)" isAnimationActive={false} />
            <Line yAxisId="r" type="stepAfter" dataKey="servers" name="Running servers" stroke="#2dd4bf" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="glass chart-card">
        <h3>Average utilisation and scaling thresholds</h3>
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={history} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={axis} minTickGap={28} />
            <YAxis tick={axis} domain={[0, 100]} unit="%" />
            <Tooltip {...tip} />
            <ReferenceLine y={config.scaleOutThreshold} stroke="#fb7185" strokeDasharray="5 4" label={{ value: "scale out", fill: "#fb7185", fontSize: 11, position: "insideTopRight" }} />
            <ReferenceLine y={config.scaleInThreshold} stroke="#fbbf24" strokeDasharray="5 4" label={{ value: "scale in", fill: "#fbbf24", fontSize: 11, position: "insideBottomRight" }} />
            <Line type="monotone" dataKey="util" name="Avg utilisation %" stroke="#a78bfa" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="glass chart-card">
        <h3>Latency and dropped requests</h3>
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={history} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={axis} minTickGap={28} />
            <YAxis yAxisId="l" tick={axis} allowDecimals={false} />
            <YAxis yAxisId="r" orientation="right" tick={axis} unit="ms" />
            <Tooltip {...tip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="l" dataKey="dropped" name="Dropped" fill="#fb7185" isAnimationActive={false} />
            <Line yAxisId="r" type="monotone" dataKey="latency" name="Latency (ms)" stroke="#fbbf24" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
