const appEl = document.getElementById('app');
const bannerEl = document.getElementById('banner');

let rewardPollTimer = null;
let rewardTickTimer = null;
let bannerTimer = null;

// ---- 홈 화면에 추가 ----
// Android/Chrome은 beforeinstallprompt를 잡아뒀다가 버튼 클릭 시 그 자리에서 띄운다.
// iOS Safari는 이 이벤트 자체가 없어서 "공유 → 홈 화면에 추가" 안내만 보여준다.
let deferredInstallPrompt = null;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('install-btn');
  if (btn) btn.classList.remove('hidden');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---- 낮/밤 모드 ----

function currentTheme() {
  return localStorage.getItem('me_theme') === 'night' ? 'night' : 'day';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'night' ? '#0F0F10' : '#FBFAF8');
}

function toggleTheme() {
  const next = currentTheme() === 'night' ? 'day' : 'night';
  localStorage.setItem('me_theme', next);
  applyTheme(next);
}

applyTheme(currentTheme());

const markSvg = `
  <svg width="18" height="18" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" stroke-width="1.4"></circle>
    <circle cx="20" cy="20" r="3.5" fill="var(--accent)"></circle>
  </svg>
`;

const themeIconSvg = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
    <circle cx="12" cy="12" r="5"></circle>
    <path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"></path>
  </svg>
`;

const installIconSvg = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
    <path d="M12 3v12M7 10l5 5 5-5" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke-linecap="round"></path>
  </svg>
`;

const chevronSvg = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
    <path d="M9 5l7 7-7 7"></path>
  </svg>
`;

const backArrowSvg = `
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
    <path d="M15 5l-7 7 7 7"></path>
  </svg>
