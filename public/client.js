// Color Panic - Client
// Single-page client for both host and player. Server is authoritative.

const socket = io();
const t = window.i18n.t;
const tInstr = window.i18n.instructionFrom;
const tColor = window.i18n.colorLoud;

// Language toggle buttons
document.querySelectorAll('.lang-btn').forEach((btn) => {
  btn.addEventListener('click', () => window.i18n.setLang(btn.dataset.lang));
});

// Initial color-btn label refresh (in case stored language != HTML default)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.color-btn').forEach((b) => {
    b.textContent = tColor(b.dataset.color);
  });
});

// Re-render dynamic content when language changes
window.addEventListener('languagechange', () => {
  // Refresh color-button labels
  document.querySelectorAll('.color-btn').forEach((b) => {
    b.textContent = tColor(b.dataset.color);
  });
  // Refresh difficulty badge
  const room = lastRoomState;
  if (room) {
    const meta = DIFF_META[room.difficulty] || DIFF_META.medium;
    const badge = document.getElementById('host-diff-badge');
    if (badge) badge.textContent = `${meta.emoji} ${t('diff.' + room.difficulty)}`;
  }
  // Refresh current round instruction if a round is active
  if (currentChallenge && currentChallenge.instructionMeta) {
    const hostInstr = document.getElementById('host-instruction');
    const playerInstr = document.getElementById('p-instruction');
    const txt = currentPhase === 'preview'
      ? previewInstructionText(currentChallenge)
      : answerInstruction(currentChallenge);
    if (hostInstr) hostInstr.textContent = txt;
    if (playerInstr) playerInstr.textContent = txt;
  }
});

// ---------- Screen routing ----------
const screens = document.querySelectorAll('.screen');
function show(id) { screens.forEach((s) => s.classList.toggle('active', s.id === id)); }
document.querySelectorAll('[data-back]').forEach((b) =>
  b.addEventListener('click', () => show(b.dataset.back))
);
document.getElementById('btn-host').onclick = () => createRoom();
document.getElementById('btn-player').onclick = () => show('join');

// ---------- State ----------
let myRole = null;
let myRoom = null;
let myName = null;
let myId = null;
let timerRAF = null;
let previewTimer = null;
let previewTickTimer = null;
let currentChallenge = null;
let currentPhase = null; // 'preview' | 'answer'
let lastRoomState = null;

const COLOR_HEX = { red: '#ff3b30', blue: '#0a84ff', green: '#34c759', yellow: '#ffd60a' };
const DIFF_META = {
  easy: { emoji: '🌱' },
  medium: { emoji: '⚡' },
  hard: { emoji: '🔥' },
};

// ---------- Host: create room ----------
async function createRoom() {
  socket.emit('host:create', null, async (res) => {
    if (!res || !res.ok) return;
    myRole = 'host';
    myRoom = res.code;
    document.getElementById('room-code').textContent = res.code;
    show('host-lobby');
    const urlEl = document.getElementById('join-url');
    urlEl.removeAttribute('data-i18n');
    try {
      const info = await fetch('/api/host-info').then((r) => r.json());
      const ip = info.ips[0] || location.hostname;
      urlEl.textContent = `http://${ip}:${info.port}`;
    } catch {
      urlEl.textContent = location.host;
    }
  });
}

document.querySelectorAll('.diff-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    socket.emit('host:set-difficulty', { difficulty: btn.dataset.diff });
  });
});

// ---------- Rounds selector (host lobby) ----------
const ROUNDS_MIN = 3;
const ROUNDS_MAX = 30;
let pendingRounds = 10; // optimistic UI value; reconciled by room:update

