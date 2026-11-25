// 저장은 이 파일에서만 처리합니다. 나중에 Firebase 등으로 바꿀 때 이 파일만 고치면 됩니다.
(function () {
  const KEY = 'advent-app-v1';
  let memory = null; // localStorage를 못 쓰는 환경(시크릿 창 등)용 임시 저장

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 무시하고 메모리 사용 */ }
    return memory ? JSON.parse(memory) : null;
  }

  function save(data) {
    const text = JSON.stringify(data);
    memory = text;
    try {
      localStorage.setItem(KEY, text);
      return true;
    } catch (e) {
      return false;
    }
  }

  function clear() {
    memory = null;
    try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
  }

  // 백업 파일 내용이 올바른지 확인하고 정리해서 돌려줍니다. 문제가 있으면 null.
  function validate(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.classes) || data.classes.length === 0) return null;
    const classes = [];
    for (const c of data.classes) {
      if (!c || typeof c.id !== 'string' || !Array.isArray(c.students)) return null;
      classes.push({
        id: c.id,
        name: String(c.name || '우리 반'),
        example: !!c.example,
        students: c.students
          .filter(s => s && typeof s.id === 'string')
          .map(s => ({ id: s.id, name: String(s.name || ''), active: s.active !== false })),
        settings: Object.assign({}, c.settings || {}),
        draws: (Array.isArray(c.draws) ? c.draws : [])
          .filter(d => d && Number.isInteger(d.day) && Array.isArray(d.studentIds))
          .map(d => ({ day: d.day, studentIds: d.studentIds.map(String), drawnAt: String(d.drawnAt || '') })),
      });
    }
    const current = classes.some(c => c.id === data.currentClassId) ? data.currentClassId : classes[0].id;
    return { version: 1, currentClassId: current, classes };
  }

  window.AdventStorage = { load, save, clear, validate, KEY };
})();
