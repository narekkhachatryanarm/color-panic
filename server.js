// Color Panic - Server
// Authoritative game state. Clients only send actions.

const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const { Server } = require('socket.io');

const PORT = 3344;
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Constants ----------
const COLORS = ['red', 'blue', 'green', 'yellow'];
const OPPOSITES = { red: 'green', green: 'red', blue: 'yellow', yellow: 'blue' };
const NUM_TO_COLOR = { 1: 'red', 2: 'blue', 3: 'green', 4: 'yellow' };
const SHAPES = ['●', '■', '▲', '★', '♦'];

const STREAK_BONUS_THRESHOLD = 3;
const BOSS_INTERVAL = 5;
const BOSS_DURATION_MULT = 1.5;
const BOSS_POINTS_MULT = 2;

// ---------- Difficulty profiles ----------
// `durationMult` scales ALL round durations (including per-type overrides).
// `previewMult` scales the preview phase, with a 1200ms minimum so colors stay readable.
// `resultDuration` is the pause between rounds (results screen).
const DIFFICULTIES = {
  easy: {
    rounds: 8, baseDuration: 6000, resultDuration: 3000,
    durationMult: 1.15, previewMult: 1.1,
    types: [
      'EVERYONE_TAP', 'AVOID', 'ONLY_PLAYER', 'OPPOSITE',
      'ODD_ONE_OUT', 'COLOR_MATH', 'LAST_COLOR',
    ],
  },
  medium: {
    rounds: 10, baseDuration: 5000, resultDuration: 2500,
    durationMult: 1.0, previewMult: 1.0,
    types: [
      'EVERYONE_TAP', 'ONLY_PLAYER', 'AVOID', 'WORD_VS_COLOR', 'OPPOSITE',
      'COUNT', 'ODD_ONE_OUT', 'COLOR_MATH', 'LAST_COLOR', 'DONT_TAP_UNTIL',
      'MAJORITY', 'MINORITY', 'ROULETTE',
    ],
  },
  hard: {
    rounds: 12, baseDuration: 3500, resultDuration: 1600,
    durationMult: 0.65, previewMult: 0.75,
    types: [
      'ONLY_PLAYER', 'AVOID', 'WORD_VS_COLOR', 'OPPOSITE',
      'SEQUENCE', 'COUNT', 'EVERYONE_TAP', 'ODD_ONE_OUT',
      'LAST_COLOR', 'COLOR_MATH', 'DONT_TAP_UNTIL',
      'REVERSE_ORDER', 'MEMORY_SEQUENCE', 'COLOR_NUMBER',
      'MAJORITY', 'MINORITY', 'DRAWING',
    ],
  },
};

const PREVIEW_MIN_MS = 1200; // safety floor so even Hard previews stay readable
const ROUNDS_MIN = 3;
const ROUNDS_MAX = 30;

// Types eligible to appear on boss rounds (must be harder ones)
const BOSS_TYPES = [
  'SEQUENCE', 'MEMORY_SEQUENCE', 'REVERSE_ORDER', 'COLOR_NUMBER',
  'DRAWING', 'COLOR_MATH', 'WORD_VS_COLOR',
];

// ---------- Helpers ----------
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function distinctColors(n) {
  return shuffle(COLORS).slice(0, n);
}
function randSequence(len) {
  const seq = [];
  for (let i = 0; i < len; i++) {
    let c;
    do { c = pick(COLORS); } while (i > 0 && c === seq[i - 1]);
    seq.push(c);
  }
  return seq;
}

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms[code]);
  return code;
}

