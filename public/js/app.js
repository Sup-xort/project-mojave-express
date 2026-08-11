const appEl = document.getElementById('app');
const bannerEl = document.getElementById('banner');

let rewardPollTimer = null;
let rewardTickTimer = null;
let bannerTimer = null;

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

function flash(message, kind = 'info') {
  bannerEl.textContent = message;
  bannerEl.className = `banner banner-${kind}`;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => bannerEl.classList.add('hidden'), 3200);
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
      flash(`스탬프 ${result.added}개 적립됐어요!`, 'success');
    } catch (err) {
      flash(err.message, 'error');
    }
  }

  await goHome();
}

// ---- 화면: 가입/로그인 ----

function renderAuth(prefillNickname, mode) {
  stopRewardPoll();
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

// 다음 목표: 아직 못 모은 것 중 가장 적은 스탬프가 필요한 리워드.
// 전부 모았다면 가장 비싼 리워드를 목표(가득 찬 링)로 보여준다.
function nextTarget(stamps, rewards) {
  if (!rewards.length) return null;
  const ahead = rewards.map((r) => r.cost).filter((c) => c > stamps);
  if (ahead.length) return Math.min(...ahead);
  return Math.max(...rewards.map((r) => r.cost));
}

function stampGridHtml(stamps, rewards) {
  const target = nextTarget(stamps, rewards);

  if (!target || target > 30) {
    const shown = Math.min(stamps, 50);
    let dots = '';
    for (let i = 0; i < shown; i += 1) dots += '<span class="dot filled"></span>';
    const extra = stamps - shown;
    return `<div class="stamp-plain">${dots}${extra > 0 ? `<span class="dot-extra">+${extra}</span>` : ''}</div>`;
  }

  let cells = '';
  for (let i = 0; i < target; i += 1) {
    const filled = i < stamps;
    const isNew = filled && i === stamps - 1;
    cells += `<span class="dot${filled ? ' filled' : ''}${isNew ? ' is-new' : ''}"></span>`;
  }
  return `<div class="stamp-grid">${cells}</div>`;
}

function rewardItemHtml(r, stamps) {
  const affordable = r.activeNow && stamps >= r.cost;
  const cls = r.activeNow ? '' : 'reward-inactive';
  return `
    <li class="reward-item ${cls}">
      <div class="reward-main">
        <span class="reward-name">${esc(r.name)}</span>
        <span class="reward-cost">${r.cost}개</span>
      </div>
      <div class="reward-sub">
        <span class="reward-window">${r.activeNow ? '지금 가능' : `${esc(r.window)} 운영`}</span>
        ${
          r.activeNow
            ? `<button class="reward-request-btn" data-id="${r.id}" ${affordable ? '' : 'disabled'}>교환 요청</button>`
            : ''
        }
      </div>
    </li>
  `;
}

async function goHome() {
  try {
    const [me, rewards] = await Promise.all([api.me(), api.rewards()]);
    renderHome(me, rewards);
  } catch (err) {
    if (err.status === 401) {
      renderAuth(localStorage.getItem('me_last_nickname') || '');
    } else {
      flash(err.message, 'error');
    }
  }
}

function renderHome(me, rewards) {
  stopRewardPoll();

  if (me.pendingRedemption) {
    renderRewardWait(me.pendingRedemption);
    return;
  }

  const target = nextTarget(me.stamps, rewards);
  const remain = target ? Math.max(0, target - me.stamps) : null;
  const remainMsg = target
    ? (remain === 0 ? '리워드를 받을 준비가 되었습니다' : `${remain}개 더 모으면 리워드`)
    : '';

  appEl.innerHTML = `
    <div class="screen home-screen">
      <div class="home-topbar">
        <div class="brand-mark">${markSvg}MOJAVE EXPRESS</div>
        <div class="home-topbar-actions">
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
          <span class="stamp-count-num">${me.stamps}</span>
          ${target ? `<span class="stamp-count-den">/ ${target}</span>` : ''}
        </div>
        ${stampGridHtml(me.stamps, rewards)}
        ${remainMsg ? `<div class="stamp-remain">${remainMsg}</div>` : ''}
      </div>

      <button id="stamp-manual-btn" class="stamp-manual-btn">코드 입력해서 적립하기</button>

      <section class="rewards-section">
        <h2>리워드</h2>
        <ul class="reward-list">
          ${rewards.map((r) => rewardItemHtml(r, me.stamps)).join('') || '<li class="reward-empty">등록된 리워드가 없어요</li>'}
        </ul>
      </section>
    </div>
  `;

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await api.logout();
    } catch (e) {
      // 세션이 이미 끊겼어도 로그인 화면으로 보내면 그만이다.
    }
    localStorage.removeItem('me_last_nickname');
    renderAuth('');
  });

  document.getElementById('stamp-manual-btn').addEventListener('click', renderManualStampEntry);

  document.querySelectorAll('.reward-request-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const req = await api.rewardRequest(Number(btn.dataset.id));
        renderRewardWait(req);
      } catch (err) {
        flash(err.message, 'error');
        if (err.code === 'REWARD_UNAVAILABLE') {
          await goHome();
        } else {
          btn.disabled = false;
        }
      }
    });
  });
}

// ---- 화면: 수동 코드 입력 (카메라 권한 거부 시 대안, plan.md 8.3) ----

function renderManualStampEntry() {
  appEl.innerHTML = `
    <div class="screen scan-screen">
      <button class="back-btn" id="back-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 5l-7 7 7 7"></path></svg>
        코드 입력
      </button>
      <p class="subtitle">매장 화면 하단에 표시된 코드를 입력해주세요.</p>
      <form id="stamp-form">
        <div class="scan-body">
          <div class="scan-frame">
            <span class="corner corner-tl"></span>
            <span class="corner corner-tr"></span>
            <span class="corner corner-bl"></span>
            <span class="corner corner-br"></span>
            <input id="f-token" type="text" autocomplete="off" placeholder="코드" required />
          </div>
          <div class="scan-hint">카운터의 코드를 입력하세요</div>
          <button type="submit" id="stamp-submit" class="primary-btn">적립하기</button>
        </div>
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
      flash(`스탬프 ${result.added}개 적립됐어요!`, 'success');
      await goHome();
    } catch (err) {
      flash(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ---- 화면: 리워드 교환 대기 (plan.md 5.3) ----

function renderRewardWait(pending) {
  stopRewardPoll();

  const render = () => {
    const remain = Math.max(0, pending.expiresAt - Math.floor(Date.now() / 1000));
    const mm = String(Math.floor(remain / 60)).padStart(2, '0');
    const ss = String(remain % 60).padStart(2, '0');
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
        <div class="countdown">${mm}:${ss}</div>
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
  };

  render();
  rewardTickTimer = setInterval(render, 1000);

  rewardPollTimer = setInterval(async () => {
    try {
      const status = await api.rewardStatus();
      if (status.status === 'approved') {
        stopRewardPoll();
        flash('교환이 완료됐어요!', 'success');
        await goHome();
      } else if (status.status !== 'pending') {
        stopRewardPoll();
        if (status.status === 'expired') flash('요청이 만료됐어요', 'error');
        await goHome();
      }
    } catch (err) {
      stopRewardPoll();
      if (err.status === 401) renderAuth(localStorage.getItem('me_last_nickname') || '');
      else flash(err.message, 'error');
    }
  }, 3000);
}

init();