`;

// 로고 락업 — 원래 쓰던 동그란 마크 + Pretendard MOJAVE EXPRESS 그대로다.
const brandLockup = `<div class="brand-mark">${markSvg}MOJAVE EXPRESS</div>`;

// 홈에 들어올 때마다 하나를 고른다. 순전히 인사일 뿐이라 상태로 남기지 않는다.
const GREETINGS = [
  '안녕하세요, 조용한 밤이에요.',
  '오늘도 늦게까지 열어둘게요.',
  '반가워요, 모하비 익스프레스예요.',
  '해가 아직 남았어요. 커피 어떠세요?',
  '느긋하게 머물다 가세요.',
];

function pickGreeting() {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

// 스탬프 수는 두 자리로 맞춰 보여준다 — 07 / 10 처럼 자릿수가 흔들리지 않는다.
function pad2(n) {
  return String(n).padStart(2, '0');
}

// ---- PIN 4칸 입력 ----
// 보이는 것은 칸 4개뿐이고, 실제 입력은 그 위를 통째로 덮은 투명한 input 하나가 받는다.
// 칸 아무 데나 눌러도 그 input에 포커스가 가므로 칸별로 focus를 옮기는 처리가 필요 없다.
function pinFieldHtml(id) {
  const cells = Array.from({ length: 4 }, () => '<span class="pin-cell"></span>').join('');
  return `
    <div class="pin-field" data-pin-field>
      ${cells}
      <input id="${id}" class="input-pin" type="password" inputmode="numeric" pattern="[0-9]*"
             maxlength="4" autocomplete="off"${id === 'f-pin' ? ' required' : ''} />
    </div>
  `;
}

function syncPinCells(input) {
  const field = input.closest('[data-pin-field]');
  if (!field) return;
  const filled = input.value.length;
  field.querySelectorAll('.pin-cell').forEach((cell, i) => {
    cell.textContent = i < filled ? '•' : '';
    cell.classList.toggle('is-next', i === filled);
  });
}

function bindPinCells(input) {
  input.addEventListener('input', () => {
    // 숫자 키패드를 띄워도 하드웨어 키보드로는 문자가 들어올 수 있다.
    const digitsOnly = input.value.replace(/\D/g, '').slice(0, 4);
    if (digitsOnly !== input.value) input.value = digitsOnly;
    syncPinCells(input);
  });
  syncPinCells(input);
}

function flash(message, kind = 'info') {
  bannerEl.textContent = message;
  bannerEl.className = `banner banner-${kind}`;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => bannerEl.classList.add('hidden'), 3200);
}

// 스탬프가 기준치를 채우면 서버가 그 자리에서 쿠폰으로 바꾼다. 그 사실을 적립 안내에 함께 알린다.
function stampResultMessage(result) {
  const base = `스탬프 ${result.added}개 적립됐어요!`;
  return result.couponsIssued > 0 ? `${base} 🎟 쿠폰 ${result.couponsIssued}장이 생겼어요` : base;
}

function stopRewardPoll() {
  if (rewardPollTimer) {
    clearInterval(rewardPollTimer);
    rewardPollTimer = null;
  }
  if (rewardTickTimer) {
    clearInterval(rewardTickTimer);
    rewardTickTimer = null;
  }
}

// ---- QR 카메라 스캔 ----

let scanStream = null;
let scanRAF = null;
let jsQRLoadPromise = null;

function stopScan() {
  if (scanRAF) {
    cancelAnimationFrame(scanRAF);
    scanRAF = null;
  }
  if (scanStream) {
    scanStream.getTracks().forEach((t) => t.stop());
    scanStream = null;
  }
}

function loadJsQR() {
  if (window.jsQR) return Promise.resolve();
  if (jsQRLoadPromise) return jsQRLoadPromise;
  jsQRLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/jsQR.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('스캐너를 불러오지 못했어요'));
    document.head.appendChild(s);
  });
  return jsQRLoadPromise;
}

// 매장 QR은 https://<도메인>/s/<token> 형태의 URL이다 (src/routes/admin/qr.js).
function extractStampToken(text) {
  try {
    const url = new URL(text, location.origin);
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return decodeURIComponent(m[1]);
  } catch (e) {
    // URL이 아니면 아래에서 원문 텍스트를 토큰으로 취급해본다.
  }
  const trimmed = String(text || '').trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(trimmed) ? trimmed : null;
}

// ---- 라우팅 (plan.md 8.1) ----

async function init() {
  const m = location.pathname.match(/^\/s\/([^/]+)$/);
  if (m) {
    sessionStorage.setItem('me_pending_stamp_token', decodeURIComponent(m[1]));
    history.replaceState(null, '', '/');
  }

  try {
    const me = await api.me();
    await afterAuth(me);
  } catch (err) {
    if (err.status === 401) {
      renderAuth(localStorage.getItem('me_last_nickname') || '');
    } else {
      renderFatal(err);
    }
  }
}

async function afterAuth(me) {
  localStorage.setItem('me_last_nickname', me.nickname);

  const pendingToken = sessionStorage.getItem('me_pending_stamp_token');
  if (pendingToken) {
    sessionStorage.removeItem('me_pending_stamp_token');
    try {
      const result = await api.stamp(pendingToken);
      flash(stampResultMessage(result), 'success');
    } catch (err) {
      flash(err.message, 'error');
    }
  }

  await goHome();
}

// ---- 화면: 가입/로그인 ----

function renderAuth(prefillNickname) {
  stopRewardPoll();
  stopScan();

  appEl.innerHTML = `
    <div class="screen auth-screen">
      <div class="auth-body">
        <div class="auth-head">${brandLockup}</div>
        <div class="auth-track-clip">
        <div class="auth-track" id="auth-track">
          <div class="auth-step" id="step-nickname">
            <div class="kicker">01 — NICKNAME</div>
            <div class="display auth-title">별명을 알려주세요</div>
            <p class="subtitle">실명 대신 별명 하나면 돼요.<br />이름·전화번호는 받지 않아요.</p>
            <form id="nickname-form" class="card" style="margin-top:34px;">
              <div>
                <div class="input-wrap">
                  <input id="f-nickname" type="text" maxlength="12" autocomplete="off"
                         value="${esc(prefillNickname || '')}" placeholder="예) 밤의 산책자" required
                         aria-label="별명" />
                  <button type="button" id="btn-random" class="input-inline-btn" aria-label="랜덤 별명 만들기">🎲</button>
                </div>
                <p id="nickname-status" class="field-status hidden"></p>
              </div>
            </form>
            <div class="auth-actions">
              <button type="submit" form="nickname-form" id="btn-next" class="primary-btn" disabled>가입하기</button>
            </div>
          </div>
          <div class="auth-step" id="step-pin">
            <div class="kicker" id="pin-kicker">02 — SIGN UP</div>
            <div class="display auth-title" id="pin-title">PIN을 정해주세요</div>
            <p class="subtitle" id="pin-sub">숫자 4자리만 정하면 바로 시작해요.</p>
            <form id="pin-form" class="card" style="margin-top:34px;">
              <div>
                <label class="field-label" for="f-pin">PIN (4자리)</label>
                ${pinFieldHtml('f-pin')}
              </div>
              <div id="pin-confirm-wrap" class="hidden">
                <label class="field-label" for="f-pin-confirm">PIN 확인</label>
                ${pinFieldHtml('f-pin-confirm')}
              </div>
              <div id="auth-error" class="error-msg hidden"></div>
            </form>
            <div class="auth-actions">
              <button type="submit" form="pin-form" id="auth-submit" class="primary-btn">확인</button>
              <button type="button" class="link-btn" id="btn-back">별명 다시 입력</button>
            </div>
          </div>
        </div>
        </div>
      </div>
      <p class="hint">별명과 PIN만으로 이용해요.<br />
      PIN을 잊었을 시 직원에게 문의해주세요.</p>
    </div>
  `;

  const nicknameInput = document.getElementById('f-nickname');
  const statusEl = document.getElementById('nickname-status');
  const nextBtn = document.getElementById('btn-next');
  const track = document.getElementById('auth-track');
  const pinConfirmWrap = document.getElementById('pin-confirm-wrap');
  const pinConfirmInput = document.getElementById('f-pin-confirm');
  const pinInput = document.getElementById('f-pin');
  const submitBtn = document.getElementById('auth-submit');
  const errorEl = document.getElementById('auth-error');
  const pinKickerEl = document.getElementById('pin-kicker');
  const pinTitleEl = document.getElementById('pin-title');
  const pinSubEl = document.getElementById('pin-sub');

  bindPinCells(pinInput);
  bindPinCells(pinConfirmInput);

  let mode = null; // 'login' | 'signup', 별명 중복확인 결과로 정해짐
  let checkSeq = 0;
  let debounceTimer = null;

  function applyCheckResult(valid, exists, needsReset) {
    if (!valid) {
      mode = null;
      nextBtn.disabled = true;
      statusEl.classList.add('hidden');
      return;
    }
    if (needsReset) {
      mode = 'reset';
      statusEl.textContent = 'PIN이 초기화된 별명이에요';
      statusEl.classList.remove('hidden');
      nextBtn.textContent = '계속';
    } else if (exists) {
      mode = 'login';
      statusEl.textContent = '이미 존재하는 이름이에요';
      statusEl.classList.remove('hidden');
      nextBtn.textContent = '로그인';
    } else {
      mode = 'signup';
      statusEl.classList.add('hidden');
      nextBtn.textContent = '가입하기';
    }
    nextBtn.disabled = false;
  }

  async function runCheck(value) {
    const seq = ++checkSeq;
    if (!value.trim()) {
      applyCheckResult(false);
      return;
    }
    try {
      const res = await api.checkNickname(value);
      if (seq !== checkSeq) return; // 그 사이 더 최신 입력이 있었으면 무시
      applyCheckResult(res.valid, res.exists, res.needsReset);
    } catch (err) {
      if (seq !== checkSeq) return;
      applyCheckResult(false);
    }
  }

  nicknameInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const value = nicknameInput.value;
    debounceTimer = setTimeout(() => runCheck(value), 400);
  });

  document.getElementById('btn-random').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { nickname } = await api.suggestNickname();
      clearTimeout(debounceTimer);
      checkSeq += 1; // 진행 중이던 디바운스 응답은 무시
      nicknameInput.value = nickname;
      // 생성 시점에 서버가 이미 중복확인을 마친 별명이므로 재조회 없이 바로 가입 가능 상태로.
      applyCheckResult(true, false);
    } catch (err) {
      // 실패해도 별명은 직접 입력할 수 있으니 조용히 무시.
    } finally {
      btn.disabled = false;
    }
  });

  function goToPinStep() {
    const isLogin = mode === 'login';
    const isReset = mode === 'reset';
    const nick = nicknameInput.value.trim();

    pinConfirmWrap.classList.toggle('hidden', mode !== 'signup' && mode !== 'reset');
    pinConfirmInput.required = mode === 'signup' || mode === 'reset';
    errorEl.classList.add('hidden');
    pinInput.value = '';
    pinConfirmInput.value = '';
    syncPinCells(pinInput);
    syncPinCells(pinConfirmInput);
    submitBtn.disabled = false;

    // 같은 두 번째 화면이지만 처음 온 손님/다시 온 손님/PIN이 초기화된 손님에게 하는 말이 다르다.
    if (isLogin) {
      pinKickerEl.textContent = '02 — LOGIN';
      pinTitleEl.textContent = `${nick} 님, 다시 오셨네요`;
      pinSubEl.textContent = '별명에 걸어둔 숫자 4자리를 입력해주세요.';
      submitBtn.textContent = '로그인';
    } else if (isReset) {
      pinKickerEl.textContent = '02 — RESET';
      pinTitleEl.textContent = `${nick} 님, PIN이 초기화됐어요`;
      pinSubEl.textContent = '새로운 PIN 4자리를 정해주세요.';
      submitBtn.textContent = 'PIN 설정하기';
    } else {
      pinKickerEl.textContent = '02 — SIGN UP';
      pinTitleEl.textContent = 'PIN을 정해주세요';
      pinSubEl.textContent = `"${nick}"은 아직 없는 별명이에요. 숫자 4자리만 정하면 바로 시작해요.`;
      submitBtn.textContent = '가입하고 시작하기';
    }

    track.classList.add('at-pin');
    setTimeout(() => pinInput.focus(), 520); // 슬라이드가 끝난 뒤에 키보드를 올린다
  }

  document.getElementById('nickname-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (mode) goToPinStep();
  });

  document.getElementById('btn-back').addEventListener('click', () => {
    track.classList.remove('at-pin');
  });

  document.getElementById('pin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = nicknameInput.value;
    const pin = pinInput.value;
    if ((mode === 'signup' || mode === 'reset') && pin !== pinConfirmInput.value) {
      errorEl.textContent = 'PIN이 서로 달라요';
      errorEl.classList.remove('hidden');
      return;
    }
    submitBtn.disabled = true;
    try {
      const me =
        mode === 'login'
          ? await api.login(nickname, pin)
          : mode === 'reset'
            ? await api.pinReset(nickname, pin)
            : await api.signup(nickname, pin);
      await afterAuth(me);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
    }
  });

  if (prefillNickname) runCheck(prefillNickname);
}

function renderFatal(err) {
  appEl.innerHTML = `<div class="screen center-loading">${esc(err.message || '오류가 발생했어요')}</div>`;
}

// ---- 화면: 홈 ----

// 목표는 항상 쿠폰 1장에 필요한 스탬프 수다. 리워드마다 값이 다르지 않으므로
// 판(카드) 하나 = 쿠폰 한 장으로 단순하게 보여준다. 넘친 만큼은 다음 판으로 이월된다.
function stampGridHtml(stamps, target) {
  const filledCount = stamps % target;
  let cells = '';
  for (let i = 0; i < target; i += 1) {
    const filled = i < filledCount;
    // 칸이 순서대로 자리를 잡는다 — 한꺼번에 나타나면 판이 아니라 벽처럼 보인다.
    const delay = `${(i * 0.03).toFixed(3)}s`;
    cells += `<span class="dot${filled ? ' filled' : ''}" style="animation-delay:${delay}"></span>`;
  }
  return `<div class="stamp-grid">${cells}</div>`;
}

// 손님 홈의 리워드 섹션은 읽기 전용 시간표다. 교환은 쿠폰 화면에서만 한다.
function rewardItemHtml(r) {
  return `
    <li class="reward-item ${r.activeNow ? '' : 'reward-inactive'}">
      <div class="reward-main">
        <span class="reward-name">${esc(r.name)}</span>
        ${r.activeNow ? '<span class="reward-badge">지금 가능</span>' : ''}
      </div>
      <div class="reward-sub">
        <span class="reward-window">${esc(r.window)}</span>
      </div>
    </li>
  `;
}

function formatUsedAt(unix) {
  const d = new Date(unix * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatDate(unix) {
  const d = new Date(unix * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

// 만료가 남은 날짜. 오늘 자정까지 남은 것을 D-0으로 본다 (시각이 아니라 날짜 단위로 세는 게 자연스럽다).
function daysUntil(unix) {
  const end = new Date(unix * 1000);
  const today = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOf(end) - startOf(today)) / 86400000);
}

// 지난 쿠폰은 쓴 것과 기간이 지나 사라진 것 두 종류다.
function couponHistoryHtml(c) {
  const expired = c.status === 'expired';
  const when = expired
    ? c.expiresAt && `${formatDate(c.expiresAt)} 만료`
    : c.usedAt && formatUsedAt(c.usedAt);
  return `
    <li class="reward-item coupon-used-item${expired ? ' is-expired' : ''}">
      <div class="reward-main">
        <span class="reward-name">${expired ? '사용하지 못한 쿠폰' : esc(c.rewardName || '리워드')}</span>
        <span class="coupon-used-tag">${expired ? '기간 만료' : '사용 완료'}</span>
      </div>
      <div class="reward-sub">
        <span class="reward-window">${when ? esc(when) : ''}</span>
      </div>
    </li>
  `;
}

// 유효기간이 없으면 아무것도 표시하지 않는다 — 무기한이 기본이라 굳이 알릴 것이 없다.
function expiryLabel(expiresAt) {
  if (!expiresAt) return '';
  const d = daysUntil(expiresAt);
  if (d <= 0) return '오늘까지';
  if (d <= 14) return `${formatDate(expiresAt)}까지 (D-${d})`;
  return `${formatDate(expiresAt)}까지`;
}

// 사용 완료 화면을 이미 확인한 쿠폰. 서버는 최근 사용분을 잠시 계속 내려주므로
// 손님이 "확인"을 누른 뒤에도 홈에 올 때마다 다시 뜨는 것을 막는다.
function markCouponAcknowledged(couponId) {
  sessionStorage.setItem('me_ack_coupon', String(couponId));
}

function isCouponAcknowledged(couponId) {
  return sessionStorage.getItem('me_ack_coupon') === String(couponId);
}

async function goHome() {
  try {
    const [me, coupons] = await Promise.all([api.me(), api.coupons()]);
    renderHome(me, coupons);
  } catch (err) {
    if (err.status === 401) {
      renderAuth(localStorage.getItem('me_last_nickname') || '');
    } else {
      flash(err.message, 'error');
    }
  }
}

function renderHome(me, coupons) {
  stopRewardPoll();
  stopScan();

  if (me.pendingRedemption) {
    renderRewardWait(me.pendingRedemption);
    return;
  }

  // 폴링으로 결과를 못 받고 화면을 벗어났더라도 여기서 사용 완료를 되살린다.
  if (me.lastUsedCoupon && !isCouponAcknowledged(me.lastUsedCoupon.couponId)) {
    renderCouponDone(me.lastUsedCoupon);
    return;
  }

  const target = me.stampCost;
  const remain = (target - (me.stamps % target)) % target;
  const remainMsg =
    me.couponCount > 0 && remain === 0
      ? '쿠폰을 사용할 수 있어요'
      : `${remain === 0 ? target : remain}개 더 모으면 쿠폰 1장`;

  const schedule = coupons.schedule || [];

  // 목록은 만료 임박순이라 첫 장이 가장 급하다. 무기한이면 아무 안내도 띄우지 않는다.
  const soonest = (coupons.unused || []).find((c) => c.expiresAt);
  const soonestExpiry = soonest ? expiryLabel(soonest.expiresAt) : '';
  const soonestUrgent = soonest && daysUntil(soonest.expiresAt) <= 7;
  const history = coupons.history || [];

  appEl.innerHTML = `
    <div class="screen home-screen">
      <div class="home-topbar">
        ${brandLockup}
        <div class="home-topbar-actions">
          ${
            !isStandalone() && (deferredInstallPrompt || isIOS())
              ? `<button id="install-btn" class="icon-btn" aria-label="홈 화면에 추가">${installIconSvg}</button>`
              : ''
          }
          <button id="theme-toggle" class="icon-btn" aria-label="화면 밝기 전환">${themeIconSvg}</button>
        </div>
      </div>

      <div class="home-greeting">${esc(pickGreeting())}</div>

      <div class="home-meta">
        <div>
          <div class="home-nickname">${esc(me.nickname)} 님</div>
          <div class="home-cardno">전표번호 ${esc(me.cardNo || '')}</div>
        </div>
        <button id="logout-btn" class="link-btn">로그아웃</button>
      </div>

      <div class="stamp-card">
        <div class="kicker stamp-kicker">STAMP CARD</div>
        <div class="stamp-count">
          <span class="stamp-count-num">${pad2(me.stamps % target)}</span>
          <span class="stamp-count-den">/ ${target}</span>
        </div>
        ${stampGridHtml(me.stamps, target)}
        <div class="stamp-remain">${remainMsg}</div>
      </div>

      <div class="home-actions">
        <button id="stamp-scan-btn" class="primary-btn">적립하기</button>
        ${
          me.couponCount > 0
            ? `<button id="coupon-use-btn" class="ghost-btn is-active">
                 <span class="coupon-link-main">
                   <span>쿠폰 ${me.couponCount}장 · 지금 교환할 수 있어요</span>
                   ${soonestExpiry ? `<span class="coupon-link-sub${soonestUrgent ? ' is-urgent' : ''}">${esc(soonestExpiry)}</span>` : ''}
                 </span>
                 ${chevronSvg}
               </button>`
            : `<div class="ghost-btn">
                 <span class="coupon-link-main">
                   <span>쿠폰 0장</span>
                   <span class="coupon-link-sub">스탬프 ${target}개를 모으면 자동으로 쿠폰이 돼요</span>
                 </span>
               </div>`
        }
      </div>

      <section class="rewards-section">
        <h2>시간대별 리워드</h2>
        <ul class="reward-list">
          ${schedule.map(rewardItemHtml).join('') || '<li class="reward-empty">등록된 리워드가 없어요</li>'}
        </ul>
      </section>

      ${
        history.length
          ? `<section class="rewards-section">
               <h2>지난 쿠폰</h2>
               <ul class="reward-list">
                 ${history.map(couponHistoryHtml).join('')}
               </ul>
             </section>`
          : ''
      }
    </div>
  `;

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        installBtn.classList.add('hidden');
      } else if (isIOS()) {
        flash('공유 버튼 → "홈 화면에 추가"를 눌러주세요', 'info');
      }
    });
  }

  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await api.logout();
    } catch (e) {
      // 세션이 이미 끊겼어도 로그인 화면으로 보내면 그만이다.
    }
    localStorage.removeItem('me_last_nickname');
    renderAuth('');
  });

  document.getElementById('stamp-scan-btn').addEventListener('click', renderScan);

  const useBtn = document.getElementById('coupon-use-btn');
  if (useBtn) useBtn.addEventListener('click', () => renderCouponUse(coupons));
}

// ---- 화면: 쿠폰 사용 ----
// 쿠폰에는 이름이 없다. 지금 열려 있는 리워드가 하나면 그걸로 확정되고,
// 시간대가 겹쳐 여러 개면 손님이 고른다.
function renderCouponUse(coupons) {
  stopRewardPoll();
  stopScan();

  const coupon = coupons.unused[0];
  const available = coupons.availableRewards || [];
  const closed = (coupons.schedule || []).filter((r) => !r.activeNow);

  if (!coupon) {
    goHome();
    return;
  }

  const body = available.length
    ? `
      <div class="kicker choice-kicker">지금 바꿀 수 있어요${available.length > 1 ? ' — 하나를 골라주세요' : ''}</div>
      <ul class="choice-list">
        ${available
          .map(
            (r, i) => `
          <li>
            <label class="choice-item">
              <input type="radio" name="reward" value="${r.id}" ${i === 0 ? 'checked' : ''} />
              <span class="choice-main">
                <span class="choice-name">${esc(r.name)}</span>
                <span class="choice-window">${esc(r.window)}</span>
              </span>
            </label>
          </li>`
          )
          .join('')}
      </ul>
      <button id="coupon-submit" class="primary-btn">교환 요청하기</button>
    `
    : `
      <p class="subtitle">지금은 바꿀 수 있는 리워드가 없어요.<br />아래 시간에 다시 와주세요.</p>
      <div class="kicker choice-kicker">다른 시간대</div>
      <ul class="reward-list">
        ${closed.map(rewardItemHtml).join('') || '<li class="reward-empty">등록된 리워드가 없어요</li>'}
      </ul>
    `;

  appEl.innerHTML = `
    <div class="screen coupon-screen">
      <button class="back-btn" id="back-btn">${backArrowSvg}쿠폰 사용</button>
      <div class="coupon-ticket">
        <div class="coupon-ticket-kicker">COUPON</div>
        <div class="coupon-ticket-count">
          <span class="coupon-ticket-num">${pad2(coupons.unused.length)}</span>
          <span class="coupon-ticket-unit">장</span>
        </div>
        ${
          coupon.expiresAt
            ? `<div class="coupon-expiry${daysUntil(coupon.expiresAt) <= 7 ? ' is-urgent' : ''}">${esc(expiryLabel(coupon.expiresAt))}</div>`
            : ''
        }
      </div>
      ${body}
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', goHome);

  const submitBtn = document.getElementById('coupon-submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const picked = document.querySelector('input[name="reward"]:checked');
      if (!picked) return;
      submitBtn.disabled = true;
      try {
        const req = await api.couponUse(coupon.id, Number(picked.value));
        renderRewardWait(req);
      } catch (err) {
        flash(err.message, 'error');
        await goHome();
      }
    });
  }
}

