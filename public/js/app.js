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
  if (meta) meta.setAttribute('content', theme === 'night' ? '#181715' : '#F5F4F1');
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

function renderAuth(prefillNickname, mode) {
  stopRewardPoll();
  stopScan();
  const hasNickname = !!prefillNickname;
  let currentMode = mode || (hasNickname ? 'login' : 'signup');
  const isLogin = currentMode === 'login';

  appEl.innerHTML = `
    <div class="screen auth-screen">
      <div class="auth-body">
        <div class="auth-head">
          ${markSvg}
          <div class="brand-kicker" style="margin-top:20px;">MOJAVE EXPRESS</div>
          <div class="auth-title">${isLogin ? '로그인' : '별명을 알려주세요'}</div>
          ${!isLogin ? '<p class="subtitle">실명 대신 별명을 지어주세요</p>' : ''}
        </div>
        <form id="auth-form" class="card">
          <div>
            <label class="field-label" for="f-nickname">별명</label>
            <input id="f-nickname" type="text" maxlength="12" autocomplete="off"
                   value="${esc(prefillNickname)}" placeholder="예) 밤의 산책자" required />
          </div>
          <div>
            <label class="field-label" for="f-pin">PIN (4자리)</label>
            <input id="f-pin" class="input-pin" type="password" inputmode="numeric" pattern="[0-9]*"
                   maxlength="4" autocomplete="off" placeholder="••••" required />
          </div>
          <div id="auth-error" class="error-msg hidden"></div>
        </form>
      </div>
      <div class="auth-actions">
        <button type="submit" form="auth-form" id="auth-submit" class="primary-btn">${isLogin ? '로그인' : '시작하기'}</button>
        <button type="button" id="auth-switch" class="link-btn">${isLogin ? '처음이신가요? 별명 만들기' : '이미 별명이 있나요? 로그인'}</button>
      </div>
      <p class="hint">이름·전화번호는 받지 않아요. 별명과 PIN만으로 이용해요.<br />
      PIN을 잊으면 계정을 되찾을 방법이 없으니 잘 기억해주세요.</p>
    </div>
  `;

  const submitBtn = document.getElementById('auth-submit');
  const errorEl = document.getElementById('auth-error');

  document.getElementById('auth-switch').addEventListener('click', () => {
    renderAuth(document.getElementById('f-nickname').value, isLogin ? 'signup' : 'login');
  });

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = document.getElementById('f-nickname').value;
    const pin = document.getElementById('f-pin').value;
    submitBtn.disabled = true;
    try {
      const me = isLogin ? await api.login(nickname, pin) : await api.signup(nickname, pin);
      await afterAuth(me);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
    }
  });
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
    const isNew = filled && i === filledCount - 1;
    cells += `<span class="dot${filled ? ' filled' : ''}${isNew ? ' is-new' : ''}"></span>`;
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
        <div class="brand-mark">${markSvg}MOJAVE EXPRESS</div>
        <div class="home-topbar-actions">
          ${
            !isStandalone() && (deferredInstallPrompt || isIOS())
              ? `<button id="install-btn" class="icon-btn" aria-label="홈 화면에 추가">${installIconSvg}</button>`
              : ''
          }
          <button id="theme-toggle" class="icon-btn" aria-label="화면 밝기 전환">${themeIconSvg}</button>
        </div>
      </div>

      <div class="home-meta">
        <div>
          <div class="home-nickname">${esc(me.nickname)} 님</div>
          <div class="home-cardno">전표번호 ${esc(me.cardNo || '')}</div>
        </div>
        <button id="logout-btn" class="link-btn" style="align-self:flex-end;">로그아웃</button>
      </div>

      <div class="stamp-card">
        <div class="stamp-kicker">STAMP CARD</div>
        <div class="stamp-count">
          <span class="stamp-count-num">${me.stamps % target}</span>
          <span class="stamp-count-den">/ ${target}</span>
        </div>
        ${stampGridHtml(me.stamps, target)}
        <div class="stamp-remain">${remainMsg}</div>
      </div>

      <div class="coupon-card${me.couponCount > 0 ? ' is-active' : ''}">
        <div class="coupon-card-main">
          <span class="coupon-icon" aria-hidden="true">🎟</span>
          <div>
            <div class="coupon-count">쿠폰 ${me.couponCount}장</div>
            <div class="coupon-sub">${
              me.couponCount > 0
                ? '쓰는 시간대에 따라 받을 메뉴가 정해져요'
                : `스탬프 ${target}개를 모으면 자동으로 쿠폰이 돼요`
            }</div>
            ${soonestExpiry ? `<div class="coupon-expiry${soonestUrgent ? ' is-urgent' : ''}">${esc(soonestExpiry)}</div>` : ''}
          </div>
        </div>
        ${me.couponCount > 0 ? '<button id="coupon-use-btn" class="primary-btn">사용하기</button>' : ''}
      </div>

      <button id="stamp-scan-btn" class="stamp-manual-btn">QR 스캔하기</button>

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
      <p class="subtitle">지금 바꿀 수 있어요${available.length > 1 ? ' — 하나를 골라주세요' : ''}</p>
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
      <button id="coupon-submit" class="primary-btn">사장님께 요청</button>
    `
    : `
      <p class="subtitle">지금은 바꿀 수 있는 리워드가 없어요.<br />아래 시간에 다시 와주세요.</p>
      <ul class="reward-list">
        ${closed.map(rewardItemHtml).join('') || '<li class="reward-empty">등록된 리워드가 없어요</li>'}
      </ul>
    `;

  appEl.innerHTML = `
    <div class="screen coupon-screen">
      <button class="back-btn" id="back-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 5l-7 7 7 7"></path></svg>
        쿠폰 사용
      </button>
      <div class="coupon-ticket">
        <span class="coupon-icon" aria-hidden="true">🎟</span>
        <div>
          <div class="coupon-ticket-text">쿠폰 ${coupons.unused.length}장 중 1장</div>
          ${
            coupon.expiresAt
              ? `<div class="coupon-expiry${daysUntil(coupon.expiresAt) <= 7 ? ' is-urgent' : ''}">${esc(expiryLabel(coupon.expiresAt))}</div>`
              : ''
          }
        </div>
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
      <svg class="done-mark" width="84" height="84" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="18" fill="none" stroke="var(--accent)" stroke-width="1.2"></circle>
        <path d="M12 20.5l5.5 5.5L28 15" fill="none" stroke="var(--accent)" stroke-width="2.4"
              stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
      <div>
        <div class="done-title">사용 완료</div>
        <p class="subtitle">"${esc(info.rewardName || '리워드')}"로 교환됐어요.</p>
      </div>
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
      <button class="back-btn" id="back-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 5l-7 7 7 7"></path></svg>
        QR 스캔
      </button>
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
        <button type="button" id="scan-manual-link" class="link-btn">코드를 직접 입력할게요</button>
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
      <button class="back-btn" id="back-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 5l-7 7 7 7"></path></svg>
        코드 입력
      </button>
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
      <svg width="72" height="72" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="18" fill="none" stroke="var(--accent)" stroke-width="1.2"></circle>
        <circle cx="20" cy="20" r="12" fill="var(--accent)"></circle>
      </svg>
      <div>
        <div class="wait-title">사장님께 요청했어요</div>
        <p class="subtitle">"${esc(pending.rewardName)}" 교환을 승인해주실 때까지 기다려주세요.</p>
      </div>
      <div class="countdown" id="reward-countdown"></div>
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
