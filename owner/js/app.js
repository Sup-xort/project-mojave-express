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
let redemptionsPollTimer = null; // 교환 승인 탭이 열려 있는 동안 목록을 주기적으로 새로고침한다.
let redemptionBadgeTimer = null; // 어느 탭에 있든 대기 건수 배지를 갱신한다.

function clearAppState() {
  clearInterval(qrTimer);
  clearInterval(redemptionsPollTimer);
  clearInterval(redemptionBadgeTimer);
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
    if (activeTab === 'redemptions') loadRedemptions();
    if (activeTab === 'dashboard') renderDashboardTab(document.getElementById('content'));
    refreshRedemptionBadge();
  });
}

const toastsByRedemption = new Map(); // redemptionId -> { el, soundTimer }

// 팝업은 6초 뒤 자동으로 사라지던 예전 동작을 없앴다 — 사장님이 확인/취소/X 중 하나를
// 누르거나, 다른 기기·화면에서 이미 처리돼 loadRedemptions()가 감지할 때만 사라진다.
function showRedemptionToast({ redemptionId, nickname, rewardName }) {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = 'owner-toast';
  el.innerHTML = `
    <div class="owner-toast-title">${esc(nickname)}님의 교환요청이 들어왔어요</div>
    <div class="owner-toast-sub">${esc(rewardName)}</div>
    <div class="owner-toast-actions">
      <button class="btn-small" data-act="approve">확인</button>
      <button class="btn-small" data-act="reject">취소</button>
      <button class="icon-btn owner-toast-x" data-act="dismiss" aria-label="닫기">✕</button>
    </div>
  `;
  el.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    activeTab = 'redemptions';
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'redemptions'));
    renderTab();
  });
  el.querySelector('[data-act="approve"]').addEventListener('click', async () => {
    el.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      await ownerApi.approveRedemption(redemptionId);
    } catch (err) {
      alert(err.message);
    }
    dismissToast(redemptionId);
    if (activeTab === 'redemptions') loadRedemptions();
    refreshRedemptionBadge();
  });
  el.querySelector('[data-act="reject"]').addEventListener('click', async () => {
    el.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      await ownerApi.rejectRedemption(redemptionId);
    } catch (err) {
      alert(err.message);
    }
    dismissToast(redemptionId);
    if (activeTab === 'redemptions') loadRedemptions();
    refreshRedemptionBadge();
  });
  el.querySelector('[data-act="dismiss"]').addEventListener('click', () => dismissToast(redemptionId));

  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  // 8초 간격 최대 5회. LP바 음량에서도 알아챌 확률을 높이되 무한히 울리진 않는다.
  beep();
  let soundCount = 1;
  const soundTimer = setInterval(() => {
    if (soundCount >= 5) {
      clearInterval(soundTimer);
      return;
    }
    beep();
    soundCount += 1;
  }, 8000);

  toastsByRedemption.set(redemptionId, { el, soundTimer });
}

function dismissToast(redemptionId) {
  const entry = toastsByRedemption.get(redemptionId);
  if (!entry) return;
  clearInterval(entry.soundTimer);
  entry.el.classList.remove('show');
  setTimeout(() => entry.el.remove(), 200);
  toastsByRedemption.delete(redemptionId);
}

