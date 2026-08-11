const appEl = document.getElementById('app');

const TABS = [
  { id: 'dashboard', label: '대시보드' },
  { id: 'qr', label: 'QR 발급' },
  { id: 'rewards', label: '리워드 관리' },
  { id: 'redemptions', label: '교환 승인' },
  { id: 'grant', label: '스탬프 지급' },
  { id: 'customers', label: '고객 조회' },
  { id: 'settings', label: '설정' },
];

let activeTab = 'dashboard';
let currentUsername = '';
let qrTimer = null; // QR 화면을 벗어나도 살아있는 setInterval이 detached DOM을 건드리지 않도록 매번 정리한다.

function clearAppState() {
  clearInterval(qrTimer);
}

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function fmtTime(unixSec) {
  if (!unixSec) return '-';
  return new Date(unixSec * 1000).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isNight() {
  return localStorage.getItem('owner_night') === '1';
}

function applyNight() {
  document.body.classList.toggle('night', isNight());
}

function toggleNight() {
  localStorage.setItem('owner_night', isNight() ? '0' : '1');
  applyNight();
}

function logoSvg(size) {
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="18" fill="none" style="stroke:var(--ink)" stroke-width="1.4"></circle>
      <circle cx="20" cy="20" r="3.5" style="fill:var(--accent)"></circle>
    </svg>`;
}

function bindEnter(el, fn) {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fn();
  });
}

// ---------- 부트스트랩 ----------

async function boot() {
  applyNight();
  let status;
  try {
    status = await ownerApi.setupStatus();
  } catch (err) {
    renderFatal(err);
    return;
  }

  if (!status.hasOwner) {
    renderSetup();
    return;
  }

  try {
    const me = await ownerApi.me();
    currentUsername = me.username;
    renderShell();
  } catch (err) {
    renderLogin();
  }
}

function renderFatal(err) {
  clearAppState();
  appEl.innerHTML = `
    <div class="auth-screen"><div class="auth-main">
      <div class="brand-mark">${logoSvg(56)}</div>
      <div class="auth-sub">${esc(err.message || '연결에 실패했어요')}</div>
    </div></div>
  `;
}

// ---------- 최초 계정 설정 ----------

function renderSetup() {
  clearAppState();
  appEl.innerHTML = `
    <div class="auth-screen"><div class="auth-main">
      <div class="brand-mark">${logoSvg(72)}</div>
      <div>
        <div class="kicker">MOJAVE EXPRESS</div>
        <div class="auth-title">사장님 계정 만들기</div>
        <div class="auth-sub">이 화면은 처음 한 번만 나타나요</div>
      </div>
      <div class="field-group">
        <div class="field">
          <label>아이디</label>
          <input id="su-username" type="text" placeholder="영문/숫자 3~20자" autocomplete="username" />
        </div>
        <div class="field">
          <label>비밀번호</label>
          <input id="su-password" type="password" placeholder="8자 이상" autocomplete="new-password" />
        </div>
        <div class="field">
          <label>비밀번호 확인</label>
          <input id="su-password2" type="password" placeholder="다시 입력" autocomplete="new-password" />
        </div>
        <div id="su-error"></div>
      </div>
    </div>
    <div class="auth-actions">
      <button id="su-submit" class="btn-primary">시작하기</button>
    </div></div>
  `;

  const submit = async () => {
    const username = document.getElementById('su-username').value.trim();
    const password = document.getElementById('su-password').value;
    const password2 = document.getElementById('su-password2').value;
    const errorEl = document.getElementById('su-error');
    errorEl.innerHTML = '';

    if (password !== password2) {
      errorEl.innerHTML = `<div class="error-text">비밀번호가 서로 달라요</div>`;
      return;
    }

    try {
      await ownerApi.setup(username, password);
      currentUsername = username;
      renderShell();
    } catch (err) {
      errorEl.innerHTML = `<div class="error-text">${esc(err.message)}</div>`;
    }
  };

  document.getElementById('su-submit').addEventListener('click', submit);
  bindEnter(document.getElementById('su-password2'), submit);
}

// ---------- 로그인 ----------

function renderLogin() {
  clearAppState();
  appEl.innerHTML = `
    <div class="auth-screen"><div class="auth-main">
      <div class="brand-mark">${logoSvg(72)}</div>
      <div>
        <div class="kicker">MOJAVE EXPRESS</div>
        <div class="auth-title" style="text-align:center;">로그인</div>
      </div>
      <div class="field-group">
        <div class="field">
          <label>아이디</label>
          <input id="li-username" type="text" autocomplete="username" />
        </div>
        <div class="field">
          <label>비밀번호</label>
          <input id="li-password" type="password" autocomplete="current-password" />
        </div>
        <div id="li-error"></div>
      </div>
    </div>
    <div class="auth-actions">
      <button id="li-submit" class="btn-primary">로그인</button>
    </div></div>
  `;

  const submit = async () => {
    const username = document.getElementById('li-username').value.trim();
    const password = document.getElementById('li-password').value;
    const errorEl = document.getElementById('li-error');
    errorEl.innerHTML = '';
    try {
      const me = await ownerApi.login(username, password);
      currentUsername = me.username;
      renderShell();
    } catch (err) {
      errorEl.innerHTML = `<div class="error-text">${esc(err.message)}</div>`;
    }
  };

  document.getElementById('li-submit').addEventListener('click', submit);
  bindEnter(document.getElementById('li-password'), submit);
}

// ---------- 대시보드 셸 ----------

function renderShell() {
  clearAppState();
  appEl.innerHTML = `
    <div class="shell-header">
      <div class="shell-brand">${logoSvg(18)}<span>MOJAVE EXPRESS · 사장님</span></div>
      <div class="shell-actions">
        <button id="night-toggle" class="icon-btn" aria-label="화면 밝기 전환">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="stroke:var(--ink)" stroke-width="1.4"><circle cx="12" cy="12" r="5"></circle><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"></path></svg>
        </button>
      </div>
    </div>
    <div class="tabs">
      ${TABS.map(
        (t) => `<button class="tab-btn${t.id === activeTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`
      ).join('')}
    </div>
    <div class="content" id="content"></div>
  `;

  document.getElementById('night-toggle').addEventListener('click', toggleNight);
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderTab();
    });
  });

  renderTab();
}

function renderTab() {
  clearInterval(qrTimer);
  const content = document.getElementById('content');
  content.innerHTML = '';
  if (activeTab === 'dashboard') return renderDashboardTab(content);
  if (activeTab === 'qr') return renderQrTab(content);
  if (activeTab === 'rewards') return renderRewardsTab(content);
  if (activeTab === 'redemptions') return renderRedemptionsTab(content);
  if (activeTab === 'grant') return renderGrantTab(content);
  if (activeTab === 'customers') return renderCustomersTab(content);
  if (activeTab === 'settings') return renderSettingsTab(content);
}

// ---------- 대시보드 ----------

async function renderDashboardTab(content) {
  content.innerHTML = `<h1>대시보드</h1><div class="stat-grid" id="stat-grid"><div class="empty-msg">불러오는 중...</div></div>`;
  try {
    const d = await ownerApi.dashboard();
    document.getElementById('stat-grid').outerHTML = `
      <div class="stat-grid">
        <div class="stat-tile"><span class="stat-label">오늘 적립</span><span class="stat-value">${d.todayStamps}</span></div>
        <div class="stat-tile"><span class="stat-label">대기 중 교환</span><span class="stat-value">${d.pendingRedemptions}</span></div>
        <div class="stat-tile"><span class="stat-label">전체 고객</span><span class="stat-value">${d.customerCount}</span></div>
        <div class="stat-tile"><span class="stat-label">오늘 승인된 교환</span><span class="stat-value">${d.todayApprovedRedemptions}</span></div>
      </div>
    `;
  } catch (err) {
    content.innerHTML += `<div class="error-text">${esc(err.message)}</div>`;
  }
}

// ---------- QR 발급 ----------

function renderQrTab(content) {
  content.innerHTML = `
    <h1>QR 발급</h1>
    <div class="card">
      <div class="row">
        <div class="field-inline"><label>수량</label><input id="qr-amount" type="number" min="1" value="1" /></div>
        <button id="qr-issue" class="btn-secondary">발급</button>
      </div>
      <div id="qr-result"></div>
    </div>
  `;
  document.getElementById('qr-issue').addEventListener('click', issueQr);
}

async function issueQr() {
  const amount = Number(document.getElementById('qr-amount').value);
  const resultEl = document.getElementById('qr-result');
  resultEl.innerHTML = '<div class="empty-msg">발급 중...</div>';
  try {
    const issued = await ownerApi.issueQr(amount);
    renderQr(issued);
  } catch (err) {
    resultEl.innerHTML = `<div class="error-text">${esc(err.message)}</div>`;
  }
}

function renderQr(issued) {
  const resultEl = document.getElementById('qr-result');
  clearInterval(qrTimer);
  const render = () => {
    const remain = Math.max(0, issued.expiresAt - Math.floor(Date.now() / 1000));
    resultEl.innerHTML = `
      <div class="qr-box">
        <img src="${issued.qrDataUrl}" alt="QR 코드" />
        <div class="qr-meta">남은 시간 ${remain}초 · ${issued.amount}개 적립</div>
        <div class="qr-url">${esc(issued.url)}</div>
        <button id="qr-reissue" class="btn-small" style="margin-top:12px;">다시 발급</button>
      </div>
    `;
    document.getElementById('qr-reissue').addEventListener('click', issueQr);
    if (remain <= 0) clearInterval(qrTimer);
  };
  render();
  qrTimer = setInterval(render, 1000);
}

// ---------- 리워드 관리 ----------

function minToHHMM(min) {
  const h = Math.floor(min / 60).toString().padStart(2, '0');
  const m = (min % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function hhmmToMin(s) {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + m;
}

async function renderRewardsTab(content) {
  content.innerHTML = `
    <h1>리워드 관리</h1>
    <div class="card">
      <table class="data-table" id="rewards-table">
        <thead><tr><th>이름</th><th>필요 스탬프</th><th>시간대</th><th>활성</th><th></th></tr></thead>
        <tbody><tr><td colspan="5" class="empty-msg">불러오는 중...</td></tr></tbody>
      </table>
    </div>
    <div class="card">
      <div class="section-title">새 리워드</div>
      <div class="row">
        <div class="field-inline"><label>이름</label><input id="rw-name" type="text" /></div>
        <div class="field-inline"><label>필요 스탬프</label><input id="rw-cost" type="number" min="1" value="10" /></div>
        <div class="field-inline"><label>정렬 순서</label><input id="rw-sort" type="number" value="0" /></div>
      </div>
      <div class="row" style="margin-top:16px;">
        <div class="field-inline"><label>시작</label><input id="rw-start" type="time" value="00:00" /></div>
        <div class="field-inline"><label>종료</label><input id="rw-end" type="time" value="23:59" /></div>
        <button id="rw-create" class="btn-secondary">추가</button>
      </div>
    </div>
  `;
  document.getElementById('rw-create').addEventListener('click', createReward);
  await loadRewards();
}

async function loadRewards() {
  const table = document.getElementById('rewards-table');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  try {
    const list = await ownerApi.rewards();
    tbody.innerHTML = list.length
      ? list
          .map(
            (r) => `
        <tr>
          <td>${esc(r.name)}</td>
          <td>${r.cost}</td>
          <td>${esc(r.window)}</td>
          <td><span class="tag${r.activeNow ? ' pending' : ''}">${r.activeNow ? '지금 활성' : '비활성'}</span></td>
          <td><button class="btn-small" data-toggle="${r.id}">${r.activeNow ? '끄기' : '켜기'}</button></td>
        </tr>`
          )
          .join('')
      : `<tr><td colspan="5" class="empty-msg">등록된 리워드가 없어요</td></tr>`;

    tbody.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.toggle);
        const rewards = await ownerApi.rewards();
        const target = rewards.find((r) => r.id === id);
        if (!target) return;
        await ownerApi.updateReward(id, { active: !target.activeNow ? 1 : 0 });
        loadRewards();
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="error-text">${esc(err.message)}</td></tr>`;
  }
}

