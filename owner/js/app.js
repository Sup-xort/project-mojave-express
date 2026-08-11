const appEl = document.getElementById('app');

const TABS = [
  { id: 'qr', label: '적립' },
  { id: 'dashboard', label: '대시보드' },
  { id: 'rewards', label: '리워드 관리' },
  { id: 'redemptions', label: '교환 승인' },
  { id: 'grant', label: '스탬프 지급' },
  { id: 'customers', label: '고객 조회' },
  { id: 'settings', label: '설정' },
];

// 바쁜 카운터에서 가장 많이 쓰는 화면이므로 로그인하면 바로 QR이 떠 있는 상태로 시작한다.
let activeTab = 'qr';
let currentUsername = '';
let qrTimer = null; // QR 화면을 벗어나도 살아있는 setInterval이 detached DOM을 건드리지 않도록 매번 정리한다.
let qrAmount = 1;
let ownerEventSource = null; // 교환 요청 실시간 알림용 SSE 연결. 로그아웃/화면 전환 시 정리한다.

function clearAppState() {
  clearInterval(qrTimer);
  if (ownerEventSource) {
    ownerEventSource.close();
    ownerEventSource = null;
  }
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

// ---------- 실시간 알림 (교환 요청) ----------
// 손님이 리워드 교환을 요청하면 서버가 SSE로 밀어준다. 어느 탭에 있든 즉시 팝업으로 보여주고,
// 마침 교환 승인 탭을 보고 있으면 목록도 같이 새로고침한다.

function connectOwnerEvents() {
  if (ownerEventSource) return;
  ownerEventSource = new EventSource('/api/owner/events');
  ownerEventSource.addEventListener('redemption_request', (e) => {
    let data;
    try {
      data = JSON.parse(e.data);
    } catch (err) {
      return;
    }
    showRedemptionToast(data);
    beep();
    if (activeTab === 'redemptions') loadRedemptions();
    if (activeTab === 'dashboard') renderDashboardTab(document.getElementById('content'));
  });
}

function showRedemptionToast({ nickname, rewardName }) {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = 'owner-toast';
  el.innerHTML = `
    <div class="owner-toast-title">${esc(nickname)}님의 교환요청이 들어왔어요</div>
    <div class="owner-toast-sub">${esc(rewardName)}</div>
  `;
  el.addEventListener('click', () => {
    activeTab = 'redemptions';
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'redemptions'));
    renderTab();
    dismissToast(el);
  });
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => dismissToast(el), 6000);
}

function dismissToast(el) {
  if (!el.isConnected) return;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 200);
}

// 별도 오디오 파일 없이 짧은 알림음만 낸다. 브라우저가 막으면(자동재생 정책 등) 조용히 무시한다.
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch (err) {
    // 무시
  }
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
    <div class="toast-stack" id="toast-stack"></div>
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
  connectOwnerEvents();
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

// ---------- 적립 (QR) ----------
// 카운터가 바쁠 때 가장 많이 만지는 화면이라 조작을 최소화한다: 화면에 들어오면 QR이 바로 떠 있고,
// 수량은 +/- 두 버튼으로만 바꾼다. QR은 소진형(한 번 스캔되면 그 토큰은 다시 못 씀)이라 수량을 바꾸면
// 곧바로 새 토큰을 발급해 보여준다. 만료되면(기본 120초) 같은 수량으로 자동으로 다시 발급한다 —
// 사장님이 "다시 발급"을 눌러야 하는 순간이 없어야 한다.

let qrExpiresAt = 0;
let qrRequestSeq = 0; // +/- 연타로 발급 요청이 겹칠 때 가장 마지막 응답만 반영하기 위한 순번.

function renderQrTab(content) {
  content.innerHTML = `
    <div class="qr-live">
      <div class="qr-live-box" id="qr-live-box"><div class="empty-msg">불러오는 중...</div></div>
      <div class="qr-countdown" id="qr-countdown"></div>
      <div class="qr-stepper">
        <button id="qr-minus" class="stepper-btn" aria-label="수량 줄이기">−</button>
        <div class="qr-amount" id="qr-amount-display">${qrAmount}</div>
        <button id="qr-plus" class="stepper-btn" aria-label="수량 늘리기">+</button>
      </div>
      <div class="qr-url" id="qr-url"></div>
      <div id="qr-error"></div>
    </div>
  `;
  document.getElementById('qr-minus').addEventListener('click', () => adjustQrAmount(-1));
  document.getElementById('qr-plus').addEventListener('click', () => adjustQrAmount(1));

  issueQrLive();
  clearInterval(qrTimer);
  qrTimer = setInterval(tickQr, 1000);
}