// ===================================================================
// ROUND-TYPE DEFINITIONS
// Each type may define:
//   build(room)           -> { instruction, payload, secret?, durationMs?, previewMs?, scoring?, deferredScoring? }
//   initAnswer()          -> initial per-player answer state
//   evaluateTap(player, choice, state, ch, meta) -> { done, correct, kind?, ... }
//   finalize(room, ch, answers) -> sets ans.correct for deferred-scoring types
// ===================================================================
const TYPES = {

  EVERYONE_TAP: {
    build() {
      const color = pick(COLORS);
      return {
        instruction: `Everyone tap ${color.toUpperCase()}!`,
        instructionMeta: { key: 'EVERYONE_TAP', params: { color } },
        payload: { color },
      };
    },
    evaluateTap(p, c, s, ch) { return { done: true, correct: c === ch.payload.color }; },
  },

  ONLY_PLAYER: {
    build(room) {
      const players = Array.from(room.players.values());
      const target = pick(players);
      const color = pick(COLORS);
      return {
        instruction: `Only ${target.name} tap ${color.toUpperCase()}!`,
        instructionMeta: { key: 'ONLY_PLAYER', params: { name: target.name, color } },
        payload: { color, targetId: target.id, targetName: target.name },
      };
    },
    evaluateTap(player, c, s, ch) {
      if (player.id === ch.payload.targetId) return { done: true, correct: c === ch.payload.color };
      return { done: true, correct: false };
    },
  },

  AVOID: {
    build() {
      const color = pick(COLORS);
      return {
        instruction: `Do NOT tap ${color.toUpperCase()}!`,
        instructionMeta: { key: 'AVOID', params: { color } },
        payload: { color },
      };
    },
    evaluateTap(p, c, s, ch) { return { done: true, correct: c !== ch.payload.color }; },
  },

  WORD_VS_COLOR: {
    build() {
      const word = pick(COLORS);
      let dc = pick(COLORS);
      while (dc === word) dc = pick(COLORS);
      return {
        instruction: `Tap the WORD, not the color!`,
        instructionMeta: { key: 'WORD_VS_COLOR', params: {} },
        payload: { word, displayColor: dc },
      };
    },
    evaluateTap(p, c, s, ch) { return { done: true, correct: c === ch.payload.word }; },
  },

  OPPOSITE: {
    build() {
      const color = pick(COLORS);
      return {
        instruction: `Tap the OPPOSITE of ${color.toUpperCase()}!`,
        instructionMeta: { key: 'OPPOSITE', params: { color } },
        payload: { color, opposite: OPPOSITES[color] },
      };
    },
    evaluateTap(p, c, s, ch) { return { done: true, correct: c === ch.payload.opposite }; },
  },

  SEQUENCE: {
    build() {
      return {
        instruction: 'Tap this sequence in order!',
        instructionMeta: { key: 'SEQUENCE', params: {} },
        payload: { sequence: randSequence(3) },
        durationMs: 7000,
        scoring: { correct: 20 },
      };
    },
    initAnswer: () => ({ progress: 0 }),
    evaluateTap(p, c, st, ch) {
      const expected = ch.payload.sequence[st.progress];
      if (c === expected) {
        st.progress++;
        if (st.progress >= ch.payload.sequence.length) return { done: true, correct: true };
        return { done: false, correct: false, kind: 'progress', progress: st.progress };
      }
      return { done: true, correct: false };
    },
  },

  COUNT: {
    build() {
      const color = pick(COLORS);
      const target = 3 + Math.floor(Math.random() * 2);
      return {
        instruction: `Tap ${color.toUpperCase()} exactly ${target} times!`,
        instructionMeta: { key: 'COUNT', params: { color, target } },
        payload: { color, target },
        durationMs: 6000,
        scoring: { correct: 15 },
      };
    },
    initAnswer: () => ({ count: 0 }),
    evaluateTap(p, c, st, ch) {
      if (c !== ch.payload.color) return { done: true, correct: false };
      st.count++;
      if (st.count === ch.payload.target) return { done: true, correct: true };
      if (st.count > ch.payload.target) return { done: true, correct: false };
      return { done: false, correct: false, kind: 'progress', count: st.count };
    },
  },

  // ===== NEW =====

  // 2. LAST_COLOR — sequence flashes during preview, then tap the LAST one
  LAST_COLOR: {
    build() {
      const seq = randSequence(4);
      return {
        instruction: 'Watch the colors flash…',
        instructionMeta: { key: 'LAST_COLOR', params: {} },
        payload: { sequence: seq },
        secret: { answer: seq[seq.length - 1] },
        previewMs: 3600, // ~900ms per color
        durationMs: 6000,
      };
    },
    evaluateTap(p, c, s, ch) { return { done: true, correct: c === ch.secret.answer }; },
  },

  // 3. COLOR_MATH — solve a math problem, tap color of the answer
  COLOR_MATH: {
    build() {
      const result = 1 + Math.floor(Math.random() * 4); // 1..4
      const op = pick(['+', '-']);
      let a, b;
      if (op === '+') {
        a = Math.floor(Math.random() * (result + 1));
        if (a === 0) a = 1; // avoid trivial 0+x
        if (a > result) a = result;
        b = result - a;
      } else {
        a = result + 1 + Math.floor(Math.random() * 5); // a > result
        b = a - result;
      }
      return {
        instruction: `What is ${a} ${op} ${b}?`,
        instructionMeta: { key: 'COLOR_MATH', params: { a, op, b } },
        payload: { expr: `${a} ${op} ${b}`, legend: NUM_TO_COLOR },
        secret: { answer: NUM_TO_COLOR[result] },
      };
    },
    evaluateTap(p, c, s, ch) { return { done: true, correct: c === ch.secret.answer }; },
  },

  // 4. MAJORITY — tap what most others will tap (deferred scoring)
  MAJORITY: {
    build() {
      return {
        instruction: 'Tap what MOST players will tap!',
        instructionMeta: { key: 'MAJORITY', params: {} },
        payload: { mode: 'majority' },
        deferredScoring: true,
      };
    },
    initAnswer: () => ({ choice: null }),
    evaluateTap(p, c, st) { st.choice = c; return { done: true, correct: null, deferred: true }; },
    finalize(room, ch, answers) {
      const tally = {};
      for (const a of Object.values(answers)) {
        if (a.done && a.state.choice) tally[a.state.choice] = (tally[a.state.choice] || 0) + 1;
      }
      const counts = Object.values(tally);
      if (counts.length === 0) { ch._reveal = { tally: {} }; return; }
      const maxCount = Math.max(...counts);
      const winners = new Set(Object.keys(tally).filter((k) => tally[k] === maxCount));
      for (const a of Object.values(answers)) {
        if (a.done) a.correct = winners.has(a.state.choice);
      }
      ch._reveal = { tally, winners: [...winners] };
    },
  },

  // 5. MINORITY — tap what fewest others will tap (deferred scoring)
  MINORITY: {
    build() {
      return {
        instruction: 'Tap what FEWEST players will tap!',
        instructionMeta: { key: 'MINORITY', params: {} },
        payload: { mode: 'minority' },
        deferredScoring: true,
      };
    },
    initAnswer: () => ({ choice: null }),
    evaluateTap(p, c, st) { st.choice = c; return { done: true, correct: null, deferred: true }; },
    finalize(room, ch, answers) {
      const tally = {};
      for (const a of Object.values(answers)) {
        if (a.done && a.state.choice) tally[a.state.choice] = (tally[a.state.choice] || 0) + 1;
      }
      const counts = Object.values(tally);
      if (counts.length === 0) { ch._reveal = { tally: {} }; return; }
      const minCount = Math.min(...counts);
      const winners = new Set(Object.keys(tally).filter((k) => tally[k] === minCount));
      for (const a of Object.values(answers)) {
        if (a.done) a.correct = winners.has(a.state.choice);
      }
      ch._reveal = { tally, winners: [...winners] };
    },
  },

  // 6. MEMORY_SEQUENCE — 5 colors shown briefly, then tap from memory
  MEMORY_SEQUENCE: {
    build() {
      return {
        instruction: 'Memorize this sequence!',
        instructionMeta: { key: 'MEMORY_SEQUENCE', params: {} },
        payload: { sequence: randSequence(5) },
        previewMs: 3500,
        durationMs: 9000,
        scoring: { correct: 30 },
      };
    },
    initAnswer: () => ({ progress: 0 }),
    evaluateTap(p, c, st, ch) {
      const expected = ch.payload.sequence[st.progress];
      if (c === expected) {
        st.progress++;
        if (st.progress >= ch.payload.sequence.length) return { done: true, correct: true };
        return { done: false, correct: false, kind: 'progress', progress: st.progress };
      }
      return { done: true, correct: false };
    },
  },

  // 7. DONT_TAP_UNTIL — wait through preview, THEN tap the named color
  DONT_TAP_UNTIL: {
    build() {
      const color = pick(COLORS);
      return {
        instruction: `Wait, THEN tap ${color.toUpperCase()}!`,
        instructionMeta: { key: 'DONT_TAP_UNTIL', params: { color } },
        payload: { color },
        previewMs: 3000, // wait period
        durationMs: 6000,
      };
    },
    evaluateTap(p, c, s, ch, meta) {
      if (meta.elapsedMs < ch.previewMs) return { done: true, correct: false }; // tapped too early
      return { done: true, correct: c === ch.payload.color };
    },
  },

  // 9. ODD_ONE_OUT — 4 squares, 3 same color + 1 different. Tap the odd color.
  ODD_ONE_OUT: {
    build() {
      const [majority, odd] = distinctColors(2);
      const grid = shuffle([majority, majority, majority, odd]);
      return {
        instruction: 'Find the ODD one out!',
        instructionMeta: { key: 'ODD_ONE_OUT', params: {} },
        payload: { grid, odd },
      };
    },
    evaluateTap(p, c, s, ch) { return { done: true, correct: c === ch.payload.odd }; },
  },

  // 10. REVERSE_ORDER — show 3-color sequence, tap it BACKWARDS
  REVERSE_ORDER: {
    build() {
      const seq = randSequence(3);
      return {
        instruction: 'Tap the sequence BACKWARDS!',
        instructionMeta: { key: 'REVERSE_ORDER', params: {} },
        payload: { sequence: seq, expected: [...seq].reverse() },
        durationMs: 7000,
        scoring: { correct: 25 },
      };
    },
    initAnswer: () => ({ progress: 0 }),
    evaluateTap(p, c, st, ch) {
      const expected = ch.payload.expected[st.progress];
      if (c === expected) {
        st.progress++;
        if (st.progress >= ch.payload.expected.length) return { done: true, correct: true };
        return { done: false, correct: false, kind: 'progress', progress: st.progress };
      }
      return { done: true, correct: false };
    },
  },

  // 11. COLOR_NUMBER — "Tap RED 3, then BLUE 1"
  COLOR_NUMBER: {
    build() {
      const [colorA, colorB] = distinctColors(2);
      const countA = 2 + Math.floor(Math.random() * 2); // 2-3
      const countB = 1 + Math.floor(Math.random() * 2); // 1-2
      return {
        instruction: `Tap ${colorA.toUpperCase()} ${countA}×, then ${colorB.toUpperCase()} ${countB}×!`,
        instructionMeta: { key: 'COLOR_NUMBER', params: { colorA, countA, colorB, countB } },
        payload: { colorA, countA, colorB, countB },
        durationMs: 8000,
        scoring: { correct: 25 },
      };
    },
    initAnswer: () => ({ phase: 0, countA: 0, countB: 0 }),
    evaluateTap(p, c, st, ch) {
      const { colorA, countA, colorB, countB } = ch.payload;
      if (st.phase === 0) {
        if (c !== colorA) return { done: true, correct: false };
        st.countA++;
        if (st.countA === countA) {
          st.phase = 1;
          return { done: false, correct: false, kind: 'progress', countA: st.countA, phase: 1 };
        }
        if (st.countA > countA) return { done: true, correct: false };
        return { done: false, correct: false, kind: 'progress', countA: st.countA, phase: 0 };
      } else {
        if (c !== colorB) return { done: true, correct: false };
        st.countB++;
        if (st.countB === countB) return { done: true, correct: true };
        if (st.countB > countB) return { done: true, correct: false };
        return { done: false, correct: false, kind: 'progress', countA: st.countA, countB: st.countB, phase: 1 };
      }
    },
  },

  // 18. ROULETTE — winning color picked randomly after taps
  ROULETTE: {
    build() {
      return {
        instruction: '🎲 Roulette! Tap any color — answer revealed after.',
        instructionMeta: { key: 'ROULETTE', params: {} },
        payload: { mode: 'roulette' },
        deferredScoring: true,
      };
    },
    initAnswer: () => ({ choice: null }),
    evaluateTap(p, c, st) { st.choice = c; return { done: true, correct: null, deferred: true }; },
    finalize(room, ch, answers) {
      const winner = pick(COLORS);
      for (const a of Object.values(answers)) {
        if (a.done) a.correct = a.state.choice === winner;
      }
      ch._reveal = { winner };
    },
  },

  // 19. DRAWING — shapes shown briefly, then asked "what color was the Nth shape?"
  DRAWING: {
    build() {
      const len = 4;
      const items = [];
      for (let i = 0; i < len; i++) {
        items.push({ shape: pick(SHAPES), color: pick(COLORS) });
      }
      const askIndex = Math.floor(Math.random() * len);
      const ordinals = ['1st', '2nd', '3rd', '4th'];
      return {
        instruction: 'Memorize the shapes!',
        instructionMeta: { key: 'DRAWING', params: { ordinal: ordinals[askIndex] } },
        payload: { items, askIndex, ordinal: ordinals[askIndex] },
        secret: { answer: items[askIndex].color },
        previewMs: 3600,
        durationMs: 7500,
        scoring: { correct: 20 },
      };
    },
    evaluateTap(p, c, s, ch) { return { done: true, correct: c === ch.secret.answer }; },
  },
};