function setRoundsDisplay(n, bump) {
  const el = document.getElementById('rounds-value');
  if (!el) return;
  el.textContent = n;
  if (bump) {
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  document.getElementById('rounds-minus').disabled = n <= ROUNDS_MIN;
  document.getElementById('rounds-plus').disabled = n >= ROUNDS_MAX;
}

function bumpRounds(delta) {
  const next = Math.max(ROUNDS_MIN, Math.min(ROUNDS_MAX, pendingRounds + delta));
  if (next === pendingRounds) return;
  pendingRounds = next;
  setRoundsDisplay(next, true);
  socket.emit('host:set-rounds', { rounds: next });
}

// Tap = single step. Hold = repeat (400ms initial delay, then 80ms interval).
function bindRepeatButton(btn, delta) {
  let holdTimeout = null, repeatInterval = null, didHold = false;
  const start = (e) => {
    if (e.cancelable) e.preventDefault();
    didHold = false;
    holdTimeout = setTimeout(() => {
      didHold = true;
      repeatInterval = setInterval(() => bumpRounds(delta), 80);
    }, 400);
  };
  const stop = () => {
    clearTimeout(holdTimeout); holdTimeout = null;
    clearInterval(repeatInterval); repeatInterval = null;
  };
  btn.addEventListener('mousedown', start);
  btn.addEventListener('touchstart', start, { passive: false });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach((ev) =>
    btn.addEventListener(ev, stop)
  );
  // On click (no-hold), step once. If we already held & repeated, the click is suppressed.
  btn.addEventListener('click', () => { if (!didHold) bumpRounds(delta); });
}

bindRepeatButton(document.getElementById('rounds-minus'), -1);
bindRepeatButton(document.getElementById('rounds-plus'), +1);

document.getElementById('btn-start').onclick = () => socket.emit('host:start');
document.getElementById('btn-restart').onclick = () => socket.emit('host:restart');

// ---------- Player: join ----------
document.getElementById('btn-join').onclick = () => joinRoom();
document.getElementById('join-code').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
});
function joinRoom() {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  const name = document.getElementById('join-name').value.trim();
  const errEl = document.getElementById('join-error');
  errEl.textContent = '';
  if (code.length !== 4) return (errEl.textContent = t('join.error_code_4'));
  if (!name) return (errEl.textContent = t('join.error_name'));

  socket.emit('player:join', { code, name }, (res) => {
    if (!res || !res.ok) { errEl.textContent = res?.error || t('join.error_join'); return; }
    myRole = 'player';
    myRoom = res.code;
    myName = res.name;
    myId = res.id;
    document.getElementById('player-name-display').textContent = res.name;
    document.getElementById('p-name').textContent = res.name;
    show('player-wait');
  });
}

// ---------- Room updates ----------
socket.on('room:update', (room) => {
  lastRoomState = room;
  const meta = DIFF_META[room.difficulty] || DIFF_META.medium;
  const badge = document.getElementById('host-diff-badge');
  if (badge) badge.textContent = `${meta.emoji} ${t('diff.' + room.difficulty)}`;

  if (myRole === 'host') {
    document.querySelectorAll('.diff-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.diff === room.difficulty)
    );
    // Sync rounds display whenever the server's value differs (e.g. after difficulty change)
    if (room.totalRounds !== pendingRounds) {
      pendingRounds = room.totalRounds;
      setRoundsDisplay(pendingRounds, false);
    }
    renderHostLobby(room);
    renderHostScoreboard(room);
  } else if (myRole === 'player') {
    const me = room.players.find((p) => p.id === myId);
    if (me) {
      document.getElementById('p-score').textContent = me.score;
      updateStreakUI(me.streak);
    }
    document.getElementById('p-total').textContent = room.totalRounds;
  }
});

function updateStreakUI(streak) {
  const el = document.getElementById('p-streak');
  if (!el) return;
  if (!streak || streak === 0) { el.textContent = '—'; el.classList.remove('hot'); }
  else { el.textContent = streak >= 3 ? `🔥 ${streak}` : streak; el.classList.toggle('hot', streak >= 3); }
}

function renderHostLobby(room) {
  document.getElementById('player-count').textContent = room.players.length;
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  room.players.forEach((p) => {
    const li = document.createElement('li');
    li.textContent = p.name + (p.connected ? '' : ' 📴');
    list.appendChild(li);
  });
  document.getElementById('btn-start').disabled = room.players.length === 0;
}

function renderHostScoreboard(room) {
  const sb = document.getElementById('host-scoreboard');
  if (!sb) return;
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  sb.innerHTML = '';
  sorted.forEach((p, i) => {
    const li = document.createElement('li');
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
    const streakBadge = p.streak >= 3 ? `<span class="streak-badge">🔥 ${p.streak}</span>` : '';
    li.innerHTML = `
      <div class="player-info">
        <span>${medal}</span>
        <strong>${escapeHtml(p.name)}</strong>
        ${streakBadge}
        ${p.connected ? '' : `<span class="badge">${t('badge.offline')}</span>`}
      </div>
      <span class="score">${p.score}</span>`;
    sb.appendChild(li);
  });
}

