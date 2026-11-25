(function () {
  'use strict';

  const S = window.AdventStorage;
  const ILLUST_COUNT = 24;
  const COLORS = ['red', 'cream', 'green', 'sage'];
  const $ = sel => document.querySelector(sel);

  let embedded = true;
  try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
  if (embedded) document.documentElement.classList.add('embedded');

  // ---------- 데이터 ----------
  const uid = p => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const defaultStart = () => `${new Date().getFullYear()}-12-01`;

  function defaultSettings() {
    return { title: '우리 반 어드벤트 캘린더', startDate: defaultStart(), lockByDate: false, skipWeekends: true, sound: true, snow: true };
  }
  function newClass(name, count, example) {
    const students = [];
    for (let i = 1; i <= count; i++) students.push({ id: uid('s'), name: `${i}번`, active: true });
    return { id: uid('c'), name, example: !!example, students, settings: defaultSettings(), draws: [] };
  }

  let state = S.validate(S.load());
  if (!state) {
    const c = newClass('우리 반', 20, true);
    state = { version: 1, currentClassId: c.id, classes: [c] };
    S.save(state);
  }
  state.classes.forEach(c => { c.settings = Object.assign(defaultSettings(), c.settings); });

  const cls = () => state.classes.find(c => c.id === state.currentClassId) || state.classes[0];
  const active = c => c.students.filter(s => s.active);
  const byId = (c, id) => c.students.find(s => s.id === id);
  const nameOf = (c, id) => (byId(c, id) || { name: '(삭제된 학생)' }).name;
  const drawnSet = c => new Set(c.draws.flatMap(d => d.studentIds));
  const drawOf = (c, day) => c.draws.find(d => d.day === day);
  const candidates = c => { const used = drawnSet(c); return active(c).filter(s => !used.has(s.id)); };
  const doorCount = c => Math.max(active(c).length, ...c.draws.map(d => d.day), 0);

  function persist() {
    if (!S.save(state)) toast('이 브라우저에는 저장이 안 돼요. 백업을 꼭 해 주세요.');
  }

  function randomInt(n) {
    const a = new Uint32Array(1);
    const limit = Math.floor(0xffffffff / n) * n;
    do { crypto.getRandomValues(a); } while (a[0] >= limit);
    return a[0] % n;
  }

  // 시작일부터 n번째로 열리는 날 (주말 건너뛰기 반영)
  function unlockDate(c, day) {
    const d = new Date(c.settings.startDate + 'T00:00:00');
    if (isNaN(d)) return null;
    let n = 0;
    for (let guard = 0; guard < 400; guard++) {
      const wd = d.getDay();
      if (!(c.settings.skipWeekends && (wd === 0 || wd === 6))) {
        n++;
        if (n === day) return d;
      }
      d.setDate(d.getDate() + 1);
    }
    return null;
  }
  const fmtDate = d => `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function isLocked(c, day) {
    if (!c.settings.lockByDate) return false;
    const d = unlockDate(c, day);
    return d ? todayISO() < isoOf(d) : false;
  }

  function cleanNames(text) {
    return text.split(/[\n,\t]+/).map(s => s.trim()).filter(Boolean);
  }
  function uniqueName(c, name) {
    const names = new Set(active(c).map(s => s.name));
    if (!names.has(name)) return name;
    let i = 2;
    while (names.has(`${name}(${i})`)) i++;
    return `${name}(${i})`;
  }
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // ---------- 공통 UI ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
  }

  function ask(message, yesLabel) {
    return new Promise(resolve => {
      const o = $('#confirmOverlay');
      $('#confirmMsg').textContent = message;
      $('#confirmYes').textContent = yesLabel || '확인';
      o.hidden = false;
      $('#confirmNo').focus();
      const done = v => { o.hidden = true; $('#confirmYes').onclick = $('#confirmNo').onclick = null; resolve(v); };
      $('#confirmYes').onclick = () => done(true);
      $('#confirmNo').onclick = () => done(false);
    });
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      toast(ok ? okMsg : '복사가 막혀 있어요. 직접 선택해서 복사해 주세요.');
    }
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- 효과음 (파일 없이 직접 합성) ----------
  let audio;
  function tone(freq, start, dur, vol, type) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(audio.destination);
    o.start(start);
    o.stop(start + dur + 0.05);
  }
  function sound(kind) {
    if (!cls().settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime + 0.02;
      if (kind === 'tick') { tone(1400, t, 0.05, 0.05, 'triangle'); return; }
      if (kind === 'open') { tone(220, t, 0.12, 0.12, 'triangle'); tone(330, t + 0.08, 0.15, 0.1, 'triangle'); return; }
      // 징글벨 첫 소절 (E E E, E E E, E G C D E)
      const E = 659.25, G = 783.99, C = 523.25, D = 587.33;
      const notes = [[E, 0], [E, 0.14], [E, 0.28], [E, 0.56], [E, 0.70], [E, 0.84], [E, 1.12], [G, 1.26], [C, 1.40], [D, 1.54], [E, 1.68]];
      notes.forEach(([f, at]) => { tone(f, t + at, 0.5, 0.12); tone(f * 2, t + at, 0.25, 0.03); });
    } catch (e) { /* 소리 없이 진행 */ }
  }

  // ---------- 배경 음악 ----------
  const BGM_VOL = 0.35;
  const bgm = $('#bgm');
  bgm.volume = BGM_VOL;
  let duckTimer;
  function setBgmButton() { $('#bgmBtn').setAttribute('aria-pressed', String(!bgm.paused)); }
  async function toggleBgm() {
    try {
      if (bgm.paused) { bgm.volume = BGM_VOL; await bgm.play(); toast('배경 음악: 고요한 밤 (반복 재생)'); }
      else bgm.pause();
    } catch (e) { toast('음악을 재생하지 못했어요. 한 번 더 눌러 주세요.'); }
    setBgmButton();
  }
  // 뽑기 연출 동안 음악을 작게 줄였다가 되돌림
  function duck(ms) {
    if (bgm.paused) return;
    clearTimeout(duckTimer);
    bgm.volume = 0.08;
    duckTimer = setTimeout(() => { bgm.volume = BGM_VOL; }, ms);
  }
  bgm.addEventListener('play', setBgmButton);
  bgm.addEventListener('pause', setBgmButton);

  // ---------- 눈 ----------
  const snow = { flakes: [], raf: 0 };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function startSnow() {
    const cv = $('#snow');
    const ctx = cv.getContext('2d');
    cancelAnimationFrame(snow.raf);
    if (!cls().settings.snow || reduceMotion) { ctx.clearRect(0, 0, cv.width, cv.height); return; }
    const resize = () => {
      cv.width = innerWidth * devicePixelRatio;
      cv.height = innerHeight * devicePixelRatio;
      const n = Math.min(160, Math.round(innerWidth * innerHeight / 9000));
      snow.flakes = Array.from({ length: n }, () => ({
        x: Math.random() * cv.width, y: Math.random() * cv.height,
        r: (Math.random() * 2.2 + 0.8) * devicePixelRatio,
        v: (Math.random() * 0.6 + 0.35) * devicePixelRatio,
        w: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    snow.resize = resize;
    const step = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const f of snow.flakes) {
        f.y += f.v; f.w += 0.01; f.x += Math.sin(f.w) * 0.4;
        if (f.y > cv.height + 5) { f.y = -5; f.x = Math.random() * cv.width; }
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
      snow.raf = requestAnimationFrame(step);
    };
    step();
  }
  addEventListener('resize', () => { if (snow.resize && cls().settings.snow && !reduceMotion) snow.resize(); });

  // ---------- 화면 전환 ----------
  let view = 'calendar';
  function show(v) {
    view = v;
    document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== 'view-' + v; });
    document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-current', b.dataset.view === v ? 'page' : 'false'));
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    renderHeader();
    if (view === 'calendar') renderCalendar();
    if (view === 'roster') renderRoster();
    if (view === 'history') renderHistory();
    if (view === 'settings') renderSettings();
  }

  function renderHeader() {
    const sel = $('#classSelect');
    sel.innerHTML = state.classes.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    sel.value = cls().id;
    const on = cls().settings.sound;
    const b = $('#soundBtn');
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML = on
      ? '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="sr-only">효과음 끄기</span>'
      : '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="sr-only">효과음 켜기</span>';
  }

  // ---------- 캘린더 ----------
  function pickCols(n) {
    const narrow = $('#app').clientWidth < 560;
    if (n <= 4) return Math.max(n, 1);
    if (narrow) return 4;
    let best = 4, bestEmpty = Infinity;
    for (let c = 4; c <= 7; c++) {
      const empty = Math.ceil(n / c) * c - n;
      const rows = Math.ceil(n / c);
      if (rows < 2 && c > 4) continue;
      if (empty < bestEmpty || (empty === bestEmpty && c > best)) { best = c; bestEmpty = empty; }
    }
    return best;
  }

  let layout = { cols: 5, rows: 4 };
  function sizeCalendar() {
    const app = $('#app');
    const cal = $('#calendar');
    if (cal.hidden || view !== 'calendar') return;
    const { cols, rows } = layout;
    // R = 지붕 너비. 높이 = 지붕(0.555R) + 몸통 + 다리 를 R의 배수로 계산
    const roofH = 610 / 1100 - 0.012;
    const B = 0.9;                       // 몸통 너비 / R
    const pad = 0.03, gap = 0.018, border = 0.012;
    const cell = (B - 2 * border - 2 * pad - (cols - 1) * gap) / cols;
    const bodyH = rows * cell + (rows - 1) * gap + 2 * pad + border;
    const perR = roofH + bodyH + 0.03;
    const head = document.querySelector('.cal-head').offsetHeight + ($('#examplePill').hidden ? 0 : 40);
    const topbar = document.body.classList.contains('fs') ? 0 : document.querySelector('.topbar').offsetHeight;
    const availH = innerHeight - topbar - head - 60;
    const availW = app.clientWidth - parseFloat(getComputedStyle(app).paddingLeft) - parseFloat(getComputedStyle(app).paddingRight);
    const maxR = Math.max(availW * 0.55, 1000);
    const R = Math.max(300, Math.min(availW, availH / perR, maxR));
    document.documentElement.style.setProperty('--R', Math.floor(R) + 'px');
  }
  addEventListener('resize', () => { if (view === 'calendar') { renderCalendar(); } });

  const lockSvg = '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>';

  function renderCalendar() {
    const c = cls();
    const n = doorCount(c);
    $('#calTitle').textContent = c.settings.title || c.name;
    const left = candidates(c).length;
    $('#calCount').textContent = n ? `열린 서랍 ${c.draws.length}/${n} · 남은 학생 ${left}명` : '';
    $('#examplePill').hidden = !c.example;
    $('#calendar').hidden = n === 0;
    $('#emptyCal').hidden = n !== 0;
    if (!n) return;
    const cols = pickCols(n);
    const rows = Math.ceil(n / cols);
    layout = { cols, rows };
    const grid = $('#grid');
    grid.style.setProperty('--cols', cols);
    let html = '';
    const lastRowCount = n - (rows - 1) * cols;
    const offset = lastRowCount < cols ? Math.floor((cols - lastRowCount) / 2) : 0;
    for (let day = 1; day <= n; day++) {
      const r = Math.floor((day - 1) / cols), col = (day - 1) % cols;
      const color = COLORS[(r * 2 + col) % 4];
      const d = drawOf(c, day);
      const locked = !d && isLocked(c, day);
      const startCol = (r === rows - 1 && offset) ? (col + offset + 1) : 'auto';
      const who = d ? d.studentIds.map(id => nameOf(c, id)).join(', ') : '';
      let label = `${day}번 서랍`;
      if (d) label += `, ${who} (열림)`;
      else if (locked) { const u = unlockDate(c, day); label += u ? `, ${fmtDate(u)}에 열려요` : ', 잠김'; }
      html += `<button type="button" class="drawer" data-day="${day}" data-color="${color}"${d ? ' data-open' : ''}${locked ? ' data-locked' : ''} style="grid-column-start:${startCol}" aria-label="${esc(label)}">
        <span class="face"></span><span class="num">${day}</span>${d ? `<span class="who">${esc(who)}</span>` : ''}${locked ? lockSvg : ''}</button>`;
    }
    grid.innerHTML = html;
    sizeCalendar();
  }

  let busy = false;
  async function openDoor(day, el) {
    if (busy) return;
    const c = cls();
    const existing = drawOf(c, day);
    if (existing) { showResult(day, false); return; }
    if (isLocked(c, day)) {
      const u = unlockDate(c, day);
      toast(u ? `${day}번 서랍은 ${fmtDate(u)}에 열 수 있어요` : '아직 열 수 없는 서랍이에요');
      return;
    }
    const pool = candidates(c);
    if (!pool.length) { toast('모든 학생이 뽑혔어요! 메리 크리스마스!'); return; }
    // 결과를 먼저 확정하고 저장한 뒤 연출
    const pick = pool[randomInt(pool.length)];
    c.draws.push({ day, studentIds: [pick.id], drawnAt: new Date().toISOString() });
    persist();
    busy = true;
    duck(5200);
    sound('open');
    el.classList.add('opening');
    await wait(reduceMotion ? 10 : 700);
    busy = false;
    renderCalendar();
    showResult(day, true);
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ---------- 결과 카드 ----------
  let resultDay = 0;
  function fitName(text) {
    const el = $('.card-name');
    const len = [...text].length;
    const size = len <= 3 ? 20 : len <= 5 ? 15 : len <= 8 ? 11 : 8;
    el.style.fontSize = size + 'cqw';
  }

  async function showResult(day, animate) {
    const c = cls();
    const d = drawOf(c, day);
    if (!d) return;
    resultDay = day;
    const o = $('#resultOverlay');
    const nameEl = $('#resultName');
    const box = $('.card-name');
    const u = unlockDate(c, day);
    $('#resultDay').textContent = c.settings.lockByDate && u ? `${day}번 서랍 · ${fmtDate(u)}` : `${day}번 서랍`;
    const img = $('#resultIllust');
    img.src = `assets/illust-${String(((day - 1) % ILLUST_COUNT) + 1).padStart(2, '0')}.webp`;
    img.alt = '';
    const finalName = d.studentIds.map(id => nameOf(c, id)).join(', ');
    $('#resultRedraw').hidden = false;
    o.hidden = false;
    // 다시 그려야 팝 애니메이션이 재생됨
    const r = o.querySelector('.result');
    r.style.animation = 'none'; void r.offsetWidth; r.style.animation = '';
    $('#resultClose').focus();

    if (animate && !reduceMotion) {
      busy = true;
      box.classList.add('rolling');
      const names = active(c).map(s => s.name);
      let delay = 55;
      const end = performance.now() + 1900;
      while (performance.now() < end) {
        const nm = names[randomInt(names.length)];
        fitName(nm); nameEl.textContent = nm;
        sound('tick');
        await wait(delay);
        delay *= 1.08;
      }
      box.classList.remove('rolling');
      busy = false;
    }
    fitName(finalName);
    nameEl.textContent = finalName;
    if (animate) celebrate();
  }

  function celebrate() {
    sound('jingle');
    if (typeof window.confetti !== 'function' || reduceMotion) return;
    const colors = ['#b3262e', '#24613f', '#f2c14e', '#fff8f0', '#a9b59a'];
    window.confetti({ particleCount: 140, spread: 80, origin: { y: 0.55 }, colors, zIndex: 70 });
    setTimeout(() => window.confetti({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors, zIndex: 70 }), 250);
    setTimeout(() => window.confetti({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors, zIndex: 70 }), 400);
  }

  function closeResult() {
    if (busy) return;
    $('#resultOverlay').hidden = true;
    const btn = document.querySelector(`.drawer[data-day="${resultDay}"]`);
    if (btn) btn.focus();
  }

  async function redraw() {
    if (busy) return;
    const c = cls();
    const d = drawOf(c, resultDay);
    if (!d) return;
    const pool = candidates(c); // 지금 뽑힌 학생은 제외된 상태
    if (!pool.length) { toast('다시 뽑을 학생이 없어요'); return; }
    const prev = d.studentIds.map(id => nameOf(c, id)).join(', ');
    const ok = await ask(`${prev} 학생을 뽑기 전으로 돌려놓고\n${resultDay}번 서랍을 다시 뽑을까요?\n(${prev} 학생은 다음 서랍에서 다시 뽑힐 수 있어요)`, '다시 뽑기');
    if (!ok) return;
    duck(4500);
    const pick = pool[randomInt(pool.length)];
    d.studentIds = [pick.id];
    d.drawnAt = new Date().toISOString();
    persist();
    renderCalendar();
    showResult(resultDay, true);
  }

  // ---------- 명단 ----------
  function renderRoster() {
    const c = cls();
    const used = drawnSet(c);
    const list = active(c);
    $('#rosterCount').textContent = `${list.length}명 · 서랍 ${doorCount(c)}개`;
    $('#studentList').innerHTML = list.map((s, i) => `
      <li><span class="idx">${i + 1}</span>
        <label class="sr-only" for="st-${esc(s.id)}">${i + 1}번 학생 이름</label>
        <input id="st-${esc(s.id)}" data-id="${esc(s.id)}" value="${esc(s.name)}" maxlength="20">
        ${used.has(s.id) ? '<span class="picked">뽑힘</span>' : ''}
        <button type="button" class="del-btn" data-del="${esc(s.id)}" aria-label="${esc(s.name)} 삭제">✕</button></li>`).join('')
      || '<li class="hint">아직 학생이 없어요.</li>';
  }

  function addNames(names) {
    const c = cls();
    names.forEach(n => c.students.push({ id: uid('s'), name: uniqueName(c, n.slice(0, 20)), active: true }));
    c.example = false;
    persist();
  }

  async function replaceStudents(names) {
    const c = cls();
    if (c.draws.length) {
      const ok = await ask(`명단을 새로 만들면 지금까지의 뽑기 기록 ${c.draws.length}개도 지워져요.\n계속할까요?`, '새로 만들기');
      if (!ok) return false;
    }
    c.students = [];
    c.draws = [];
    addNames(names);
    return true;
  }

  // ---------- 기록 ----------
  function sortedDraws(c) { return [...c.draws].sort((a, b) => a.day - b.day); }
  const fmtTime = iso => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  function renderHistory() {
    const c = cls();
    const rows = sortedDraws(c);
    const left = candidates(c);
    $('#historySummary').textContent = `${c.name} · 뽑힌 학생 ${rows.length}명 · 남은 학생 ${left.length}명`;
    $('#historyBody').innerHTML = rows.length
      ? rows.map(d => `<tr><td><span class="day-badge">${d.day}</span></td><td class="name">${esc(d.studentIds.map(id => nameOf(c, id)).join(', '))}</td><td>${esc(fmtTime(d.drawnAt))}</td><td><button type="button" class="x-btn" data-undo="${d.day}">취소</button></td></tr>`).join('')
      : '<tr class="empty-row"><td colspan="4">아직 열린 서랍이 없어요. 캘린더에서 서랍을 눌러 보세요.</td></tr>';
    $('#remainingWrap').hidden = left.length === 0;
    $('#remainingList').innerHTML = left.map(s => `<li>${esc(s.name)}</li>`).join('');
  }

  function tableText(c, sep) {
    const q = v => sep === ',' ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    const lines = [['서랍', '이름', '뽑은 시각'].map(q).join(sep)];
    sortedDraws(c).forEach(d => lines.push([d.day, d.studentIds.map(id => nameOf(c, id)).join(' '), fmtTime(d.drawnAt)].map(q).join(sep)));
    return lines.join('\r\n');
  }

  // ---------- 설정 ----------
  function renderSettings() {
    const c = cls();
    const s = c.settings;
    $('#setTitle').value = s.title;
    $('#setStart').value = s.startDate;
    $('#setLock').checked = s.lockByDate;
    $('#setWeekend').checked = s.skipWeekends;
    $('#setSound').checked = s.sound;
    $('#setSnow').checked = s.snow;
    $('#className').value = c.name;
    $('#deleteClass').disabled = state.classes.length < 2;
    const n = doorCount(c);
    const last = n ? unlockDate(c, n) : null;
    const first = unlockDate(c, 1);
    $('#lockHint').textContent = n && first && last
      ? `서랍 ${n}개 기준: 1번 서랍 ${fmtDate(first)} → 마지막 ${n}번 서랍 ${fmtDate(last)}${s.lockByDate ? '' : ' (날짜 잠금이 꺼져 있어 언제든 열 수 있어요)'}`
      : '';
  }

  function exportJSON() { return JSON.stringify(state, null, 2); }

  function importData(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { toast('백업 내용을 읽을 수 없어요. 파일이 맞는지 확인해 주세요.'); return; }
    const clean = S.validate(data);
    if (!clean) { toast('이 앱의 백업 파일이 아니에요.'); return; }
    ask(`백업을 불러오면 지금 이 브라우저의 명단과 기록이 백업 내용으로 바뀌어요.\n(반 ${clean.classes.length}개)`, '불러오기').then(ok => {
      if (!ok) return;
      state = clean;
      state.classes.forEach(c => { c.settings = Object.assign(defaultSettings(), c.settings); });
      persist();
      startSnow();
      toast('백업을 불러왔어요');
      show('calendar');
    });
  }

  // ---------- 이벤트 ----------
  document.addEventListener('click', e => {
    const t = e.target;
    const tab = t.closest('.tab');
    if (tab) { show(tab.dataset.view); return; }
    const go = t.closest('[data-go]');
    if (go) { show(go.dataset.go); return; }
    const drawer = t.closest('.drawer');
    if (drawer) { openDoor(Number(drawer.dataset.day), drawer); return; }
    const del = t.closest('[data-del]');
    if (del) {
      const c = cls();
      const s = byId(c, del.dataset.del);
      if (!s) return;
      if (drawnSet(c).has(s.id)) s.active = false; // 기록은 남기고 명단에서만 뺌
      else c.students = c.students.filter(x => x.id !== s.id);
      c.example = false;
      persist();
      renderRoster();
      toast(`${s.name} 학생을 명단에서 뺐어요`);
      return;
    }
    const undo = t.closest('[data-undo]');
    if (undo) {
      const c = cls();
      const day = Number(undo.dataset.undo);
      const d = drawOf(c, day);
      if (!d) return;
      ask(`${day}번 서랍(${d.studentIds.map(id => nameOf(c, id)).join(', ')})을 닫고\n뽑기 전으로 돌릴까요?`, '닫기').then(ok => {
        if (!ok) return;
        c.draws = c.draws.filter(x => x.day !== day);
        persist();
        renderHistory();
        toast(`${day}번 서랍을 다시 닫았어요`);
      });
    }
  });

  $('#studentList').addEventListener('change', e => {
    const input = e.target.closest('input[data-id]');
    if (!input) return;
    const c = cls();
    const s = byId(c, input.dataset.id);
    const v = input.value.trim().slice(0, 20);
    if (!s) return;
    if (!v) { input.value = s.name; return; }
    s.name = v;
    c.example = false;
    persist();
  });

  $('#addNames').addEventListener('click', () => {
    const names = cleanNames($('#pasteNames').value);
    if (!names.length) { toast('이름을 먼저 입력해 주세요'); return; }
    const c = cls();
    if (c.example && !c.draws.length) { c.students = []; } // 예시 번호 명단은 자동으로 비움
    addNames(names);
    $('#pasteNames').value = '';
    renderRoster();
    toast(`${names.length}명을 추가했어요`);
  });
  $('#replaceNames').addEventListener('click', async () => {
    const names = cleanNames($('#pasteNames').value);
    if (!names.length) { toast('이름을 먼저 입력해 주세요'); return; }
    if (await replaceStudents(names)) {
      $('#pasteNames').value = '';
      renderRoster();
      toast(`${names.length}명으로 새 명단을 만들었어요`);
    }
  });
  $('#makeNumbers').addEventListener('click', async () => {
    const n = Math.max(1, Math.min(60, parseInt($('#numCount').value, 10) || 0));
    const names = Array.from({ length: n }, (_, i) => `${i + 1}번`);
    if (await replaceStudents(names)) { renderRoster(); toast(`1번~${n}번으로 만들었어요`); }
  });

  $('#classSelect').addEventListener('change', e => {
    state.currentClassId = e.target.value;
    persist();
    startSnow();
    render();
  });
  $('#soundBtn').addEventListener('click', () => {
    const s = cls().settings;
    s.sound = !s.sound;
    persist();
    renderHeader();
    if (s.sound) sound('open');
  });
  $('#bgmBtn').addEventListener('click', toggleBgm);
  $('#fullBtn').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else { await document.documentElement.requestFullscreen(); if (view !== 'calendar') show('calendar'); }
    } catch (e) {
      document.body.classList.toggle('fs');
      renderCalendar();
    }
  });
  document.addEventListener('fullscreenchange', () => {
    document.body.classList.toggle('fs', !!document.fullscreenElement);
    renderCalendar();
  });

  $('#resultClose').addEventListener('click', closeResult);
  $('#resultRedraw').addEventListener('click', redraw);
  $('#resultOverlay').addEventListener('click', e => { if (e.target.id === 'resultOverlay') closeResult(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('#confirmOverlay').hidden) $('#confirmNo').click();
    else if (!$('#resultOverlay').hidden) closeResult();
    else if (document.body.classList.contains('fs') && !document.fullscreenElement) { document.body.classList.remove('fs'); renderCalendar(); }
  });

  // 설정 입력
  const bindSetting = (id, key, prop) => $(id).addEventListener('change', e => {
    const s = cls().settings;
    s[key] = e.target[prop];
    if (key === 'title') s.title = s.title.trim() || '우리 반 어드벤트 캘린더';
    persist();
    if (key === 'snow') startSnow();
    renderSettings();
    renderHeader();
  });
  bindSetting('#setTitle', 'title', 'value');
  bindSetting('#setStart', 'startDate', 'value');
  bindSetting('#setLock', 'lockByDate', 'checked');
  bindSetting('#setWeekend', 'skipWeekends', 'checked');
  bindSetting('#setSound', 'sound', 'checked');
  bindSetting('#setSnow', 'snow', 'checked');

  $('#renameClass').addEventListener('click', () => {
    const v = $('#className').value.trim();
    if (!v) { toast('반 이름을 입력해 주세요'); return; }
    cls().name = v.slice(0, 30);
    persist();
    renderHeader();
    toast('반 이름을 바꿨어요');
  });
  $('#newClass').addEventListener('click', () => {
    const c = newClass(`새 반 ${state.classes.length + 1}`, 0, false);
    state.classes.push(c);
    state.currentClassId = c.id;
    persist();
    toast('새 반을 만들었어요. 명단을 넣어 주세요.');
    show('roster');
  });
  $('#deleteClass').addEventListener('click', async () => {
    if (state.classes.length < 2) return;
    const c = cls();
    if (!(await ask(`'${c.name}'의 명단과 기록을 모두 지울까요?\n되돌릴 수 없어요.`, '삭제'))) return;
    state.classes = state.classes.filter(x => x.id !== c.id);
    state.currentClassId = state.classes[0].id;
    persist();
    toast('반을 삭제했어요');
    show('calendar');
  });

  $('#exportFile').addEventListener('click', () => {
    download(`어드벤트캘린더-백업-${todayISO()}.json`, exportJSON(), 'application/json');
    toast('백업 파일을 저장했어요');
  });
  $('#exportCopy').addEventListener('click', () => copyText(exportJSON(), '백업 내용을 복사했어요. 메모장 등에 붙여넣어 보관하세요.'));
  $('#importFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => importData(String(r.result));
    r.readAsText(f);
    e.target.value = '';
  });
  $('#importTextBtn').addEventListener('click', () => importData($('#importText').value));

  $('#resetDraws').addEventListener('click', async () => {
    const c = cls();
    if (!c.draws.length) { toast('지울 기록이 없어요'); return; }
    if (!(await ask(`'${c.name}'의 뽑기 기록 ${c.draws.length}개를 지우고\n모든 서랍을 다시 닫을까요?`, '기록 지우기'))) return;
    if (!(await ask('정말 지울까요? 되돌릴 수 없어요.', '네, 지울게요'))) return;
    c.draws = [];
    persist();
    toast('기록을 지웠어요');
    render();
  });
  $('#resetAll').addEventListener('click', async () => {
    if (!(await ask('모든 반의 명단과 기록을 지우고 처음 상태로 돌아갈까요?', '모두 지우기'))) return;
    if (!(await ask('정말 지울까요? 백업이 없다면 되돌릴 수 없어요.', '네, 지울게요'))) return;
    S.clear();
    const c = newClass('우리 반', 20, true);
    state = { version: 1, currentClassId: c.id, classes: [c] };
    persist();
    startSnow();
    toast('처음 상태로 돌아갔어요');
    show('calendar');
  });

  $('#csvBtn').addEventListener('click', () => {
    const c = cls();
    download(`${c.name}-어드벤트-기록.csv`, '﻿' + tableText(c, ','), 'text/csv;charset=utf-8');
    toast('엑셀 파일(CSV)을 저장했어요');
  });
  $('#copyTableBtn').addEventListener('click', () => copyText(tableText(cls(), '\t'), '표를 복사했어요. 엑셀이나 한글에 붙여넣으세요.'));
  $('#printBtn').addEventListener('click', () => window.print());

  // ---------- 시작 ----------
  startSnow();
  show('calendar');
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (view === 'calendar') sizeCalendar(); });
  window.addEventListener('load', () => { if (view === 'calendar') sizeCalendar(); });
})();