// ---------- Challenge builder ----------
function buildChallenge(room) {
  const diff = DIFFICULTIES[room.difficulty] || DIFFICULTIES.medium;
  const isBoss = room.round > 0 && room.round % BOSS_INTERVAL === 0;

  let pool = isBoss ? BOSS_TYPES : diff.types;
  let typeKey = pick(pool);
  if (typeKey === 'ONLY_PLAYER' && room.players.size === 0) typeKey = 'EVERYONE_TAP';

  const type = TYPES[typeKey];
  const built = type.build(room);

  const durMult = diff.durationMult ?? 1;
  const previewMult = diff.previewMult ?? 1;
  const rawDur = (built.durationMs || diff.baseDuration) * durMult;
  const rawPreview = built.previewMs ? Math.max(PREVIEW_MIN_MS, built.previewMs * previewMult) : 0;

  return {
    type: typeKey,
    instruction: built.instruction,
    instructionMeta: built.instructionMeta || { key: typeKey, params: {} },
    payload: built.payload,
    secret: built.secret || null,
    durationMs: Math.round(rawDur * (isBoss ? BOSS_DURATION_MULT : 1)),
    previewMs: Math.round(rawPreview * (isBoss ? BOSS_DURATION_MULT : 1)),
    scoring: {
      correct: Math.round(((built.scoring && built.scoring.correct) || 10) * (isBoss ? BOSS_POINTS_MULT : 1)),
      wrong: (built.scoring && built.scoring.wrong !== undefined) ? built.scoring.wrong : -5,
    },
    deferredScoring: !!built.deferredScoring,
    isBoss,
    _reveal: null,
  };
}