// ---------- Round start ----------
socket.on('round:start', ({ round, totalRounds, durationMs, previewMs, isBoss, challenge }) => {
  currentChallenge = challenge;
  currentPhase = previewMs > 0 ? 'preview' : 'answer';
  clearPreviewTimers();

  if (myRole === 'host') {
    show('host-game');
    document.getElementById('host-round').textContent = round;
    document.getElementById('host-total').textContent = totalRounds;
    document.getElementById('boss-banner').style.display = isBoss ? 'block' : 'none';
    animateHostTimer(durationMs);
  } else if (myRole === 'player') {
    show('player-game');
    document.getElementById('p-round').textContent = round;
    document.getElementById('p-total').textContent = totalRounds;
    document.getElementById('p-boss-banner').style.display = isBoss ? 'block' : 'none';
    document.getElementById('p-progress').textContent = '';
    setFeedback('', '');
  }

  if (previewMs > 0) {
    runPreviewPhase(challenge, previewMs);
    previewTimer = setTimeout(() => runAnswerPhase(challenge), previewMs);
  } else {
    runAnswerPhase(challenge);
  }
});

function clearPreviewTimers() {
  if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
  if (previewTickTimer) { clearInterval(previewTickTimer); previewTickTimer = null; }
}

// ---------- Preview phase rendering ----------
function previewInstructionText(ch) {
  const c = ch.payload?.color;
  switch (ch.type) {
    case 'LAST_COLOR': return t('round.LAST_COLOR_preview');
    case 'MEMORY_SEQUENCE': return t('round.MEMORY_SEQUENCE_preview');
    case 'DRAWING': return t('round.DRAWING_watch');
    case 'DONT_TAP_UNTIL': return t('round.DONT_TAP_UNTIL_preview', { color: tColor(c) });
    default: return tInstr(ch.instructionMeta) || ch.instruction || '';
  }
}

function runPreviewPhase(ch, previewMs) {
  const hostInstr = document.getElementById('host-instruction');
  const playerInstr = document.getElementById('p-instruction');
  const hostStim = document.getElementById('host-stimulus');
  const playerStim = document.getElementById('p-stimulus');

  if (myRole === 'player') {
    // Disable buttons during preview UNLESS it's DONT_TAP_UNTIL (where tapping early = trap)
    const allowTaps = ch.type === 'DONT_TAP_UNTIL';
    document.querySelectorAll('.color-btn').forEach((b) => (b.disabled = !allowTaps));
  }

  const setInstr = (text) => {
    if (hostInstr) hostInstr.textContent = text;
    if (playerInstr) playerInstr.textContent = text;
  };

  setInstr(previewInstructionText(ch));

  if (ch.type === 'LAST_COLOR') {
    flashSequence([hostStim, playerStim], ch.payload.sequence, previewMs);
    return;
  }
  if (ch.type === 'MEMORY_SEQUENCE') {
    showMemoryChips([hostStim, playerStim], ch.payload.sequence);
    return;
  }
  if (ch.type === 'DRAWING') {
    flashShapes([hostStim, playerStim], ch.payload.items, previewMs);
    return;
  }
  if (ch.type === 'DONT_TAP_UNTIL') {
    runCountdown([hostStim, playerStim], previewMs, ch.payload.color);
    return;
  }
}

function flashSequence(targets, sequence, totalMs) {
  const slotMs = Math.floor(totalMs / sequence.length);
  let idx = 0;
  targets.forEach((el) => { if (el) el.innerHTML = `<div class="flash-box empty">${t('flash.watch')}</div>`; });

  const showNext = () => {
    if (idx >= sequence.length) {
      targets.forEach((el) => { if (el) el.innerHTML = `<div class="flash-box empty">${t('flash.dots')}</div>`; });
      return;
    }
    const c = sequence[idx++];
    targets.forEach((el) => {
      if (!el) return;
      el.innerHTML = `<div class="flash-box" style="background:${COLOR_HEX[c]};${c==='yellow'?'color:#1a0b2e;':''}">${tColor(c)}</div>`;
    });
    setTimeout(() => {
      // brief blank between flashes
      targets.forEach((el) => { if (el) el.innerHTML = '<div class="flash-box empty"></div>'; });
    }, Math.max(150, slotMs - 200));
    previewTickTimer = setTimeout(showNext, slotMs);
  };
  showNext();
}