// 어느 탭에 있든 대기 중인 교환요청이 몇 건인지 탭 라벨에 보여준다 — 토스트를 놓쳐도 알 수 있게.
async function refreshRedemptionBadge() {
  try {
    const { count } = await ownerApi.pendingRedemptionCount();
    const badge = document.getElementById('tab-badge-redemptions');
    if (!badge) return;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.toggle('hidden', count === 0);
  } catch (err) {
    // 배지 갱신 실패는 무시 — 핵심 기능이 아니다.
  }
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
        (t) => `<button class="tab-btn${t.id === activeTab ? ' active' : ''}" data-tab="${t.id}">${t.label}${
          t.id === 'redemptions' ? '<span class="tab-badge hidden" id="tab-badge-redemptions"></span>' : ''
        }</button>`
      ).join('')}
    </div>
    <div class="content" id="content"></div>
    <div class="toast-stack" id="toast-stack"></div>
  `;

  document.getElementById('night-toggle').addEventListener('click', toggleNight);
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab !== 'qr') {
        clearInterval(qrTimer);
        qrScreen = 'amount'; // 토큰 자체는 안 지운다 — 화면 상태만 정리한다
      }
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderTab();
    });
  });

  renderTab();
  connectOwnerEvents();
  refreshRedemptionBadge();
  redemptionBadgeTimer = setInterval(refreshRedemptionBadge, 8000);
}

function renderTab() {
  clearInterval(qrTimer);
  clearInterval(redemptionsPollTimer);
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
// QR을 상시로 띄워두면 누구든 먼저 스캔해 스탬프를 훔쳐갈 수 있다. 이제는
// "수량 설정 → 발급 버튼 → QR 표시"를 명시적으로 거친다. QR 표시 화면은 손님에게 보여주는
// 화면이라 디자인에 신경 쓰고 닫기/재생성 버튼을 둔다. 닫기·재생성은 서버에 아무 요청도
// 보내지 않는다 — 지금 발급된 토큰은 그대로 살아있고, 오직 TTL 만료만 그걸 못 쓰게 만든다.
// 만료 시에도 자동으로 재발급을 반복하지 않는다(예전엔 매초 재시도해 폭주했다) — 수동으로
// "재생성" → "발급"을 눌러야 새 토큰이 나온다.

let qrScreen = 'amount'; // 'amount' | 'live' | 'expired'
let qrKeypadBuffer = '';
let qrDataUrl = '';
let qrUrl = '';
let qrExpiresAt = 0;
let qrIssueBusy = false;

function renderQrTab(content) {
  clearInterval(qrTimer);
  if (qrScreen === 'live') renderQrLiveScreen(content);
  else if (qrScreen === 'expired') renderQrExpiredScreen(content);
  else renderQrAmountScreen(content);
}

function renderQrAmountScreen(content) {
  qrScreen = 'amount';
  qrKeypadBuffer = String(qrAmount);
  content.innerHTML = `
    <div class="qr-screen">
      <div class="qr-stepper">
        <button id="qr-minus" class="stepper-btn" aria-label="수량 줄이기">−</button>
        <div class="qr-amount" id="qr-amount-display">${qrAmount}</div>
        <button id="qr-plus" class="stepper-btn" aria-label="수량 늘리기">+</button>
      </div>
      <div class="keypad" id="qr-keypad">
        ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', ''].map(
          (k) => (k ? `<button class="keypad-btn" data-key="${k}">${k}</button>` : `<span></span>`)
        ).join('')}
      </div>
      <div id="qr-error"></div>
      <button id="qr-issue" class="btn-primary">발급</button>
    </div>
  `;
  document.getElementById('qr-minus').addEventListener('click', () => adjustQrAmount(-1));
  document.getElementById('qr-plus').addEventListener('click', () => adjustQrAmount(1));
  document.getElementById('qr-keypad').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-key]');
    if (!btn) return;
    if (btn.dataset.key === '⌫') qrKeypadBuffer = qrKeypadBuffer.slice(0, -1);
    else qrKeypadBuffer = (qrKeypadBuffer === '0' ? '' : qrKeypadBuffer) + btn.dataset.key;
    syncQrAmountFromBuffer();
  });
  document.getElementById('qr-issue').addEventListener('click', issueQrAndShow);
}

function syncQrAmountFromBuffer() {
  const n = Number(qrKeypadBuffer || '0');
  qrAmount = n >= 1 ? n : 1;
  const display = document.getElementById('qr-amount-display');
  if (display) display.textContent = qrKeypadBuffer ? qrAmount : 1;
}

function adjustQrAmount(delta) {
  qrAmount = Math.max(1, qrAmount + delta);
  qrKeypadBuffer = String(qrAmount);
  const display = document.getElementById('qr-amount-display');
  if (display) display.textContent = qrAmount;
}

async function issueQrAndShow() {
  if (qrIssueBusy) return;
  qrIssueBusy = true;
  const errorEl = document.getElementById('qr-error');
  const issueBtn = document.getElementById('qr-issue');
  if (errorEl) errorEl.innerHTML = '';
  if (issueBtn) issueBtn.disabled = true;
  try {
    const issued = await ownerApi.issueQr(qrAmount);
    qrDataUrl = issued.qrDataUrl;
    qrUrl = issued.url;
    qrExpiresAt = issued.expiresAt;
    renderQrLiveScreen(document.getElementById('content'));
  } catch (err) {
    if (errorEl) errorEl.innerHTML = `<div class="error-text">${esc(err.message)}</div>`;
  } finally {
    qrIssueBusy = false;
    if (issueBtn) issueBtn.disabled = false;
  }
}

function renderQrLiveScreen(content) {
  qrScreen = 'live';
  content.innerHTML = `
    <div class="qr-live">
      <div class="qr-live-box"><img src="${qrDataUrl}" alt="QR 코드" /></div>
      <div class="qr-countdown" id="qr-countdown"></div>
      <div class="qr-live-amount">${qrAmount}개 적립</div>
      <div class="qr-url">${esc(qrUrl)}</div>
      <div class="qr-actions">
        <button id="qr-close" class="btn-secondary">닫기</button>
        <button id="qr-regen" class="btn-secondary">재생성</button>
      </div>
    </div>
  `;
  document.getElementById('qr-close').addEventListener('click', backToAmountScreen);
  document.getElementById('qr-regen').addEventListener('click', backToAmountScreen);
  clearInterval(qrTimer);
  tickQr();
  qrTimer = setInterval(tickQr, 1000);
}

// 닫기·재생성 둘 다 수량 설정 화면으로 돌아갈 뿐이다 — 서버에는 아무 요청도 보내지 않는다.
// 지금 떠 있는 토큰은 이 함수가 지우지 않는다. TTL이 지나야만 무효화된다
// (redeemQr의 expires_at 조건, qrService.purgeExpired 크론).
function backToAmountScreen() {
  clearInterval(qrTimer);
  renderQrAmountScreen(document.getElementById('content'));
}

function tickQr() {
  const countdownEl = document.getElementById('qr-countdown');
  if (!countdownEl) {
    clearInterval(qrTimer); // 화면을 벗어났는데 아직 살아있던 타이머면 여기서 정리한다
    return;
  }
  const remain = Math.max(0, qrExpiresAt - Math.floor(Date.now() / 1000));
  if (remain <= 0) {
    clearInterval(qrTimer);
    renderQrExpiredScreen(document.getElementById('content'));
    return;
  }
  countdownEl.textContent = `남은 시간 ${remain}초`;
}

// 자동 재발급 없음(예전엔 실패 시 매초 재시도가 폭주했다) — 사장님이 "재생성"을 눌러야 한다.
function renderQrExpiredScreen(content) {
  qrScreen = 'expired';
  content.innerHTML = `
    <div class="qr-live">
      <div class="qr-live-box qr-live-box-expired">만료됨</div>
      <button id="qr-regen-expired" class="btn-primary">재생성</button>
    </div>
  `;
  document.getElementById('qr-regen-expired').addEventListener('click', backToAmountScreen);
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
  clearInterval(redemptionsPollTimer);
  redemptionsPollTimer = setInterval(loadRedemptions, 7000);
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
        refreshRedemptionBadge();
      });
    });

    // 승인/거절 탭에서 직접 처리했거나 다른 기기에서 이미 처리된 요청은 목록에서 사라진다 —
    // 그 요청의 토스트가 아직 떠 있다면 여기서 같이 닫아준다.
    const pendingIds = new Set(list.map((r) => r.id));
    for (const id of [...toastsByRedemption.keys()]) {
      if (!pendingIds.has(id)) dismissToast(id);
    }
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
    { pending: '대기 중', approved: '사용 완료', expired: '시간 만료', cancelled: '손님 취소', rejected: '사장님 거절' }[
      status
    ] ||
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
      <div class="card">
        <div class="section-title">PIN 재설정</div>
        <div class="row">
          <div class="field-inline">
            <label>새 PIN (4자리)</label>
            <input id="pin-reset-input" type="text" inputmode="numeric" maxlength="4" class="input-pin" />
          </div>
          <button id="pin-reset-submit" class="btn-secondary">재설정</button>
        </div>
        <div id="pin-reset-result"></div>
      </div>
    `;
    document.getElementById('pin-reset-submit').addEventListener('click', async () => {
      const pin = document.getElementById('pin-reset-input').value.trim();
      const resultEl = document.getElementById('pin-reset-result');
      resultEl.innerHTML = '';
      if (!/^\d{4}$/.test(pin)) {
        resultEl.innerHTML = `<div class="error-text">PIN은 숫자 4자리예요</div>`;
        return;
      }
      try {
        await ownerApi.resetCustomerPin(c.id, pin);
        resultEl.innerHTML = `<div class="success-text">PIN이 재설정됐어요</div>`;
        document.getElementById('pin-reset-input').value = '';
      } catch (err) {
        resultEl.innerHTML = `<div class="error-text">${esc(err.message)}</div>`;
      }
    });
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