// Strip server-only fields before sending to clients during round:start
function publicChallenge(ch) {
  return {
    type: ch.type,
    instruction: ch.instruction,
    instructionMeta: ch.instructionMeta,
    payload: ch.payload,
    isBoss: ch.isBoss,
    previewMs: ch.previewMs,
    durationMs: ch.durationMs,
  };
}

// Full challenge with reveal (sent in round:result so clients can show the answer)
function revealedChallenge(ch) {
  return {
    ...publicChallenge(ch),
    secret: ch.secret,
    reveal: ch._reveal,
  };
}

// ---------- Room storage ----------
const rooms = {};

function publicRoomState(room) {
  return {
    code: room.code,
    state: room.state,
    round: room.round,
    totalRounds: room.rounds,
    difficulty: room.difficulty,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id, name: p.name, score: p.score, streak: p.streak || 0, connected: p.connected,
    })),
  };
}

function broadcastRoom(room) {
  io.to(room.code).emit('room:update', publicRoomState(room));
}

// ---------- Round lifecycle ----------
function startRound(room) {
  room.round += 1;
  room.state = 'round';
  room.answers = {};
  room.fastestCorrectId = null;
  room.challenge = buildChallenge(room);
  room.roundStartedAt = Date.now();

  const typeDef = TYPES[room.challenge.type];
  for (const p of room.players.values()) {
    room.answers[p.id] = {
      state: typeDef.initAnswer ? typeDef.initAnswer() : {},
      done: false,
      correct: false,
      time: 0,
      choice: null,
    };
  }

  const ch = room.challenge;
  io.to(room.code).emit('round:start', {
    round: room.round,
    totalRounds: room.rounds,
    durationMs: ch.durationMs,
    previewMs: ch.previewMs,
    isBoss: ch.isBoss,
    challenge: publicChallenge(ch),
  });
  broadcastRoom(room);

  clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => endRound(room), ch.durationMs);
}

