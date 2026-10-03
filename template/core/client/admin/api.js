// Admin API client. The custom header is the CSRF guard: a cross-site form
// post can't set it, and a cross-site fetch that sets it gets a preflight the
// server never approves. The server rejects mutating admin calls without it.
async function request(method, url, body, { raw = false } = {}) {
  const headers = { 'x-sp-csrf': '1' };
  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  if (raw) return res;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status, details: data?.details });
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};