function showMemoryChips(targets, sequence) {
  const html = `<div class="seq-chips">${sequence.map((c, i) => `
    <div class="seq-chip" style="background:${COLOR_HEX[c]};${c==='yellow'?'color:#1a0b2e;':''}">
      ${tColor(c).slice(0,3)}
      <div class="step-num">${i+1}</div>
    </div>
  `).join('')}</div>`;
  targets.forEach((el) => { if (el) el.innerHTML = html; });
}

function flashShapes(targets, items, totalMs) {
  const slotMs = Math.floor(totalMs / items.length);
  let idx = 0;
  const showNext = () => {
    if (idx >= items.length) {
      targets.forEach((el) => { if (el) el.innerHTML = '<div class="shape-flash" style="opacity:0.3;">…</div>'; });
      return;
    }
    const { shape, color } = items[idx++];
    targets.forEach((el) => {
      if (!el) return;
      el.innerHTML = `<div class="shape-flash" style="color:${COLOR_HEX[color]};">${shape}</div>`;
    });
    previewTickTimer = setTimeout(showNext, slotMs);
  };
  showNext();
}

function runCountdown(targets, totalMs, finalColor) {
  const start = Date.now();
  const tick = () => {
    const remaining = Math.max(0, totalMs - (Date.now() - start));
    const seconds = Math.ceil(remaining / 1000);
    if (remaining <= 0) return;
    targets.forEach((el) => {
      if (el) el.innerHTML = `<div class="countdown" key="${seconds}">${seconds}</div>`;
    });
    previewTickTimer = setTimeout(tick, 1000);
  };
  tick();
}

// ---------- Answer phase ----------
function runAnswerPhase(ch) {
  currentPhase = 'answer';
  const hostStim = document.getElementById('host-stimulus');
  const playerStim = document.getElementById('p-stimulus');

  // Set the final instruction (overrides preview instruction)
  const finalInstr = answerInstruction(ch);
  if (document.getElementById('host-instruction')) document.getElementById('host-instruction').textContent = finalInstr;
  if (document.getElementById('p-instruction')) document.getElementById('p-instruction').textContent = finalInstr;

  // Render stimulus
  renderStimulus(hostStim, ch, {});
  renderStimulus(playerStim, ch, {});

  if (myRole === 'player') {
    document.querySelectorAll('.color-btn').forEach((b) => (b.disabled = false));
    document.getElementById('p-progress').textContent = '';
    setFeedback('', '');
  }
}

function answerInstruction(ch) {
  switch (ch.type) {
    case 'LAST_COLOR': return t('round.LAST_COLOR_answer');
    case 'MEMORY_SEQUENCE': return t('round.MEMORY_SEQUENCE_answer');
    case 'DRAWING': return t('round.DRAWING_answer', { ordinal: window.i18n.ordinal(ch.payload.ordinal) });
    case 'DONT_TAP_UNTIL': return t('round.DONT_TAP_UNTIL_now', { color: tColor(ch.payload.color) });
    case 'ROULETTE': return t('round.ROULETTE_answer');
    default: return tInstr(ch.instructionMeta) || ch.instruction || '';
  }
}

