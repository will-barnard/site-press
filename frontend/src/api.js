async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'x-sp-csrf': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}
export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b || {}),
  del: (u) => request('DELETE', u),
};
