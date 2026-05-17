const BASE = "";

let onUnauthorized = null;

function getApiKey() {
  return localStorage.getItem("apiKey") || "";
}

export function setApiKey(key) {
  localStorage.setItem("apiKey", key);
}

export function onAuthError(callback) {
  onUnauthorized = callback;
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": getApiKey(),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    localStorage.removeItem("apiKey");
    if (onUnauthorized) onUnauthorized();
    throw new Error("Invalid API key");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;
    if (detail && typeof detail === "object") {
      const err = new Error(detail.message || `HTTP ${res.status}`);
      err.validationErrors = detail.validation_errors || [];
      throw err;
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function validateKey(key) {
  const res = await fetch(`${BASE}/v1/agents/`, {
    headers: { "X-API-Key": key },
  });
  return res.ok;
}

export const api = {
  listAgents: (tag) => {
    const params = tag ? `?tag=${encodeURIComponent(tag)}` : "";
    return request(`/v1/agents/${params}`);
  },
  getAgent: (id) => request(`/v1/agents/${id}`),
  registerAgent: (base_url, tags = []) =>
    request("/v1/agents/", { method: "POST", body: JSON.stringify({ base_url, tags }) }),
  updateAgent: (id, data) =>
    request(`/v1/agents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteAgent: (id) => request(`/v1/agents/${id}`, { method: "DELETE" }),
  listTags: () => request("/v1/agents/tags/all"),

  listUsers: () => request("/v1/users/"),
  getUser: (id) => request(`/v1/users/${id}`),
  createUser: (username) =>
    request("/v1/users/", { method: "POST", body: JSON.stringify({ username }) }),
  updateUser: (id, data) =>
    request(`/v1/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/v1/users/${id}`, { method: "DELETE" }),
  assignAgents: (userId, agent_ids) =>
    request(`/v1/users/${userId}/agents`, {
      method: "POST",
      body: JSON.stringify({ agent_ids }),
    }),
  removeAgentAccess: (userId, agentId) =>
    request(`/v1/users/${userId}/agents/${agentId}`, { method: "DELETE" }),
  regenerateApiKey: (userId) =>
    request(`/v1/users/${userId}/regenerate-api-key`, { method: "POST" }),

  getStats: () => request("/v1/stats/"),
  getAgentStats: (id) => request(`/v1/stats/agents/${id}`),
};