// Render a stimulus element based on challenge type. `prog` carries per-player progress.
function renderStimulus(el, ch, prog) {
  if (!el) return;
  el.innerHTML = '';
  const { type, payload } = ch;

  // Types that hide their stimulus during the answer phase
  if (type === 'LAST_COLOR' || type === 'MEMORY_SEQUENCE') {
    el.innerHTML = `<div class="flash-box empty">${t('flash.tap_from_memory')}</div>`;
    return;
  }
  if (type === 'DRAWING') {
    el.innerHTML = `<div class="shape-flash" style="opacity:0.5;">${payload.ordinal} ?</div>`;
    return;
  }

  if (type === 'WORD_VS_COLOR') {
    el.innerHTML = `<span class="c-${payload.displayColor}">${tColor(payload.word)}</span>`;
    return;
  }
  if (type === 'AVOID') {
    el.innerHTML = `<span class="c-${payload.color}">🚫 ${tColor(payload.color)}</span>`;
    return;
  }
  if (type === 'OPPOSITE') {
    el.innerHTML = `<span class="c-${payload.color}">${tColor(payload.color)}</span> ➜ ?`;
    return;
  }
  if (type === 'SEQUENCE' || type === 'REVERSE_ORDER') {
    const seq = payload.sequence;
    el.innerHTML = renderSeqChips(seq, prog?.progress);
    return;
  }
  if (type === 'COUNT') {
    const current = prog?.count ?? 0;
    el.innerHTML = `<div class="count-display">
      <span class="c-${payload.color}">${tColor(payload.color)}</span>
      <span class="count-target">${current} / ${payload.target}</span>
    </div>`;
    return;
  }
  if (type === 'COLOR_NUMBER') {
    const phase = prog?.phase ?? 0;
    const cA = prog?.countA ?? 0;
    const cB = prog?.countB ?? 0;
    el.innerHTML = `<div class="count-display">
      <span class="c-${payload.colorA}" style="${phase===1?'opacity:0.4;':''}">${tColor(payload.colorA)}</span>
      <span class="count-target">${cA} / ${payload.countA}</span>
      <span style="opacity:0.5;">→</span>
      <span class="c-${payload.colorB}" style="${phase===0?'opacity:0.4;':''}">${tColor(payload.colorB)}</span>
      <span class="count-target">${cB} / ${payload.countB}</span>
    </div>`;
    return;
  }
  if (type === 'COLOR_MATH') {
    el.innerHTML = `
      <div class="math-expr">${payload.expr} = ?</div>
      <div class="math-legend">
        ${Object.entries(payload.legend).map(([n, c]) =>
          `<div class="item"><span class="swatch" style="background:${COLOR_HEX[c]};"></span>${n}</div>`
        ).join('')}
      </div>`;
    return;
  }
  if (type === 'ODD_ONE_OUT') {
    el.innerHTML = `<div class="odd-grid">${
      payload.grid.map((c) => `<div class="odd-cell" style="background:${COLOR_HEX[c]};"></div>`).join('')
    }</div>`;
    return;
  }
  if (type === 'MAJORITY') {
    el.innerHTML = `<div class="choice-prompt"><span class="emoji">👥</span>MOST</div>`;
    return;
  }
  if (type === 'MINORITY') {
    el.innerHTML = `<div class="choice-prompt"><span class="emoji">🕵️</span>FEWEST</div>`;
    return;
  }
  if (type === 'ROULETTE') {
    el.innerHTML = `<div class="choice-prompt"><span class="emoji">🎲</span>ROULETTE</div>`;
    return;
  }

  // EVERYONE_TAP / ONLY_PLAYER default
  el.innerHTML = `<span class="c-${payload.color}">${tColor(payload.color)}</span>`;
}

function renderSeqChips(seq, progress) {
  return `<div class="seq-chips">${seq.map((c, i) => {
    let cls = 'seq-chip';
    if (typeof progress === 'number') {
      if (i < progress) cls += ' done';
      else if (i === progress) cls += ' current';
    } else if (i === 0) cls += ' current';
    return `<div class="${cls}" style="background:${COLOR_HEX[c]};${c==='yellow'?'color:#1a0b2e;':''}">
      ${tColor(c).slice(0,3)}
      <div class="step-num">${i+1}</div>
    </div>`;
  }).join('')}</div>`;
}

function animateHostTimer(duration) {
  const fill = document.getElementById('host-timer-fill');
  if (!fill) return;
  const start = Date.now();
  cancelAnimationFrame(timerRAF);
  function tick() {
    const elapsed = Date.now() - start;
    const pct = Math.max(0, 1 - elapsed / duration);
    fill.style.width = (pct * 100).toFixed(1) + '%';
    if (pct > 0) timerRAF = requestAnimationFrame(tick);
  }
  tick();
}

// ---------- Player taps ----------
document.querySelectorAll('.color-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (myRole !== 'player') return;
    socket.emit('player:tap', { choice: btn.dataset.color });
  });
});

