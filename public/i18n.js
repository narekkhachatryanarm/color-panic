// Color Panic - i18n
// Per-device language preference (English / Armenian). Saved in localStorage.
// Use t(key, params) to translate. Use applyStaticTranslations() to update DOM
// elements marked with [data-i18n]. Subscribe to 'languagechange' on window for
// re-render hooks.

(function () {
  const STORAGE_KEY = 'colorpanic.lang';
  const SUPPORTED = ['en', 'hy'];

  function detectInitialLang() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored)) return stored;
    const nav = (navigator.language || 'en').toLowerCase();
    if (nav.startsWith('hy')) return 'hy';
    return 'en';
  }

  let currentLang = detectInitialLang();

  // ----- Dictionaries -----
  // Color words used inside instructions (uppercase form for emphasis).
  const COLOR_LOUD = {
    en: { red: 'RED', blue: 'BLUE', green: 'GREEN', yellow: 'YELLOW' },
    hy: { red: 'ԿԱՐՄԻՐ', blue: 'ԿԱՊՈՒՅՏ', green: 'ԿԱՆԱՉ', yellow: 'ԴԵՂԻՆ' },
  };

  // Ordinals used in DRAWING round prompts.
  const ORDINALS = {
    en: { '1st': '1st', '2nd': '2nd', '3rd': '3rd', '4th': '4th' },
    hy: { '1st': '1-ին', '2nd': '2-րդ', '3rd': '3-րդ', '4th': '4-րդ' },
  };

  const DICT = {
    en: {
      // language picker
      'lang.en': 'English',
      'lang.hy': 'Armenian',

      // home
      'app.tagline': "Tap fast. Tap smart. Don't panic.",
      'home.create_room': 'Create Room as Host',
      'home.join_room': 'Join Room as Player',

      // join
      'join.title': 'Join Game',
      'join.code_label': 'Room code',
      'join.name_label': 'Your name',
      'join.name_placeholder': 'e.g. Ani',
      'join.error_code_4': 'Enter a 4-letter room code.',
      'join.error_name': 'Enter your name.',
      'join.error_join': 'Could not join',
      'join.button': 'Join',
      'common.back': '← Back',

      // host lobby
      'lobby.room_code': 'Room code',
      'lobby.players_join_at': 'Players join at',
      'lobby.difficulty': 'Difficulty',
      'lobby.rounds': 'Rounds',
      'lobby.players': 'Players',
      'lobby.start_game': 'Start Game',
      'lobby.need_player': 'Need at least one player to start.',
      'lobby.rounds_hint': '3 – 30 rounds. Hold to adjust faster.',
      'lobby.loading': 'loading…',

      // difficulty
      'diff.easy': 'Easy',
      'diff.easy_desc': '8 rounds · relaxed',
      'diff.medium': 'Medium',
      'diff.medium_desc': '10 rounds · normal',
      'diff.hard': 'Hard',
      'diff.hard_desc': '12 rounds · snappy',

      // game header
      'game.round_label': 'Round',
      'game.live_scoreboard': 'Live Scoreboard',
      'game.get_ready': 'Get ready…',
      'game.boss_banner_host': '👑 BOSS ROUND — 2× points!',
      'game.boss_banner_player': '👑 BOSS — 2× points',
      'game.wait_dots': 'Wait…',

      // player UI
      'player.you_in': "You're in! 🎉",
      'player.playing_as': 'Playing as',
      'player.waiting': 'Waiting for host to start…',
      'player.player': 'Player',
      'player.score': 'Score',
      'player.round': 'Round',
      'player.streak': 'Streak',

      // results / game over
      'result.round_summary': 'Round Summary',
      'result.round_x_results': 'Round {round} Results',
      'result.round_x_boss_results': '👑 Round {round} (BOSS) Results',
      'result.game_over': '🏆 Game Over',
      'result.x_wins': '🏆 {name} wins!',
      'result.final_scoreboard': 'Final Scoreboard',
      'result.play_again': 'Play Again',
      'result.you_won': 'You won!',
      'result.finished_rank': 'You finished <strong>#{rank}</strong> with <strong>{score}</strong> points',
      'result.thanks': 'Thanks for playing!',

      // feedback
      'fb.too_late': '⏱ Too late!',
      'fb.fastest': '⚡ Fastest! +5 bonus',
      'fb.correct': '✅ Correct!',
      'fb.wrong': '❌ Wrong!',
      'fb.correct_points': '✅ Correct! +{points}{streak}',
      'fb.streak_part': ' 🔥+{bonus}',
      'fb.wrong_points': '❌ Wrong! {points}',
      'fb.locked_in': '⏳ Locked in — waiting for reveal',
      'fb.already': 'Already answered',
      'fb.fastest_badge': '⚡ fastest +5',
      'fb.step_progress': 'Step {progress} / {total} ✨',
      'fb.taps_progress': '{count} / {target} taps ✨',
      'fb.now_tap_color': 'Now tap {color}! ✨',

      // reveal
      'reveal.answer': 'Answer:',
      'reveal.sequence': 'Sequence:',
      'reveal.last': 'Last:',
      'reveal.shape_was': '{ordinal} shape was',
      'reveal.roulette_winner': '🎲 Winner:',
      'reveal.most_picked': 'Most picked wins',
      'reveal.fewest_picked': 'Fewest picked wins',

      // round instructions (sent from server as { key, params })
      'round.EVERYONE_TAP': 'Everyone tap {color}!',
      'round.ONLY_PLAYER': 'Only {name} tap {color}!',
      'round.AVOID': 'Do NOT tap {color}!',
      'round.WORD_VS_COLOR': 'Tap the WORD, not the color!',
      'round.OPPOSITE': 'Tap the OPPOSITE of {color}!',
      'round.SEQUENCE': 'Tap this sequence in order!',
      'round.COUNT': 'Tap {color} exactly {target} times!',
      'round.LAST_COLOR_preview': 'Watch the colors flash…',
      'round.LAST_COLOR_answer': 'Tap the LAST color shown!',
      'round.COLOR_MATH': 'What is {a} {op} {b}?',
      'round.MAJORITY': 'Tap what MOST players will tap!',
      'round.MINORITY': 'Tap what FEWEST players will tap!',
      'round.MEMORY_SEQUENCE_preview': 'Memorize this sequence!',
      'round.MEMORY_SEQUENCE_answer': 'Now tap the sequence from memory!',
      'round.DONT_TAP_UNTIL': 'Wait, THEN tap {color}!',
      'round.DONT_TAP_UNTIL_preview': 'Wait! Then tap {color}!',
      'round.DONT_TAP_UNTIL_now': 'NOW! Tap {color}!',
      'round.ODD_ONE_OUT': 'Find the ODD one out!',
      'round.REVERSE_ORDER': 'Tap the sequence BACKWARDS!',
      'round.COLOR_NUMBER': 'Tap {colorA} {countA}×, then {colorB} {countB}×!',
      'round.ROULETTE': '🎲 Roulette! Tap any color — answer revealed after.',
      'round.ROULETTE_answer': '🎲 Pick any color — roulette wheel decides!',
      'round.DRAWING_preview': 'Memorize the shapes!',
      'round.DRAWING_watch': 'Watch the shapes…',
      'round.DRAWING_answer': 'What color was the {ordinal} shape?',

      // misc
      'flash.watch': 'Watch…',
      'flash.dots': '…',
      'flash.tap_from_memory': 'Tap from memory →',
      'room.closed_default': 'Room closed',
      'room.closed_suffix': 'Returning home.',
      'badge.offline': 'offline',
    },

    hy: {
      // language picker
      'lang.en': 'Անգլերեն',
      'lang.hy': 'Հայերեն',

      // home
      'app.tagline': 'Սեղմեք արագ։ Սեղմեք խելացի։ Մի՛ խուճապեք։',
      'home.create_room': 'Ստեղծել սենյակ',
      'home.join_room': 'Միանալ որպես խաղացող',

      // join
      'join.title': 'Միանալ խաղին',
      'join.code_label': 'Սենյակի կոդ',
      'join.name_label': 'Ձեր անունը',
      'join.name_placeholder': 'օր․ Անի',
      'join.error_code_4': 'Մուտքագրեք 4-տառանոց կոդ։',
      'join.error_name': 'Մուտքագրեք ձեր անունը։',
      'join.error_join': 'Չհաջողվեց միանալ',
      'join.button': 'Միանալ',
      'common.back': '← Հետ',

      // host lobby
      'lobby.room_code': 'Սենյակի կոդ',
      'lobby.players_join_at': 'Խաղացողները միանում են այստեղ',
      'lobby.difficulty': 'Բարդություն',
      'lobby.rounds': 'Փուլեր',
      'lobby.players': 'Խաղացողներ',
      'lobby.start_game': 'Սկսել խաղը',
      'lobby.need_player': 'Սկսելու համար անհրաժեշտ է գոնե մեկ խաղացող։',
      'lobby.rounds_hint': '3 – 30 փուլ։ Պահեք՝ արագ փոխելու համար։',
      'lobby.loading': 'բեռնվում է…',

      // difficulty
      'diff.easy': 'Հեշտ',
      'diff.easy_desc': '8 փուլ · հանգիստ',
      'diff.medium': 'Միջին',
      'diff.medium_desc': '10 փուլ · նորմալ',
      'diff.hard': 'Բարդ',
      'diff.hard_desc': '12 փուլ · արագ',

      // game header
      'game.round_label': 'Փուլ',
      'game.live_scoreboard': 'Միավորների աղյուսակ',
      'game.get_ready': 'Պատրաստվեք…',
      'game.boss_banner_host': '👑 ԲՈՍՍ ՓՈՒԼ — ×2 միավոր!',
      'game.boss_banner_player': '👑 ԲՈՍՍ — ×2 միավոր',
      'game.wait_dots': 'Սպասեք…',

      // player UI
      'player.you_in': 'Դուք ներս եք! 🎉',
      'player.playing_as': 'Խաղում եք որպես',
      'player.waiting': 'Սպասում ենք, որ հաղորդավարը սկսի…',
      'player.player': 'Խաղացող',
      'player.score': 'Միավոր',
      'player.round': 'Փուլ',
      'player.streak': 'Շարք',

      // results / game over
      'result.round_summary': 'Փուլի արդյունքներ',
      'result.round_x_results': 'Փուլ {round}-ի արդյունքներ',
      'result.round_x_boss_results': '👑 Փուլ {round} (ԲՈՍՍ) արդյունքներ',
      'result.game_over': '🏆 Խաղն ավարտված է',
      'result.x_wins': '🏆 {name}-ը հաղթեց!',
      'result.final_scoreboard': 'Վերջնական աղյուսակ',
      'result.play_again': 'Խաղալ նորից',
      'result.you_won': 'Դուք հաղթեցիք!',
      'result.finished_rank': 'Դուք զբաղեցրիք <strong>#{rank}</strong> տեղը՝ <strong>{score}</strong> միավորով',
      'result.thanks': 'Շնորհակալություն խաղալու համար!',

      // feedback
      'fb.too_late': '⏱ Ուշացաք!',
      'fb.fastest': '⚡ Ամենաարագը! +5 բոնուս',
      'fb.correct': '✅ Ճիշտ!',
      'fb.wrong': '❌ Սխալ!',
      'fb.correct_points': '✅ Ճիշտ! +{points}{streak}',
      'fb.streak_part': ' 🔥+{bonus}',
      'fb.wrong_points': '❌ Սխալ! {points}',
      'fb.locked_in': '⏳ Հաստատված — սպասում ենք բացահայտմանը',
      'fb.already': 'Արդեն պատասխանել եք',
      'fb.fastest_badge': '⚡ ամենաարագ +5',
      'fb.step_progress': 'Քայլ {progress} / {total} ✨',
      'fb.taps_progress': '{count} / {target} սեղմում ✨',
      'fb.now_tap_color': 'Հիմա սեղմեք {color}-ը! ✨',

      // reveal
      'reveal.answer': 'Պատասխան՝',
      'reveal.sequence': 'Հաջորդականություն՝',
      'reveal.last': 'Վերջինը՝',
      'reveal.shape_was': '{ordinal} ձևը՝',
      'reveal.roulette_winner': '🎲 Հաղթող՝',
      'reveal.most_picked': 'Շատերի ընտրածը հաղթեց',
      'reveal.fewest_picked': 'Քչերի ընտրածը հաղթեց',

      // round instructions
      'round.EVERYONE_TAP': 'Բոլորը սեղմեք {color}!',
      'round.ONLY_PLAYER': 'Միայն {name}-ը սեղմի {color}!',
      'round.AVOID': 'ՉՍԵՂՄԵԼ {color}-ը!',
      'round.WORD_VS_COLOR': 'Սեղմեք ԲԱՌԸ, ոչ թե գույնը!',
      'round.OPPOSITE': 'Սեղմեք {color}-ի ՀԱԿԱՌԱԿ գույնը!',
      'round.SEQUENCE': 'Սեղմեք հաջորդականությունը կարգով!',
      'round.COUNT': 'Սեղմեք {color}-ը ուղիղ {target} անգամ!',
      'round.LAST_COLOR_preview': 'Հետևեք գույների փայլատակումներին…',
      'round.LAST_COLOR_answer': 'Սեղմեք ՎԵՐՋԻՆ ցույց տված գույնը!',
      'round.COLOR_MATH': 'Որքա՞ն է {a} {op} {b}',
      'round.MAJORITY': 'Սեղմեք այն, ինչ ՇԱՏԵՐԸ կսեղմեն!',
      'round.MINORITY': 'Սեղմեք այն, ինչ ՔՉԵՐԸ կսեղմեն!',
      'round.MEMORY_SEQUENCE_preview': 'Մտապահեք այս հաջորդականությունը!',
      'round.MEMORY_SEQUENCE_answer': 'Հիմա սեղմեք հաջորդականությունը հիշողությամբ!',
      'round.DONT_TAP_UNTIL': 'Սպասե՛ք, ապա սեղմեք {color}!',
      'round.DONT_TAP_UNTIL_preview': 'Սպասե՛ք! Ապա սեղմեք {color}!',
      'round.DONT_TAP_UNTIL_now': 'ՀԻՄԱ! Սեղմեք {color}!',
      'round.ODD_ONE_OUT': 'Գտեք ՏԱՐԲԵՐԸ!',
      'round.REVERSE_ORDER': 'Սեղմեք հաջորդականությունը ՀԱԿԱՌԱԿ կարգով!',
      'round.COLOR_NUMBER': 'Սեղմեք {colorA} {countA}×, ապա {colorB} {countB}×!',
      'round.ROULETTE': '🎲 Ռուլետկա! Սեղմեք ցանկացած գույն — պատասխանը կբացահայտվի։',
      'round.ROULETTE_answer': '🎲 Ընտրեք ցանկացած գույն — ռուլետկան որոշում է!',
      'round.DRAWING_preview': 'Մտապահեք ձևերը!',
      'round.DRAWING_watch': 'Հետևեք ձևերին…',
      'round.DRAWING_answer': 'Ի՞նչ գույնի էր {ordinal} ձևը',

      // misc
      'flash.watch': 'Հետևեք…',
      'flash.dots': '…',
      'flash.tap_from_memory': 'Սեղմեք հիշողությամբ →',
      'room.closed_default': 'Սենյակը փակվեց',
      'room.closed_suffix': 'Վերադարձ գլխավոր էջ։',
      'badge.offline': 'օֆլայն',
    },
  };

  function format(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  }

  function t(key, params) {
    const table = DICT[currentLang] || DICT.en;
    const raw = table[key] != null ? table[key] : (DICT.en[key] != null ? DICT.en[key] : key);
    return format(raw, params);
  }

  function colorLoud(color) {
    return (COLOR_LOUD[currentLang] || COLOR_LOUD.en)[color] || color.toUpperCase();
  }

  function ordinal(en) {
    return (ORDINALS[currentLang] || ORDINALS.en)[en] || en;
  }

  function getLang() { return currentLang; }

  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return;
    if (currentLang === lang) return;
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
    applyStaticTranslations();
    window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang } }));
  }

  // Apply translations to every element with data-i18n / data-i18n-placeholder /
  // data-i18n-aria-label. Call once at startup and again whenever language changes.
  function applyStaticTranslations() {
    document.documentElement.lang = currentLang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const key = el.getAttribute('data-i18n-html');
      el.innerHTML = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(key));
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria-label');
      el.setAttribute('aria-label', t(key));
    });
    // language toggle visual state
    document.querySelectorAll('.lang-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === currentLang);
    });
  }

  // Build an instruction string from server-provided {key, params}.
  // Color params are converted to localized loud color words.
  function instructionFrom(meta) {
    if (!meta || !meta.key) return '';
    const params = {};
    const src = meta.params || {};
    for (const k of Object.keys(src)) {
      const v = src[k];
      // Heuristic: any param whose value is a known color string gets the loud form.
      if (typeof v === 'string' && ['red', 'blue', 'green', 'yellow'].includes(v)) {
        params[k] = colorLoud(v);
      } else if (k === 'ordinal' && typeof v === 'string') {
        params[k] = ordinal(v);
      } else {
        params[k] = v;
      }
    }
    return t('round.' + meta.key, params);
  }

  window.i18n = {
    t,
    colorLoud,
    ordinal,
    getLang,
    setLang,
    applyStaticTranslations,
    instructionFrom,
    SUPPORTED,
  };

  document.addEventListener('DOMContentLoaded', applyStaticTranslations);
})();
