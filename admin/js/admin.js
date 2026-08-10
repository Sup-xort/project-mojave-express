const appEl = document.getElementById('app');
let adminKey = localStorage.getItem('me_admin_key') || '';

async function adminFetch(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok) {
    const err = new Error((data && data.message) || `요청 실패 (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderKeyPrompt() {
  appEl.innerHTML = `
    <h1>관리자 키 입력</h1>
    <div class="card">
      <label>ADMIN_KEY
        <input id="key-input" type="password" value="${esc(adminKey)}" />
      </label>
      <button id="key-save">저장</button>
    </div>
  `;
  document.getElementById('key-save').addEventListener('click', () => {
    adminKey = document.getElementById('key-input').value.trim();
    localStorage.setItem('me_admin_key', adminKey);
    renderDashboard();
  });
}

async function renderDashboard() {
  appEl.innerHTML = `
    <h1>모하비 익스프레스 — 관리자</h1>

    <h2>QR 발급</h2>
    <div class="card">
      <div class="row">
        <label>수량
          <input id="qr-amount" type="number" min="1" value="1" />
        </label>
        <button id="qr-issue">발급</button>
      </div>
      <div id="qr-result"></div>
    </div>

    <h2>대기 중인 교환 요청</h2>
    <div class="card">
      <button id="redemptions-refresh" class="secondary">새로고침</button>
      <table id="redemptions-table"><tbody></tbody></table>
    </div>

    <h2>리워드 관리</h2>
    <div class="card">
      <table id="rewards-table"><tbody></tbody></table>
      <h2 style="margin-top:16px">새 리워드</h2>
      <label>이름 <input id="rw-name" type="text" /></label>
      <div class="row">
        <label>필요 스탬프 <input id="rw-cost" type="number" min="1" value="10" /></label>
        <label>정렬 순서 <input id="rw-sort" type="number" value="0" /></label>
      </div>
      <div class="row">
        <label>시작 (HH:MM) <input id="rw-start" type="time" value="00:00" /></label>
        <label>종료 (HH:MM) <input id="rw-end" type="time" value="23:59" /></label>
      </div>
      <button id="rw-create">추가</button>
    </div>

    <h2>수동 스탬프 지급</h2>
    <div class="card">
      <label>별명 <input id="grant-nickname" type="text" /></label>
      <label>수량 <input id="grant-amount" type="number" min="1" value="1" /></label>
      <button id="grant-submit">지급</button>
      <div id="grant-result"></div>
    </div>

    <h2>&nbsp;</h2>
    <button id="key-reset" class="secondary">관리자 키 재설정</button>
  `;

  document.getElementById('key-reset').addEventListener('click', () => {
    localStorage.removeItem('me_admin_key');
    adminKey = '';
    renderKeyPrompt();
  });

  document.getElementById('qr-issue').addEventListener('click', issueQr);
  document.getElementById('redemptions-refresh').addEventListener('click', loadRedemptions);
  document.getElementById('rw-create').addEventListener('click', createReward);
  document.getElementById('grant-submit').addEventListener('click', grantStamp);

  await Promise.all([loadRedemptions(), loadRewards()]);
}

async function issueQr() {
  const amount = Number(document.getElementById('qr-amount').value);
  const resultEl = document.getElementById('qr-result');
  resultEl.innerHTML = '발급 중...';
  try {
    const issued = await adminFetch('/api/admin/qr', { method: 'POST', body: { amount } });
    renderQr(issued);
  } catch (err) {
    resultEl.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}

function renderQr(issued) {
  const resultEl = document.getElementById('qr-result');
  const render = () => {
    const remain = Math.max(0, issued.expiresAt - Math.floor(Date.now() / 1000));
    resultEl.innerHTML = `
      <div class="qr-box">
        <img src="${issued.qrDataUrl}" alt="QR 코드" />
        <div>남은 시간: ${remain}초 · ${issued.amount}개 적립</div>
        <div class="qr-url">${esc(issued.url)}</div>
        <button id="qr-reissue" class="secondary">다시 발급</button>
      </div>
    `;
    document.getElementById('qr-reissue').addEventListener('click', issueQr);
    if (remain <= 0) clearInterval(timer);
  };
  render();
  const timer = setInterval(render, 1000);
}

async function loadRedemptions() {
  const tbody = document.querySelector('#redemptions-table tbody');
  try {
    const list = await adminFetch('/api/admin/redemptions');
    tbody.innerHTML = list.length
      ? list
          .map(
            (r) => `
        <tr>
          <td>${esc(r.nickname)}</td>
          <td>${esc(r.rewardName)} (${r.rewardCost}개)</td>
          <td><button data-id="${r.id}" class="approve-btn">승인</button></td>
        </tr>
      `
          )
          .join('')
      : '<tr><td>대기 중인 요청이 없어요</td></tr>';
    tbody.querySelectorAll('.approve-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await adminFetch(`/api/admin/reward/${btn.dataset.id}/approve`, { method: 'POST' });
          await loadRedemptions();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td class="error">${esc(err.message)}</td></tr>`;
  }
}

async function loadRewards() {
  const tbody = document.querySelector('#rewards-table tbody');
  try {
    const list = await adminFetch('/api/admin/rewards');
    tbody.innerHTML = list
      .map(
        (r) => `
      <tr>
        <td>${esc(r.name)}</td>
        <td>${r.cost}개</td>
        <td>${esc(r.window)}</td>
        <td>${r.activeNow ? '운영 중' : '-'}</td>
      </tr>
    `
      )
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td class="error">${esc(err.message)}</td></tr>`;
  }
}

function timeToMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

async function createReward() {
  const name = document.getElementById('rw-name').value.trim();
  const cost = Number(document.getElementById('rw-cost').value);
  const sortOrder = Number(document.getElementById('rw-sort').value);
  const startMin = timeToMin(document.getElementById('rw-start').value);
  const endMin = timeToMin(document.getElementById('rw-end').value);
  if (!name) return alert('이름을 입력해주세요');
  try {
    await adminFetch('/api/admin/rewards', {
      method: 'POST',
      body: { name, cost, startMin, endMin, sortOrder, active: true },
    });
    document.getElementById('rw-name').value = '';
    await loadRewards();
  } catch (err) {
    alert(err.message);
  }
}

async function grantStamp() {
  const nickname = document.getElementById('grant-nickname').value.trim();
  const amount = Number(document.getElementById('grant-amount').value);
  const resultEl = document.getElementById('grant-result');
  try {
    const r = await adminFetch('/api/admin/stamp/grant', { method: 'POST', body: { nickname, amount } });
    resultEl.innerHTML = `<div>${esc(r.nickname)} 님 스탬프: ${r.stamps}개</div>`;
  } catch (err) {
    resultEl.innerHTML = `<div class="error">${esc(err.message)}</div>`;
  }
}

if (adminKey) {
  renderDashboard();
} else {
  renderKeyPrompt();
}