socket.on('player:feedback', (data) => {
  const { kind } = data;
  if (kind === 'correct') {
    document.querySelectorAll('.color-btn').forEach((b) => (b.disabled = true));
    const streak = data.streakBonus ? t('fb.streak_part', { bonus: data.streakBonus }) : '';
    setFeedback('correct', t('fb.correct_points', { points: data.points, streak }));
  } else if (kind === 'wrong') {
    document.querySelectorAll('.color-btn').forEach((b) => (b.disabled = true));
    setFeedback('wrong', t('fb.wrong_points', { points: data.points }));
  } else if (kind === 'submitted') {
    document.querySelectorAll('.color-btn').forEach((b) => (b.disabled = true));
    setFeedback('already', t('fb.locked_in'));
  } else if (kind === 'already') {
    setFeedback('already', t('fb.already'));
  } else if (kind === 'progress') {
    if (currentChallenge) {
      const stim = document.getElementById('p-stimulus');
      if (stim) renderStimulus(stim, currentChallenge, data);
    }
    const p = document.getElementById('p-progress');
    if (currentChallenge?.type === 'COLOR_NUMBER') {
      const need = data.phase === 0 ? currentChallenge.payload.colorA : currentChallenge.payload.colorB;
      p.textContent = t('fb.now_tap_color', { color: tColor(need) });
    } else if (typeof data.progress === 'number') {
      const total = currentChallenge?.payload?.sequence?.length || currentChallenge?.payload?.expected?.length || '?';
      p.textContent = t('fb.step_progress', { progress: data.progress, total });
    } else if (typeof data.count === 'number') {
      p.textContent = t('fb.taps_progress', { count: data.count, target: currentChallenge?.payload?.target || '?' });
    }
  }
});

function setFeedback(kind, text) {
  const el = document.getElementById('p-feedback');
  el.className = 'feedback ' + (kind || '');
  el.textContent = text || '';
}

// ---------- Round result ----------
socket.on('round:result', ({ round, challenge, summary, fastestId }) => {
  clearPreviewTimers();
  if (myRole === 'host') {
    show('host-result');
    const titleKey = challenge.isBoss ? 'result.round_x_boss_results' : 'result.round_x_results';
    const titleEl = document.getElementById('host-result-title');
    titleEl.removeAttribute('data-i18n');
    titleEl.textContent = t(titleKey, { round });
    document.getElementById('host-result-instruction').textContent =
      answerInstruction(challenge);

    document.getElementById('host-result-reveal').innerHTML = renderReveal(challenge);

    const list = document.getElementById('host-result-list');
    list.innerHTML = '';
    [...summary].sort((a, b) => b.score - a.score).forEach((p) => {
      const li = document.createElement('li');
      li.classList.add(p.result);
      if (p.fastest) li.classList.add('fastest');
      const icon = p.result === 'correct' ? '✅' : p.result === 'wrong' ? '❌' : '⏱';
      const streakBadge = p.streak >= 3 ? `<span class="streak-badge">🔥 ${p.streak}</span>` : '';
      li.innerHTML = `
        <div class="player-info">
          <span>${icon}</span>
          <strong>${escapeHtml(p.name)}</strong>
          ${p.fastest ? `<span class="badge">${t('fb.fastest_badge')}</span>` : ''}
          ${streakBadge}
        </div>
        <span class="score">${p.score}</span>`;
      list.appendChild(li);
    });
    document.getElementById('btn-restart').style.display = 'none';
  } else if (myRole === 'player') {
    document.querySelectorAll('.color-btn').forEach((b) => (b.disabled = true));
    const me = summary.find((p) => p.id === myId);
    if (me) {
      document.getElementById('p-score').textContent = me.score;
      updateStreakUI(me.streak);
      if (me.result === 'no-answer') setFeedback('late', t('fb.too_late'));
      else if (me.fastest) setFeedback('correct', t('fb.fastest'));
      else if (me.result === 'correct') setFeedback('correct', t('fb.correct'));
      else if (me.result === 'wrong') setFeedback('wrong', t('fb.wrong'));
    }
  }
});

// Build the "reveal" block on the result screen, depending on round type.
function renderReveal(ch) {
  const { type, payload, secret, reveal } = ch;

  const colorPill = (c) => `<span class="big-color" style="background:${COLOR_HEX[c]};${c==='yellow'?'color:#1a0b2e;':''}">${tColor(c)}</span>`;

  if (type === 'COLOR_MATH' && secret) {
    return `<div>${t('reveal.answer')} ${colorPill(secret.answer)}</div>`;
  }
  if (type === 'LAST_COLOR' && secret) {
    const seq = payload.sequence.map((c) =>
      `<span class="big-color" style="background:${COLOR_HEX[c]};${c==='yellow'?'color:#1a0b2e;':''};font-size:14px;padding:4px 10px;">${tColor(c)}</span>`
    ).join(' ');
    return `<div>${t('reveal.sequence')} ${seq}</div><div style="margin-top:8px;">${t('reveal.last')} ${colorPill(secret.answer)}</div>`;
  }
  if (type === 'DRAWING' && secret) {
    const shapes = payload.items.map((it, i) =>
      `<span style="color:${COLOR_HEX[it.color]};font-size:32px;margin:0 6px;${i===payload.askIndex?'text-shadow:0 0 8px white;':''}">${it.shape}</span>`
    ).join('');
    const ord = window.i18n.ordinal(payload.ordinal);
    return `<div>${shapes}</div><div style="margin-top:8px;">${t('reveal.shape_was', { ordinal: ord })} ${colorPill(secret.answer)}</div>`;
  }
  if (type === 'ROULETTE' && reveal) {
    return `<div>${t('reveal.roulette_winner')} ${colorPill(reveal.winner)}</div>`;
  }
  if ((type === 'MAJORITY' || type === 'MINORITY') && reveal) {
    return renderTally(reveal, type);
  }
  return '';
}

