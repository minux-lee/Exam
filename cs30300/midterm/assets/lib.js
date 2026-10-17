/* CS330 quiz — core: question bank, constructors, answer checking. No DOM here. */
(function (root) {
  'use strict';
  const QZ = { bank: [], gens: {} };

  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

  /* ---- constructors (used by data/*.js) ---------------------------------
     C  cloze   : text with {{answer|alias|alias}} blanks
     TF true/false
     M  select-all multiple choice; ans = letters, e.g. "acd"
     S  short answer; keys = checklist of required points (self-graded)
     N  calculation; ans = number or string (text answers allow |aliases)
     o  options: {ref, lab, official, code, tol, unit, hint}
  ------------------------------------------------------------------------ */
  QZ.mk = {
    C: (lec, topic, text, o = {}) => Object.assign({ t: 'cloze', lec, topic, text }, o),
    TF: (lec, topic, q, a, why, o = {}) => Object.assign({ t: 'tf', lec, topic, q, a, why }, o),
    M: (lec, topic, q, opts, ans, why, o = {}) => Object.assign({ t: 'mcq', lec, topic, q, opts, ans, why }, o),
    S: (lec, topic, q, model, keys, o = {}) => Object.assign({ t: 'short', lec, topic, q, model, keys }, o),
    N: (lec, topic, q, ans, steps, o = {}) => Object.assign({ t: 'calc', lec, topic, q, ans, steps }, o),
    G: (lec, topic, gen, o = {}) => Object.assign({ t: 'gen', lec, topic, gen }, o),
    /* O order: steps = correct sequence; o.mode 'order' (default) | 'recall' (+ o.distract); o.why */
    O: (lec, topic, q, steps, o = {}) => Object.assign({ t: 'order', lec, topic, q, steps, mode: 'order' }, o),
    /* X match: pairs = [[left, right], ...] 1:1; o.why */
    X: (lec, topic, q, pairs, o = {}) => Object.assign({ t: 'match', lec, topic, q, pairs }, o),
    /* SIM: state = {text?, table?:{head,rows}, code?}; fields = [{label, ans, kind?, unit?, tol?}]; o.steps */
    SIM: (lec, topic, q, state, fields, o = {}) => Object.assign({ t: 'sim', lec, topic, q, state, fields }, o),
  };

  /* fill in defaults of a sim field list (kind: num|text) */
  QZ.normSim = q => { q.fields = (q.fields || []).map(f => Object.assign({}, f, { kind: f.kind || (typeof f.ans === 'number' ? 'num' : 'text') })); return q; };

  QZ.add = function (list) {
    list.forEach(q => {
      const key = q.t === 'gen' ? q.gen
        : q.t === 'order' ? (q.q || '') + '|' + (q.steps || []).join('|')
        : q.t === 'match' ? (q.q || '') + '|' + (q.pairs || []).map(p => p[0]).join('|')
        : q.t === 'sim' ? (q.q || '') + '|' + (q.fields || []).map(f => f.label).join('|')
        : (q.text || q.q || '');
      q.id = q.t + ':' + q.lec + ':' + hash(key);
      if (q.t === 'mcq') q.ansIdx = [...q.ans].map(ch => ch.charCodeAt(0) - 97);
      if (q.t === 'sim') QZ.normSim(q);
      if (q.t === 'calc') q.kind = typeof q.ans === 'number' ? 'num' : 'text';
      QZ.bank.push(q);
    });
  };

  /* ---- text normalisation ---------------------------------------------- */
  const norm = s => String(s).toLowerCase().normalize('NFKC')
    .replace(/[\s_\-.,:;!?()\[\]{}'"`~]+/g, '')   // keep # / ^ % + * digits letters
    .replace(/’|‘/g, '');
  QZ.norm = norm;

  QZ.parseCloze = function (text) {
    const parts = [], blanks = [];
    const re = /\{\{(.+?)\}\}/g; let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parts.push({ t: text.slice(last, m.index) });
      parts.push({ b: blanks.length });
      blanks.push(m[1].split('|').map(s => s.trim()));
      last = re.lastIndex;
    }
    if (last < text.length) parts.push({ t: text.slice(last) });
    return { parts, blanks };
  };

  QZ.blankOK = (input, alts) => {
    const v = norm(input);
    return !!v && alts.some(a => norm(a) === v);
  };

  /* ---- numeric answers --------------------------------------------------- */
  const SIZE = { b: 1, byte: 1, bytes: 1, kb: 1024, kib: 1024, mb: 1048576, mib: 1048576, gb: 2 ** 30, gib: 2 ** 30, tb: 2 ** 40, tib: 2 ** 40 };
  QZ.parseNum = function (s) {
    s = String(s).trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, '').replace(/[{}]/g, '');
    let m = s.match(/^2\^(\d+)([a-z%]*)$/);
    if (m) return { v: 2 ** +m[1], u: m[2] };
    m = s.match(/^(0x[0-9a-f]+)([a-z%]*)$/);
    if (m) return { v: parseInt(m[1], 16), u: '' };
    m = s.match(/^([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)([a-z%]*)$/);
    if (m) return { v: parseFloat(m[1]), u: m[2] };
    return null;
  };

  const FAULT_RE = /^(fault|violation|protectionfault|protection|segfault|segmentationfault|segmentationviolation|segv|sigsegv|invalid|illegal|error|trap|exception|x|none|없음|오류|폴트)$/;
  const hexNorm = s => {
    s = String(s).toLowerCase().trim().replace(/\s+/g, '');
    if (/^(0x)?[0-9a-f]+$/.test(s)) s = s.replace(/^0x/, '').replace(/^0+(?=.)/, '');
    return s;
  };

  /* returns {ok, shown} */
  QZ.checkCalc = function (item, input) {
    input = String(input || '').trim();
    if (!input) return { ok: false };
    if (item.kind === 'num') {
      const p = QZ.parseNum(input);
      if (!p) return { ok: false };
      let v = p.v;
      if (p.u && SIZE[p.u] && item.unit && SIZE[item.unit.toLowerCase()]) v = v * SIZE[p.u] / SIZE[item.unit.toLowerCase()];
      const tol = item.tol || 0;
      const ok = tol ? Math.abs(v - item.ans) <= Math.abs(item.ans) * tol : Math.abs(v - item.ans) < 1e-9;
      return { ok };
    }
    const alts = String(item.ans).split('|');
    const n = norm(input);
    if (alts[0] === 'fault') return { ok: FAULT_RE.test(n) };
    return { ok: alts.some(a => hexNorm(a) === hexNorm(input) || norm(a) === n) };
  };

  QZ.fmtAns = item => item.kind === 'num'
    ? (item.ans.toLocaleString('en-US', { maximumFractionDigits: 4 }) + (item.unit ? ' ' + item.unit : ''))
    : String(item.ans).split('|')[0];

  /* ---- order / match / sim grading ---------------------------------------
     order: slots = array (length n) of item indexes or null; items[k].ci = index in the correct sequence (-1 = distractor)
     match: conn  = array (per left) of chosen right-pair index or null (right k is correct for left k)
     sim  : vals  = array of strings, checked per field with checkCalc                               */
  const ratioRes = (c, n) => ({ ok: c === n, c, n, pts: c / n, res: c === n ? 'ok' : (c > 0 ? 'partial' : 'wrong') });
  QZ.gradeOrder = (items, slots) => { const oks = slots.map((k, i) => k !== null && k !== undefined && items[k].ci === i); return Object.assign(ratioRes(oks.filter(Boolean).length, oks.length), { oks }); };
  QZ.gradeMatch = (conn, n) => { const oks = []; for (let i = 0; i < n; i++) oks.push(conn[i] === i); return Object.assign(ratioRes(oks.filter(Boolean).length, n), { oks }); };
  QZ.gradeSim = (q, vals) => { const oks = q.fields.map((f, i) => QZ.checkCalc(f, vals[i]).ok); return Object.assign(ratioRes(oks.filter(Boolean).length, oks.length), { oks }); };

  /* ---- mcq grading ------------------------------------------------------- */
  QZ.gradeMcq = function (item, picked) {
    const want = new Set(item.ansIdx), got = new Set(picked);
    let diff = 0;
    item.opts.forEach((_, i) => { if (want.has(i) !== got.has(i)) diff++; });
    return { exact: diff === 0, diff };
  };

  /* short answer: ratio of ticked keys -> result */
  QZ.shortResult = ratio => ratio >= 0.8 ? 'ok' : ratio >= 0.4 ? 'partial' : 'wrong';

  root.QZ = QZ;
  if (typeof module !== 'undefined') module.exports = QZ;
})(typeof window !== 'undefined' ? window : globalThis);