function adjustQrAmount(delta) {
  qrAmount = Math.max(1, qrAmount + delta);
  const display = document.getElementById('qr-amount-display');
  if (display) display.textContent = qrAmount;
  issueQrLive();
}

async function issueQrLive() {
  const boxEl = document.getElementById('qr-live-box');
  if (!boxEl) return; // 이 화면을 벗어난 뒤 늦게 불린 경우 (만료 타이머 race)
  const mySeq = ++qrRequestSeq;
  const errorEl = document.getElementById('qr-error');
  if (errorEl) errorEl.innerHTML = '';

  try {
    const issued = await ownerApi.issueQr(qrAmount);
    if (mySeq !== qrRequestSeq) return; // 더 최신 요청이 이미 나갔으면 이 응답은 버린다
    const liveBox = document.getElementById('qr-live-box');
    if (!liveBox) return;
    qrExpiresAt = issued.expiresAt;
    liveBox.innerHTML = `<img src="${issued.qrDataUrl}" alt="QR 코드" />`;
    const urlEl = document.getElementById('qr-url');
    if (urlEl) urlEl.textContent = issued.url;
    tickQr();
  } catch (err) {
    if (mySeq !== qrRequestSeq) return;
    const liveErrorEl = document.getElementById('qr-error');
    if (liveErrorEl) liveErrorEl.innerHTML = `<div class="error-text">${esc(err.message)}</div>`;
  }
}

