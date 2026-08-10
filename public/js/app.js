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

function renderAuth(prefillNickname) {
  stopRewardPoll();
  const hasNickname = !!prefillNickname;
  appEl.innerHTML = `
    <div class="screen auth-screen">
      <h1>모하비 익스프레스</h1>
      <p class="subtitle">스탬프 카드</p>
      <div class="tabs">
        <button class="tab-btn ${hasNickname ? '' : 'active'}" data-tab="signup">가입하기</button>
        <button class="tab-btn ${hasNickname ? 'active' : ''}" data-tab="login">로그인</button>
      </div>
      <form id="auth-form" class="card">
        <label>별명
          <input id="f-nickname" type="text" maxlength="12" autocomplete="off"
                 value="${esc(prefillNickname)}" placeholder="1~12자" required />
        </label>
        <label>PIN (숫자 4자리)
          <input id="f-pin" type="password" inputmode="numeric" pattern="[0-9]*"
                 maxlength="4" autocomplete="off" required />
        </label>
        <button type="submit" id="auth-submit">${hasNickname ? '로그인' : '가입하기'}</button>
      </form>
      <p class="hint">이름·전화번호는 받지 않아요. 별명과 PIN만으로 이용해요.<br />
      PIN을 잊으면 계정을 되찾을 방법이 없으니 잘 기억해주세요.</p>
    </div>
  `;

  let mode = hasNickname ? 'login' : 'signup';
  const submitBtn = document.getElementById('auth-submit');
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      submitBtn.textContent = mode === 'login' ? '로그인' : '가입하기';
    });
  });

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = document.getElementById('f-nickname').value;
    const pin = document.getElementById('f-pin').value;
    submitBtn.disabled = true;
    try {
      const me = mode === 'login' ? await api.login(nickname, pin) : await api.signup(nickname, pin);
      await afterAuth(me);
    } catch (err) {
      flash(err.message, 'error');
      submitBtn.disabled = false;
    }
  });
}

function renderFatal(err) {
  appEl.innerHTML = `<div class="screen center-loading">${esc(err.message || '오류가 발생했어요')}</div>`;
}

// ---- 화면: 홈 ----

function stampGridHtml(stamps) {
  const shown = Math.min(stamps, 50);
  let dots = '';
  for (let i = 0; i < shown; i += 1) dots += '<span class="dot filled"></span>';
  const extra = stamps - shown;
  return `<div class="stamp-grid">${dots}${extra > 0 ? `<span class="dot-extra">+${extra}</span>` : ''}</div>`;
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

  appEl.innerHTML = `
    <div class="screen home-screen">
      <header class="home-header">
        <div>
          <div class="home-nickname">${esc(me.nickname)} 님</div>
          <div class="home-cardno">전표번호 ${esc(me.cardNo || '')}</div>
        </div>
        <button id="logout-btn" class="link-btn">로그아웃</button>
      </header>

      <div class="card stamp-card">
        <div class="stamp-count">${me.stamps}<span class="stamp-unit">개</span></div>
        ${stampGridHtml(me.stamps)}
        <button id="stamp-manual-btn" class="primary-btn">코드 입력해서 적립하기</button>
      </div>

      <section class="rewards-section">
        <h2>리워드</h2>
        <ul class="reward-list">
          ${rewards.map((r) => rewardItemHtml(r, me.stamps)).join('') || '<li class="reward-empty">등록된 리워드가 없어요</li>'}
        </ul>
      </section>
    </div>
  `;

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
    <div class="screen">
      <button class="back-btn" id="back-btn">&larr; 뒤로</button>
      <h1>코드 입력</h1>
      <p class="subtitle">매장 화면 하단에 표시된 코드를 입력해주세요.</p>
      <form id="stamp-form" class="card">
        <label>코드
          <input id="f-token" type="text" autocomplete="off" required />
        </label>
        <button type="submit" id="stamp-submit">적립하기</button>
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
        <h1>사장님께 요청했어요</h1>
        <p class="subtitle">"${esc(pending.rewardName)}" 교환을 승인해주실 때까지 기다려주세요.</p>
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
