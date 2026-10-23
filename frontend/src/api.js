// All calls to the Express backend live here.
const BASE = import.meta.env.VITE_API_URL || "";

async function request(path, options) {
  const res = await fetch(BASE + path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const json = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const getState = () => request("/api/state");
export const postConfig = (partial) => request("/api/config", json(partial));
export const postControl = (action, extra = {}) => request("/api/control", json({ action, ...extra }));
