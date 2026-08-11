async function ownerFetch(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (!res.ok) {
    const err = new Error((data && data.message) || '잠시 후 다시 시도해주세요');
    err.code = data && data.error;
    err.status = res.status;
    err.extra = data;
    throw err;
  }
  return data;
}

const ownerApi = {
  setupStatus: () => ownerFetch('/api/owner/setup-status'),
  setup: (username, password) =>
    ownerFetch('/api/owner/setup', { method: 'POST', body: { username, password } }),
  login: (username, password) =>
    ownerFetch('/api/owner/login', { method: 'POST', body: { username, password } }),
  logout: () => ownerFetch('/api/owner/logout', { method: 'POST' }),
  me: () => ownerFetch('/api/owner/me'),
  changePassword: (currentPassword, newPassword) =>
    ownerFetch('/api/owner/password', { method: 'POST', body: { currentPassword, newPassword } }),

  dashboard: () => ownerFetch('/api/owner/dashboard'),

  issueQr: (amount) => ownerFetch('/api/owner/qr', { method: 'POST', body: { amount } }),

  rewards: () => ownerFetch('/api/owner/rewards'),
  createReward: (reward) => ownerFetch('/api/owner/rewards', { method: 'POST', body: reward }),
  updateReward: (id, reward) =>
    ownerFetch(`/api/owner/rewards/${id}`, { method: 'PUT', body: reward }),

  redemptions: () => ownerFetch('/api/owner/redemptions'),
  approveRedemption: (id) => ownerFetch(`/api/owner/reward/${id}/approve`, { method: 'POST' }),

  grantStamp: (nickname, amount) =>
    ownerFetch('/api/owner/stamp/grant', { method: 'POST', body: { nickname, amount } }),

  searchCustomers: (query) =>
    ownerFetch(`/api/owner/customers?query=${encodeURIComponent(query)}`),
  getCustomer: (id) => ownerFetch(`/api/owner/customers/${encodeURIComponent(id)}`),
};