function tickQr() {
  const countdownEl = document.getElementById('qr-countdown');
  if (!countdownEl) {
    clearInterval(qrTimer); // 화면을 벗어났는데 아직 살아있던 타이머면 여기서 정리한다
    return;
  }
  const remain = Math.max(0, qrExpiresAt - Math.floor(Date.now() / 1000));
  countdownEl.textContent = `남은 시간 ${remain}초`;
  if (remain <= 0) issueQrLive();
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

// 필요 스탬프는 여기서 정하지 않는다. 쿠폰 1장 = 고정 스탬프 수라서 리워드마다 다를 수 없다.
// 사장님이 정하는 것은 "몇 시부터 몇 시까지 무엇을 주는가" 뿐이다.
async function renderRewardsTab(content) {
  content.innerHTML = `
    <h1>리워드 관리</h1>
    <p class="hint-text">쿠폰 1장을 무엇으로 바꿔줄지는 손님이 쿠폰을 <b>쓰는 시각</b>이 정합니다.
    아래 시간대가 그 기준이에요.</p>
    <div class="card">
      <table class="data-table" id="rewards-table">
        <thead><tr><th>이름</th><th>시간대</th><th>상태</th><th>순서</th><th></th></tr></thead>
        <tbody><tr><td colspan="5" class="empty-msg">불러오는 중...</td></tr></tbody>
      </table>
    </div>
    <div class="card">
      <div class="section-title">새 리워드</div>
      <div class="row">
        <div class="field-inline"><label>이름</label><input id="rw-name" type="text" /></div>
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

function rewardStatusCell(r) {
  if (!r.active) return '<span class="tag">꺼짐</span>';
  const now = r.activeNow ? '<span class="tag pending">지금 활성</span>' : '<span class="tag">시간대 밖</span>';
  // 겹침은 오류가 아니다. 그 시간에는 손님이 둘 중 하나를 고르게 된다는 뜻이라 알려만 준다.
  return r.overlapping ? `${now} <span class="tag">겹침</span>` : now;
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
          <td>${esc(r.window)}</td>
          <td>${rewardStatusCell(r)}</td>
          <td>${r.sortOrder}</td>
          <td><button class="btn-small" data-toggle="${r.id}" data-active="${r.active}">${r.active ? '끄기' : '켜기'}</button></td>
        </tr>`
          )
          .join('')
      : `<tr><td colspan="5" class="empty-msg">등록된 리워드가 없어요</td></tr>`;

    tbody.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        // 스케줄과 무관한 수동 on/off(active)를 뒤집는다. activeNow는 지금 시각이 시간대 안인지일 뿐이라
        // 그걸 기준으로 뒤집으면 시간대 밖의 리워드를 끌 수 없다.
        btn.disabled = true;
        try {
          await ownerApi.updateReward(Number(btn.dataset.toggle), {
            active: btn.dataset.active === '1' ? 0 : 1,
          });
          await loadRewards();
        } catch (err) {
          btn.disabled = false;
          alert(err.message);
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="error-text">${esc(err.message)}</td></tr>`;
  }
}

async function createReward() {
  const name = document.getElementById('rw-name').value.trim();
  const sortOrder = Number(document.getElementById('rw-sort').value);
  const startMin = hhmmToMin(document.getElementById('rw-start').value);
  const endMin = hhmmToMin(document.getElementById('rw-end').value);
  try {
    await ownerApi.createReward({ name, startMin, endMin, sortOrder, active: 1 });
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
        <thead><tr><th>별명</th><th>바꿔줄 리워드</th><th>쿠폰</th><th>요청 시각</th><th></th></tr></thead>
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
          <td>🎟 #${r.couponId ?? '-'}</td>
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

function redemptionStatusLabel(status) {
  return (
    { pending: '대기 중', approved: '사용 완료', expired: '시간 만료', cancelled: '손님 취소' }[status] ||
    status
  );
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
          <span class="dh-stamps">스탬프 ${c.stamps}개 · 🎟 ${c.couponCount}장</span>
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
        <div class="section-title" style="margin-top:20px;">최근 쿠폰 사용 내역</div>
        <table class="data-table">
          <tbody>
            ${
              c.redemptions.length
                ? c.redemptions
                    .map(
                      (r) =>
                        `<tr><td>${fmtTime(r.requestedAt)}</td><td>🎟 #${r.couponId ?? '-'}</td><td>${esc(r.rewardName)}</td><td>${esc(redemptionStatusLabel(r.status))}</td></tr>`
                    )
                    .join('')
                : `<tr><td class="empty-msg">사용 내역이 없어요</td></tr>`
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

// 유효기간만 앱에서 바꾼다. 스탬프 수·시간대는 서버 .env 값이라 읽기 전용으로 보여준다.
async function loadCouponPolicy() {
  const el = document.getElementById('coupon-policy');
  if (!el) return;
  try {
    const s = await ownerApi.settings();
    el.classList.remove('empty-msg');
    el.innerHTML = `
      <div class="row" style="align-items:flex-end;">
        <div class="field-inline">
          <label>쿠폰 유효기간</label>
          <input id="ttl-days" type="number" min="0" max="${s.maxCouponTtlDays}" value="${s.couponTtlDays}" />
        </div>
        <div class="ttl-unit">일</div>
        <button id="ttl-save" class="btn-secondary">저장</button>
      </div>
      <label class="ttl-forever">
        <input id="ttl-none" type="checkbox" ${s.couponTtlDays === 0 ? 'checked' : ''} />
        유효기간 없음 (무기한)
      </label>
      <div id="ttl-result"></div>
      <div class="cr-meta" style="margin-top:16px;line-height:1.7;">
        유효기간은 쿠폰을 <b>발급하는 시점</b>에 새겨집니다. 여기서 값을 바꿔도
        이미 손님이 갖고 있는 쿠폰의 만료일은 달라지지 않아요.<br />
        쿠폰 1장에 필요한 스탬프: <b>${s.couponStampCost}개</b> (COUPON_STAMP_COST) ·
        시간대 기준: <b>${esc(s.storeTz)}</b> (STORE_TZ) — 이 둘은 서버 .env에서만 바꿉니다.
      </div>
    `;

    const daysEl = document.getElementById('ttl-days');
    const noneEl = document.getElementById('ttl-none');
    const resultEl = document.getElementById('ttl-result');

    const syncDisabled = () => {
      daysEl.disabled = noneEl.checked;
    };
    syncDisabled();

    noneEl.addEventListener('change', () => {
      if (noneEl.checked) daysEl.value = '0';
      else if (Number(daysEl.value) === 0) daysEl.value = '90';
      syncDisabled();
    });
    daysEl.addEventListener('input', () => {
      noneEl.checked = Number(daysEl.value) === 0;
      syncDisabled();
    });

    document.getElementById('ttl-save').addEventListener('click', async () => {
      resultEl.innerHTML = '';
      const days = noneEl.checked ? 0 : Number(daysEl.value);
      try {
        const saved = await ownerApi.updateSettings({ couponTtlDays: days });
        resultEl.innerHTML = `<div class="success-text">${
          saved.couponTtlDays === 0
            ? '앞으로 발급되는 쿠폰은 무기한이에요'
            : `앞으로 발급되는 쿠폰은 ${saved.couponTtlDays}일간 유효해요`
        }</div>`;
      } catch (err) {
        resultEl.innerHTML = `<div class="error-text">${esc(err.message)}</div>`;
      }
    });
  } catch (err) {
    el.innerHTML = `<div class="error-text">${esc(err.message)}</div>`;
  }
}

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
      <div class="section-title">쿠폰 정책</div>
      <div id="coupon-policy" class="empty-msg">불러오는 중...</div>
    </div>
    <div class="card">
      <button id="logout-btn" class="btn-secondary">로그아웃</button>
    </div>
  `;

  loadCouponPolicy();

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
    activeTab = 'qr';
    renderLogin();
  });
}

boot();
