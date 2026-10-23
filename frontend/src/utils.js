// Colour level for a utilisation percentage
export function level(pct) {
  if (pct >= 85) return "hot";
  if (pct >= 60) return "warm";
  return "cool";
}
export const money = (n) => `$${Number(n).toFixed(2)}`;
export const ALGO_LABEL = { round_robin: "Round Robin", least_connections: "Least Connections" };