function renderTally(reveal, type) {
  const tally = reveal.tally || {};
  const winners = new Set(reveal.winners || []);
  const max = Math.max(1, ...Object.values(tally));
  const label = type === 'MAJORITY' ? t('reveal.most_picked') : t('reveal.fewest_picked');
  const rows = ['red', 'blue', 'green', 'yellow']
    .map((c) => {
      const count = tally[c] || 0;
      const pct = (count / max) * 100;
      const winCls = winners.has(c) ? ' winner' : '';
      return `<div class="tally-row${winCls}">
        <div class="label c-${c}">${tColor(c)}</div>
        <div class="tally-bar"><div class="tally-fill" style="width:${pct}%;background:${COLOR_HEX[c]};"></div></div>
        <div class="count">${count}</div>
      </div>`;
    }).join('');
  return `<div style="font-size:14px;color:var(--muted);margin-bottom:6px;">${label}</div><div class="tally-bars">${rows}</div>`;
}

// ---------- Game over ----------
socket.on('game:over', ({ scoreboard, winner }) => {
  if (myRole === 'host') {
    show('host-result');
    const goTitleEl = document.getElementById('host-result-title');
    goTitleEl.removeAttribute('data-i18n');
    goTitleEl.textContent =
      winner ? t('result.x_wins', { name: winner.name }) : t('result.game_over');
    document.getElementById('host-result-instruction').textContent = t('result.final_scoreboard');
    document.getElementById('host-result-reveal').innerHTML = '';
    const list = document.getElementById('host-result-list');
    list.innerHTML = '';
    scoreboard.forEach((p, i) => {
      const li = document.createElement('li');
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎖';
      li.innerHTML = `
        <div class="player-info">
          <span style="font-size:24px;">${medal}</span>
          <strong>${escapeHtml(p.name)}</strong>
        </div>
        <span class="score">${p.score}</span>`;
      list.appendChild(li);
    });
    document.getElementById('btn-restart').style.display = 'block';
  } else if (myRole === 'player') {
    show('player-over');
    const me = scoreboard.find((p) => p.id === myId);
    const myRank = me ? scoreboard.indexOf(me) + 1 : null;
    const isWinner = winner && winner.id === myId;
    const resEl = document.getElementById('player-over-result');
    if (isWinner) resEl.innerHTML = `<span class="crown">👑</span>${t('result.you_won')}`;
    else if (myRank) resEl.innerHTML = t('result.finished_rank', { rank: myRank, score: me.score });
    else resEl.textContent = t('result.thanks');

    const list = document.getElementById('player-final');
    list.innerHTML = '';
    scoreboard.forEach((p, i) => {
      const li = document.createElement('li');
      if (p.id === myId) li.classList.add('you');
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      li.innerHTML = `
        <div class="player-info">
          <span>${medal}</span>
          <strong>${escapeHtml(p.name)}</strong>
        </div>
        <span class="score">${p.score}</span>`;
      list.appendChild(li);
    });
  }
});

socket.on('game:reset', () => {
  clearPreviewTimers();
  if (myRole === 'host') show('host-lobby');
  else if (myRole === 'player') show('player-wait');
});

socket.on('room:closed', ({ reason }) => {
  alert((reason || t('room.closed_default')) + '. ' + t('room.closed_suffix'));
  myRole = null;
  myRoom = null;
  show('home');
});

socket.on('disconnect', () => {
  if (myRole) console.warn('Disconnected, attempting reconnect…');
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