function applyScoring(player, correct, scoring) {
  if (correct) {
    player.score += scoring.correct;
    player.streak = (player.streak || 0) + 1;
    if (player.streak >= STREAK_BONUS_THRESHOLD) {
      player.score += 5;
      return { points: scoring.correct + 5, streakBonus: 5 };
    }
    return { points: scoring.correct, streakBonus: 0 };
  } else {
    player.score += scoring.wrong;
    player.streak = 0;
    return { points: scoring.wrong, streakBonus: 0 };
  }
}

function endRound(room) {
  if (!room.challenge) return;
  room.state = 'result';
  const ch = room.challenge;
  const typeDef = TYPES[ch.type];

  // Phase 1: finalize deferred-scoring challenges (MAJORITY/MINORITY/ROULETTE)
  if (typeDef.finalize) typeDef.finalize(room, ch, room.answers);

  // Phase 2: apply scoring for deferred answers
  if (ch.deferredScoring) {
    for (const [pid, ans] of Object.entries(room.answers)) {
      if (!ans.done) continue;
      const player = room.players.get(pid);
      if (!player) continue;
      applyScoring(player, ans.correct, ch.scoring);
    }
  }

  // Players who never answered: streak breaks
  for (const p of room.players.values()) {
    const ans = room.answers[p.id];
    if (!ans || !ans.done) p.streak = 0;
  }

  // Fastest correct gets +5 bonus
  const correctEntries = Object.entries(room.answers).filter(([, a]) => a.done && a.correct);
  correctEntries.sort((a, b) => a[1].time - b[1].time);
  if (correctEntries.length > 0) {
    const [fastestId] = correctEntries[0];
    const fastest = room.players.get(fastestId);
    if (fastest) {
      fastest.score += 5;
      room.fastestCorrectId = fastestId;
    }
  }

  const summary = Array.from(room.players.values()).map((p) => {
    const ans = room.answers[p.id];
    let result = 'no-answer';
    if (ans && ans.done) result = ans.correct ? 'correct' : 'wrong';
    return {
      id: p.id, name: p.name, score: p.score, streak: p.streak || 0,
      result, fastest: p.id === room.fastestCorrectId,
      choice: ans ? ans.choice : null,
    };
  });

  io.to(room.code).emit('round:result', {
    round: room.round,
    totalRounds: room.rounds,
    challenge: revealedChallenge(ch),
    summary,
    fastestId: room.fastestCorrectId,
  });
  broadcastRoom(room);

  clearTimeout(room.roundTimer);
  const resDur = DIFFICULTIES[room.difficulty].resultDuration;
  room.roundTimer = setTimeout(() => {
    if (room.round >= room.rounds) finishGame(room);
    else startRound(room);
  }, resDur);
}

