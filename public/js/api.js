async function apiFetch(path, opts = {}) {
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

const api = {
  me: () => apiFetch('/api/me'),
  signup: (nickname, pin) => apiFetch('/api/signup', { method: 'POST', body: { nickname, pin } }),
  login: (nickname, pin) => apiFetch('/api/login', { method: 'POST', body: { nickname, pin } }),
  logout: () => apiFetch('/api/logout', { method: 'POST' }),
  rewards: () => apiFetch('/api/rewards'),
  stamp: (token) => apiFetch('/api/stamp', { method: 'POST', body: { token } }),
  coupons: () => apiFetch('/api/coupons'),
  couponUse: (couponId, rewardId) =>
    apiFetch('/api/coupon/use', { method: 'POST', body: { couponId, rewardId } }),
  rewardStatus: () => apiFetch('/api/reward/status'),
  rewardCancel: () => apiFetch('/api/reward/cancel', { method: 'POST' }),
};
