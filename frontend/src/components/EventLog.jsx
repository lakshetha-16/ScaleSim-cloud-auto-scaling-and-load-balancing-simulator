const ICON = { out: "▲", in: "▼", ready: "●", warn: "⚡", drop: "✖", info: "ℹ" };

export default function EventLog({ events }) {
  return (
    <section className="glass events">
      <h2>Event log</h2>
      <ul>
        {events.slice(0, 25).map((e, i) => (
          <li key={`${e.t}-${i}`} className={`ev ${e.type}`}>
            <span className="ev-icon">{ICON[e.type] || "•"}</span>
            <span className="ev-time">{e.t}s</span>
            <span className="ev-msg">{e.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