function finishGame(room) {
  room.state = 'finished';
  const scoreboard = Array.from(room.players.values())
    .map((p) => ({ id: p.id, name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score);
  const winner = scoreboard[0] || null;
  io.to(room.code).emit('game:over', { scoreboard, winner });
  broadcastRoom(room);
}

// ---------- Socket handlers ----------
io.on('connection', (socket) => {
  socket.on('host:create', (_, ack) => {
    const code = makeRoomCode();
    rooms[code] = {
      code, hostId: socket.id, players: new Map(),
      state: 'lobby', round: 0, challenge: null, answers: {}, roundTimer: null,
      difficulty: 'medium',
      rounds: DIFFICULTIES.medium.rounds,
    };
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = 'host';
    if (typeof ack === 'function') ack({ ok: true, code });
    broadcastRoom(rooms[code]);
  });

  socket.on('host:set-difficulty', ({ difficulty }) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostId !== socket.id) return;
    if (room.state !== 'lobby') return;
    if (!DIFFICULTIES[difficulty]) return;
    room.difficulty = difficulty;
    // Snap round count to the new difficulty's default. Host can re-adjust after.
    room.rounds = DIFFICULTIES[difficulty].rounds;
    broadcastRoom(room);
  });

  socket.on('host:set-rounds', ({ rounds }) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostId !== socket.id) return;
    if (room.state !== 'lobby') return;
    const n = parseInt(rounds, 10);
    if (!Number.isFinite(n)) return;
    room.rounds = Math.max(ROUNDS_MIN, Math.min(ROUNDS_MAX, n));
    broadcastRoom(room);
  });

  socket.on('player:join', ({ code, name }, ack) => {
    code = (code || '').toUpperCase().trim();
    name = (name || '').trim().slice(0, 20);
    const room = rooms[code];
    if (!room) return ack && ack({ ok: false, error: 'Room not found' });
    if (!name) return ack && ack({ ok: false, error: 'Name required' });
    if (room.state !== 'lobby') return ack && ack({ ok: false, error: 'Game already started' });

    for (const p of room.players.values()) {
      if (p.name.toLowerCase() === name.toLowerCase()) {
        return ack && ack({ ok: false, error: 'Name already taken' });
      }
    }

    const player = { id: socket.id, name, score: 0, streak: 0, connected: true };
    room.players.set(socket.id, player);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = 'player';
    if (typeof ack === 'function') ack({ ok: true, code, name, id: socket.id });
    broadcastRoom(room);
  });

  socket.on('host:start', () => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostId !== socket.id) return;
    if (room.players.size === 0) return;
    room.round = 0;
    for (const p of room.players.values()) { p.score = 0; p.streak = 0; }
    startRound(room);
  });

  socket.on('host:restart', () => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostId !== socket.id) return;
    clearTimeout(room.roundTimer);
    room.state = 'lobby';
    room.round = 0;
    room.challenge = null;
    room.answers = {};
    for (const p of room.players.values()) { p.score = 0; p.streak = 0; }
    io.to(room.code).emit('game:reset');
    broadcastRoom(room);
  });

  socket.on('player:tap', ({ choice }) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.state !== 'round') return;
    if (!COLORS.includes(choice)) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const ans = room.answers[socket.id];
    if (!ans) return;
    if (ans.done) { socket.emit('player:feedback', { kind: 'already' }); return; }

    const typeDef = TYPES[room.challenge.type];
    const meta = { elapsedMs: Date.now() - room.roundStartedAt };
    const result = typeDef.evaluateTap(player, choice, ans.state, room.challenge, meta);

    if (result.done) {
      ans.done = true;
      ans.choice = choice;
      ans.time = meta.elapsedMs;

      if (result.deferred) {
        // Deferred: don't score yet — finalize() runs at endRound
        ans.correct = false; // placeholder
        socket.emit('player:feedback', { kind: 'submitted', choice });
      } else {
        ans.correct = result.correct;
        const score = applyScoring(player, result.correct, room.challenge.scoring);
        socket.emit('player:feedback', {
          kind: result.correct ? 'correct' : 'wrong',
          choice,
          points: score.points,
          streakBonus: score.streakBonus,
          streak: player.streak,
        });
      }
    } else {
      // Mid-multitap progress
      socket.emit('player:feedback', {
        kind: 'progress',
        choice,
        progress: result.progress,
        count: result.count,
        countA: result.countA,
        countB: result.countB,
        phase: result.phase,
      });
    }
    broadcastRoom(room);
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;

    if (socket.id === room.hostId) {
      io.to(code).emit('room:closed', { reason: 'Host disconnected' });
      clearTimeout(room.roundTimer);
      delete rooms[code];
      return;
    }

    const player = room.players.get(socket.id);
    if (player) {
      if (room.state === 'lobby') room.players.delete(socket.id);
      else player.connected = false;
      broadcastRoom(room);
    }
  });
});

// ---------- Boot ----------
function localIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

app.get('/api/host-info', (_req, res) => {
  res.json({ ips: localIPs(), port: PORT });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n🎉 Color Panic running!');
  console.log(`   Host (this laptop): http://localhost:${PORT}`);
  const ips = localIPs();
  if (ips.length) {
    console.log('   Players on same Wi-Fi can join at:');
    for (const ip of ips) console.log(`     http://${ip}:${PORT}`);
  }
  console.log('');
});