// ---- 화면: 사용 완료 ----
// 손님이 직접 "확인"을 눌러야 넘어간다. 잠깐 뜨는 배너로는 놓치기 쉽다.
function renderCouponDone(info) {
  stopRewardPoll();
  stopScan();

  markCouponAcknowledged(info.couponId);

  appEl.innerHTML = `
    <div class="screen done-screen">
      <div class="pulse-ring">
        <span class="pulse-ring-inner"></span>
        <svg class="done-mark" width="40" height="40" viewBox="0 0 24 24" fill="none"
             stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5"></path>
        </svg>
      </div>
      <div class="done-title">사용 완료</div>
      <p class="subtitle">"${esc(info.rewardName || '리워드')}"로 교환됐어요.<br />좋은 밤 보내세요.</p>
      ${info.usedAt ? `<div class="done-time">${formatUsedAt(info.usedAt)}</div>` : ''}
      <button id="done-btn" class="primary-btn">확인</button>
    </div>
  `;

  document.getElementById('done-btn').addEventListener('click', goHome);
}

// ---- 화면: QR 스캔 (plan.md 8.3의 주 동선 — 앱 안에서 카메라로 직접 스캔) ----

function renderScan() {
  stopRewardPoll();
  stopScan();

  appEl.innerHTML = `
    <div class="screen scan-screen">
      <button class="back-btn" id="back-btn">${backArrowSvg}QR 스캔</button>
      <div class="scan-body">
        <div class="scan-viewport">
          <video id="scan-video" playsinline muted></video>
          <span class="corner corner-tl"></span>
          <span class="corner corner-tr"></span>
          <span class="corner corner-bl"></span>
          <span class="corner corner-br"></span>
          <span class="scanline"></span>
        </div>
        <div class="scan-hint" id="scan-status">카메라를 켜는 중...</div>
        <button type="button" id="scan-manual-link" class="ghost-btn">코드를 직접 입력할게요</button>
      </div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => {
    stopScan();
    goHome();
  });
  document.getElementById('scan-manual-link').addEventListener('click', () => {
    stopScan();
    renderManualStampEntry();
  });

  const video = document.getElementById('scan-video');
  const statusEl = document.getElementById('scan-status');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let handled = false;

  async function handleDetected(text) {
    if (handled) return;
    const token = extractStampToken(text);
    if (!token) return; // 우리 QR 형식이 아니면 계속 스캔한다.
    handled = true;
    stopScan();
    statusEl.textContent = '처리 중...';
    try {
      const result = await api.stamp(token);
      flash(stampResultMessage(result), 'success');
    } catch (err) {
      flash(err.message, 'error');
    }
    await goHome();
  }

  function tick() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        handleDetected(code.data);
        if (handled) return;
      }
    }
    scanRAF = requestAnimationFrame(tick);
  }

  loadJsQR()
    .then(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }))
    .then((stream) => {
      scanStream = stream;
      video.srcObject = stream;
      return video.play();
    })
    .then(() => {
      statusEl.textContent = 'QR코드를 프레임 안에 맞춰주세요';
      scanRAF = requestAnimationFrame(tick);
    })
    .catch(() => {
      statusEl.textContent = '카메라를 사용할 수 없어요. 아래에서 코드를 입력해주세요.';
      statusEl.classList.add('is-error');
    });
}

// ---- 화면: 수동 코드 입력 (카메라를 쓸 수 없을 때의 대안, plan.md 8.3) ----

function renderManualStampEntry() {
  stopRewardPoll();
  stopScan();

  appEl.innerHTML = `
    <div class="screen scan-screen">
      <button class="back-btn" id="back-btn">${backArrowSvg}코드 입력</button>
      <p class="subtitle">매장 화면 하단에 표시된 코드를 입력해주세요.</p>
      <form id="stamp-form" class="manual-entry-body">
        <input id="f-token" class="code-field" type="text" autocomplete="off" placeholder="코드" required />
        <button type="submit" id="stamp-submit" class="primary-btn">적립하기</button>
      </form>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', goHome);
  document.getElementById('stamp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = document.getElementById('f-token').value.trim();
    const btn = document.getElementById('stamp-submit');
    btn.disabled = true;
    try {
      const result = await api.stamp(token);
      flash(stampResultMessage(result), 'success');
      await goHome();
    } catch (err) {
      flash(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ---- 화면: 쿠폰 사용 승인 대기 (plan.md 5.3) ----

// 화면은 한 번만 그린다. 매초 appEl 전체를 다시 그리면 .screen의 fadeIn이 그때마다 처음부터
// 재생돼 화면이 깜빡인다(그리고 취소 버튼 리스너도 매초 다시 붙는다). 틱은 숫자만 갈아끼운다.
function tickRewardWait(expiresAt) {
  const el = document.getElementById('reward-countdown');
  if (!el) {
    stopRewardPoll(); // 화면을 벗어났는데 아직 살아있던 타이머면 여기서 정리한다
    return;
  }
  const remain = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
  const mm = String(Math.floor(remain / 60)).padStart(2, '0');
  const ss = String(remain % 60).padStart(2, '0');
  // 0에 닿아도 화면을 바꾸지 않는다 — 실제 만료 처리는 아래 폴링이 'expired'로 받아서 한다.
  el.textContent = `${mm}:${ss}`;
}

function renderRewardWait(pending) {
  stopRewardPoll();
  stopScan();

  appEl.innerHTML = `
    <div class="screen wait-screen">
      <div class="pulse-ring">
        <span class="pulse-ring-inner"></span>
        <span class="countdown" id="reward-countdown"></span>
      </div>
      <div class="wait-title">사장님께 요청했어요</div>
      <p class="subtitle">"${esc(pending.rewardName)}" 교환을 승인해주실 때까지<br />이 화면에서 기다려주세요.</p>
      <button id="cancel-btn" class="link-btn">요청 취소</button>
    </div>
  `;
  document.getElementById('cancel-btn').addEventListener('click', async () => {
    stopRewardPoll();
    try {
      await api.rewardCancel();
    } finally {
      await goHome();
    }
  });

  tickRewardWait(pending.expiresAt);
  rewardTickTimer = setInterval(() => tickRewardWait(pending.expiresAt), 1000);

  rewardPollTimer = setInterval(async () => {
    try {
      const status = await api.rewardStatus();
      if (status.status === 'pending') return;

      stopRewardPoll();
      if (status.status === 'approved') {
        // 배너로 스쳐 지나가게 두지 않는다. 손님이 확인을 누를 때까지 남아 있는 화면으로 보낸다.
        renderCouponDone({
          couponId: pending.couponId,
          rewardName: status.rewardName,
          usedAt: status.resolvedAt,
        });
        return;
      }
      if (status.status === 'expired') flash('시간이 지나 요청이 취소됐어요. 쿠폰은 그대로 있어요', 'error');
      else if (status.status === 'cancelled') flash('요청을 취소했어요', 'info');
      else if (status.status === 'rejected') flash('사장님이 요청을 거절했어요. 쿠폰은 그대로 있어요', 'error');
      await goHome();
    } catch (err) {
      stopRewardPoll();
      if (err.status === 401) renderAuth(localStorage.getItem('me_last_nickname') || '');
      else flash(err.message, 'error');
    }
  }, 3000);
}

init();