async function createReward() {
  const name = document.getElementById('rw-name').value.trim();
  const cost = Number(document.getElementById('rw-cost').value);
  const sortOrder = Number(document.getElementById('rw-sort').value);
  const startMin = hhmmToMin(document.getElementById('rw-start').value);
  const endMin = hhmmToMin(document.getElementById('rw-end').value);
  try {
    await ownerApi.createReward({ name, cost, startMin, endMin, sortOrder, active: 1 });
    document.getElementById('rw-name').value = '';
    loadRewards();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- 교환 승인 ----------

async function renderRedemptionsTab(content) {
  content.innerHTML = `
    <h1>교환 승인</h1>
    <div class="card">
      <div style="text-align:right;margin-bottom:12px;"><button id="rd-refresh" class="btn-small">새로고침</button></div>
      <table class="data-table" id="redemptions-table">
        <thead><tr><th>별명</th><th>리워드</th><th>필요 스탬프</th><th>요청 시각</th><th></th></tr></thead>
        <tbody><tr><td colspan="5" class="empty-msg">불러오는 중...</td></tr></tbody>
      </table>
    </div>
  `;
  document.getElementById('rd-refresh').addEventListener('click', loadRedemptions);
  await loadRedemptions();
}

async function loadRedemptions() {
  const table = document.getElementById('redemptions-table');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  try {
    const list = await ownerApi.redemptions();
    tbody.innerHTML = list.length
      ? list
          .map(
            (r) => `
        <tr>
          <td>${esc(r.nickname)}</td>
          <td>${esc(r.rewardName)}</td>
          <td>${r.rewardCost}</td>
          <td>${fmtTime(r.requestedAt)}</td>
          <td><button class="btn-small" data-approve="${r.id}">승인</button></td>
        </tr>`
          )
          .join('')
      : `<tr><td colspan="5" class="empty-msg">대기 중인 교환 요청이 없어요</td></tr>`;

    tbody.querySelectorAll('[data-approve]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await ownerApi.approveRedemption(Number(btn.dataset.approve));
        } catch (err) {
          alert(err.message);
        }
        loadRedemptions();
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="error-text">${esc(err.message)}</td></tr>`;
  }
}

// ---------- 수동 스탬프 지급 ----------

function renderGrantTab(content) {
  content.innerHTML = `
    <h1>스탬프 지급</h1>
    <div class="card">
      <div class="row">
        <div class="field-inline"><label>별명</label><input id="grant-nickname" type="text" maxlength="12" /></div>
        <div class="field-inline"><label>수량</label><input id="grant-amount" type="number" min="1" value="1" /></div>
        <button id="grant-submit" class="btn-secondary">지급</button>
      </div>
      <div id="grant-result"></div>
    </div>
  `;
  document.getElementById('grant-submit').addEventListener('click', async () => {
    const nickname = document.getElementById('grant-nickname').value.trim();
    const amount = Number(document.getElementById('grant-amount').value);
    const resultEl = document.getElementById('grant-result');
    resultEl.innerHTML = '';
    try {
      const r = await ownerApi.grantStamp(nickname, amount);
      resultEl.innerHTML = `<div class="success-text">${esc(r.nickname)}님에게 ${amount}개 지급 완료 (보유 ${r.stamps}개)</div>`;
      document.getElementById('grant-nickname').value = '';
    } catch (err) {
      resultEl.innerHTML = `<div class="error-text">${esc(err.message)}</div>`;
    }
  });
}

// ---------- 고객 조회 ----------

function renderCustomersTab(content) {
  content.innerHTML = `
    <h1>고객 조회</h1>
    <div class="card">
      <div class="row">
        <div class="field-inline"><label>별명 검색</label><input id="cs-query" type="text" placeholder="별명을 입력하세요" /></div>
        <button id="cs-search" class="btn-secondary">검색</button>
      </div>
      <div class="customer-list" id="cs-list" style="margin-top:16px;"></div>
    </div>
    <div id="cs-detail"></div>
  `;
  const search = async () => {
    const query = document.getElementById('cs-query').value.trim();
    const listEl = document.getElementById('cs-list');
    document.getElementById('cs-detail').innerHTML = '';
    if (!query) {
      listEl.innerHTML = '';
      return;
    }
    listEl.innerHTML = `<div class="empty-msg">검색 중...</div>`;
    try {
      const results = await ownerApi.searchCustomers(query);
      listEl.innerHTML = results.length
        ? results
            .map(
              (c) => `
          <button class="customer-row" data-id="${esc(c.id)}">
            <span class="cr-name">${esc(c.nickname)} <span class="cr-meta">#${esc(c.cardNo)}</span></span>
            <span class="cr-meta">${c.stamps}개</span>
          </button>`
            )
            .join('')
        : `<div class="empty-msg">일치하는 고객이 없어요</div>`;

      listEl.querySelectorAll('[data-id]').forEach((btn) => {
        btn.addEventListener('click', () => loadCustomerDetail(btn.dataset.id));
      });
    } catch (err) {
      listEl.innerHTML = `<div class="error-text">${esc(err.message)}</div>`;
    }
  };
  document.getElementById('cs-search').addEventListener('click', search);
  bindEnter(document.getElementById('cs-query'), search);
}

async function loadCustomerDetail(id) {
  const detailEl = document.getElementById('cs-detail');
  detailEl.innerHTML = `<div class="empty-msg">불러오는 중...</div>`;
  try {
    const c = await ownerApi.getCustomer(id);
    detailEl.innerHTML = `
      <div class="card detail-panel">
        <div class="detail-head">
          <span class="dh-name">${esc(c.nickname)} <span class="cr-meta">#${esc(c.cardNo)}</span></span>
          <span class="dh-stamps">${c.stamps}개</span>
        </div>
        <div class="section-title">최근 적립 내역</div>
        <table class="data-table">
          <tbody>
            ${
              c.stampLog.length
                ? c.stampLog.map((s) => `<tr><td>${fmtTime(s.createdAt)}</td><td>+${s.amount}</td></tr>`).join('')
                : `<tr><td class="empty-msg">적립 내역이 없어요</td></tr>`
            }
          </tbody>
        </table>
        <div class="section-title" style="margin-top:20px;">최근 교환 내역</div>
        <table class="data-table">
          <tbody>
            ${
              c.redemptions.length
                ? c.redemptions
                    .map(
                      (r) =>
                        `<tr><td>${fmtTime(r.requestedAt)}</td><td>${esc(r.rewardName)}</td><td>${esc(r.status)}</td></tr>`
                    )
                    .join('')
                : `<tr><td class="empty-msg">교환 내역이 없어요</td></tr>`
            }
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    detailEl.innerHTML = `<div class="error-text">${esc(err.message)}</div>`;
  }
}

// ---------- 설정 ----------

function renderSettingsTab(content) {
  content.innerHTML = `
    <h1>설정</h1>
    <div class="card">
      <div class="section-title">로그인 계정</div>
      <div style="margin-bottom:20px;">${esc(currentUsername)}</div>
      <div class="section-title">비밀번호 변경</div>
      <div class="row">
        <div class="field-inline"><label>현재 비밀번호</label><input id="pw-current" type="password" /></div>
        <div class="field-inline"><label>새 비밀번호</label><input id="pw-new" type="password" /></div>
        <button id="pw-submit" class="btn-secondary">변경</button>
      </div>
      <div id="pw-result"></div>
    </div>
    <div class="card">
      <button id="logout-btn" class="btn-secondary">로그아웃</button>
    </div>
  `;

  document.getElementById('pw-submit').addEventListener('click', async () => {
    const current = document.getElementById('pw-current').value;
    const next = document.getElementById('pw-new').value;
    const resultEl = document.getElementById('pw-result');
    resultEl.innerHTML = '';
    try {
      await ownerApi.changePassword(current, next);
      resultEl.innerHTML = `<div class="success-text">비밀번호가 변경됐어요</div>`;
      document.getElementById('pw-current').value = '';
      document.getElementById('pw-new').value = '';
    } catch (err) {
      resultEl.innerHTML = `<div class="error-text">${esc(err.message)}</div>`;
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await ownerApi.logout();
    } catch (err) {
      // 세션이 이미 끊겼어도 로그인 화면으로 보내면 되므로 무시한다.
    }
    activeTab = 'dashboard';
    renderLogin();
  });
}

boot();
