/* CS330 quiz UI — practice sessions, mock exam, dashboard. State lives in localStorage only. */
(function () {
  'use strict';
  const QZ = window.QZ;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app');

  const LEC = { 1: 'L1 Kernel protection', 2: 'L2 Interrupt·Syscall·Upcall', 3: 'L3 Process', 4: 'L4 VM abstraction & API', 5: 'L5 Address translation', 6: 'L6 Paging', 7: 'L7 TLB·Advanced PT', 8: 'L8 Swapping' };
  const TYPE = { cloze: '빈칸', tf: 'T/F', mcq: '복수선택', short: '서술', calc: '계산', order: '순서', match: '매칭', sim: '시뮬레이션' };
  const genKind = q => { if (q._gk === undefined) { try { q._gk = QZ.gens[q.gen]().kind === 'sim' ? 'sim' : 'calc'; } catch (e) { q._gk = 'calc'; } } return q._gk; };
  const typeOf = q => (q.t === 'gen' ? genKind(q) : q.t);
  /* generated items: new instance each time; sim generators yield t:'sim' */
  const instOf = item => {
    if (item.t !== 'gen' || genKind(item) !== 'sim') return QZ.instantiate(item);
    const inst = QZ.gens[item.gen]();
    return QZ.normSim(Object.assign({}, item, inst, { t: 'sim', gen: item.gen, id: item.id, tag: QZ.GEN_LABEL[item.gen] }));
  };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- text helpers ---------- */
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const inl = t => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  const stepsBox = t => t ? '<div class="steps">' + String(t).split('\n').filter(l => l.trim()).map(l => '<div>' + inl(l.trim()) + '</div>').join('') + '</div>' : '';
  function fmt(s) {
    s = String(s == null ? '' : s); const out = []; const re = /```(\w*)\n([\s\S]*?)```/g; let last = 0, m;
    while ((m = re.exec(s))) { out.push(inl(s.slice(last, m.index))); out.push('<pre><code>' + esc(m[2].replace(/\n$/, '')) + '</code></pre>'); last = re.lastIndex; }
    out.push(inl(s.slice(last))); return out.join('');
  }

  /* ---------- progress (localStorage, tolerant of failure) ---------- */
  /* keys are namespaced per course/exam: several quizzes share one origin (github.io/Exam) */
  const NS = 'cs30300/midterm', LS = NS + ':progress', LS_OLD = 'cs330quiz.v1', LS_THM = 'exam:theme';
  let P = { v: 1, items: {}, hist: [], archive: {} };
  try { const r = localStorage.getItem(LS) || localStorage.getItem(LS_OLD); if (r) P = Object.assign(P, JSON.parse(r)); } catch (e) { /* private mode etc. */ }
  P.archive = P.archive || {};
  const activeAll = () => QZ.bank.filter(q => !P.archive[q.id]);
  /* quiz/practice excludes essay (short) items (they live in the mock-exam pool) except code items (KeOS) */
  const active = () => activeAll().filter(q => q.t !== 'short' || q.kcode);
  const saveP = () => { try { localStorage.setItem(LS, JSON.stringify(P)); } catch (e) { /* ignore */ } };
  const DAY = 864e5, GAP = [0, 1, 3, 7, 14];
  function statusOf(id) {
    const s = P.items[id];
    if (!s || !s.n) return 'new';
    if (s.last !== 'ok') return 'weak';
    return s.streak >= 2 ? 'mastered' : 'learning';
  }
  function isDue(id) {
    const s = P.items[id]; if (!s || !s.n) return true;
    if (s.last !== 'ok') return true;
    return Date.now() > s.ts + GAP[Math.min(s.streak, 4)] * DAY;
  }
  function record(id, res) {
    const prev = P.items[id] ? Object.assign({}, P.items[id]) : null;
    const s = P.items[id] || (P.items[id] = { n: 0, c: 0, streak: 0, ts: 0, last: '' });
    s.n++; s.ts = Date.now(); s.last = res;
    if (res === 'ok') { s.c++; s.streak++; } else s.streak = 0;
    P.hist.push([Date.now(), res === 'ok' ? 1 : 0]); if (P.hist.length > 4000) P.hist.splice(0, 1000);
    saveP();
    return prev;
  }
  function undoRecord(id, prev) { // used by "mark as correct"
    if (prev) P.items[id] = prev; else delete P.items[id];
    P.hist.pop(); saveP();
  }
  function toggleArchive(id) { if (P.archive[id]) delete P.archive[id]; else P.archive[id] = 1; saveP(); return !!P.archive[id]; }

  /* ---------- per-type handlers ---------- */
  const H = {};
  const primary = alts => alts[0];

  H.cloze = {
    prep(q) { if (!q._p) q._p = QZ.parseCloze(q.text); },
    render(q) {
      H.cloze.prep(q);
      const html = q._p.parts.map(p => p.t !== undefined ? inl(p.t) :
        `<input class="blank" data-b="${p.b}" size="${Math.max(5, Math.min(26, Math.max(...q._p.blanks[p.b].map(a => a.length)) + 2))}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="blank ${p.b + 1}">`).join('');
      return `<div class="q cloze">${html}</div>`;
    },
    read: (q, el) => $$('input.blank', el).map(i => i.value),
    restore: (q, el, ans) => $$('input.blank', el).forEach((i, k) => { i.value = ans[k] || ''; }),
    grade(q, ans, hinted) {
      H.cloze.prep(q);
      const oks = q._p.blanks.map((alts, i) => QZ.blankOK(ans[i] || '', alts));
      const all = oks.every(Boolean);
      return { res: all ? (hinted ? 'hint' : 'ok') : 'wrong', oks, pts: oks.filter(Boolean).length / oks.length };
    },
    reveal(q, el, ans, g) {
      $$('input.blank', el).forEach((i, k) => { i.classList.add(g.oks[k] ? 'ok' : 'bad'); i.readOnly = true; });
    },
    solution(q, ans, g) {
      const filled = q._p.parts.map(p => p.t !== undefined ? inl(p.t) : `<b>${esc(primary(q._p.blanks[p.b]))}</b>`).join('');
      const alias = q._p.blanks.filter(b => b.length > 1).map(b => esc(b.join(' / '))).join(' · ');
      return `<div>${filled}</div>` + (alias ? `<div class="small">허용 표기: ${alias}</div>` : '') + (q.note ? `<div style="margin-top:6px">${fmt(q.note)}</div>` : '');
    },
  };

  H.tf = {
    render(q) { return `<div class="q">${fmt(q.q)}</div><div class="tf"><button class="tfb" data-v="1">True (T)</button><button class="tfb" data-v="0">False (F)</button></div>`; },
    read: (q, el) => { const b = $('.tfb.sel', el); return b ? b.dataset.v === '1' : null; },
    restore: (q, el, ans) => { if (ans !== null && ans !== undefined) $(`.tfb[data-v="${ans ? 1 : 0}"]`, el).classList.add('sel'); },
    grade: (q, ans) => ({ res: ans === q.a ? 'ok' : 'wrong', pts: ans === q.a ? 1 : 0 }),
    reveal(q, el, ans) {
      $$('.tfb', el).forEach(b => { const v = b.dataset.v === '1'; b.disabled = true; if (v === q.a) b.classList.add('right'); else if (v === ans) b.classList.add('wrong'); });
    },
    solution: q => `<b>정답: ${q.a ? 'True' : 'False'}</b><div>${fmt(q.why || '')}</div>`,
  };

  H.mcq = {
    render(q) {
      return `<div class="q">${fmt(q.q)}</div>${q.code ? '<pre><code>' + esc(q.code) + '</code></pre>' : ''}<div class="small">Select all that apply (more than one may be correct)</div><div class="opts">` +
        q.opts.map((o, i) => `<button class="opt" data-k="${i}"><span class="k">${String.fromCharCode(97 + i)}.</span><span>${fmt(o)}</span></button>`).join('') + '</div>';
    },
    read: (q, el) => $$('.opt.sel', el).map(b => +b.dataset.k),
    restore: (q, el, ans) => ans.forEach(k => $(`.opt[data-k="${k}"]`, el).classList.add('sel')),
    grade(q, ans) {
      const r = QZ.gradeMcq(q, ans);
      return { res: r.exact ? 'ok' : (r.diff === 1 ? 'partial' : 'wrong'), pts: r.exact ? 1 : (r.diff === 1 ? 0.5 : 0), diff: r.diff };
    },
    reveal(q, el, ans) {
      const want = new Set(q.ansIdx);
      $$('.opt', el).forEach(b => {
        const k = +b.dataset.k, picked = ans.includes(k); b.disabled = true; b.classList.remove('sel');
        if (picked && want.has(k)) b.classList.add('right'); else if (picked) b.classList.add('wrong'); else if (want.has(k)) b.classList.add('miss');
      });
    },
    solution: q => `<b>정답: ${q.ansIdx.map(i => String.fromCharCode(97 + i)).join(', ')}</b><div>${fmt(q.why || '')}</div>`,
  };

  H.calc = {
    render(q) {
      return `<div class="q">${fmt(q.q)}</div>${q.tag ? '<div class="small">Type: ' + esc(q.tag) + ' (values change every time)</div>' : ''}<input class="line" id="calcIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${q.kind === 'num' ? 'number (0x.. and 2^n accepted)' : 'value (hex, or fault)'}">`;
    },
    read: (q, el) => $('input.line', el).value,
    restore: (q, el, ans) => { $('input.line', el).value = ans || ''; },
    grade(q, ans) { const r = QZ.checkCalc(q, ans); return { res: r.ok ? 'ok' : 'wrong', pts: r.ok ? 1 : 0 }; },
    reveal(q, el, ans, g) { const i = $('input.line', el); i.classList.add(g.res === 'ok' ? 'ok' : 'bad'); i.readOnly = true; },
    solution: q => `<b>정답: ${esc(QZ.fmtAns(q))}</b>${stepsBox(q.steps)}`,
  };

  H.short = {
    render(q) { return `<div class="q">${fmt(q.q)}</div><textarea${q.kcode ? ' class="codein" spellcheck="false" placeholder="Write the code or pseudocode first (closed book). Exact syntax matters less than the steps and checks."' : ' placeholder="Write your answer first (the exam is closed book). 1–3 lines is enough."'} aria-label="answer"></textarea>`; },
    read: (q, el) => $('textarea', el).value,
    restore: (q, el, ans) => { $('textarea', el).value = ans || ''; },
    grade: () => ({ res: 'pending', pts: 0 }),
    reveal(q, el) { $('textarea', el).readOnly = true; },
    solution(q, ans, g, opt = {}) {
      const checks = (q.keys || []).map((k, i) => `<li><input type="checkbox" class="key" data-i="${i}" id="key${opt.uid || 0}_${i}"${opt.checked && opt.checked[i] ? ' checked' : ''}><label for="key${opt.uid || 0}_${i}">${fmt(k)}</label></li>`).join('');
      return `<div class="model">${fmt(q.model)}</div><div class="small" style="margin-top:10px">Tick the key points your answer contained (self-grading)</div><ul class="keys">${checks}</ul>`;
    },
  };


  /* ---- ORDER: chip pool + numbered slots; click or drag ---- */
  H.order = {
    render(q) {
      const n = q.steps.length, recall = q.mode === 'recall';
      const items = q.steps.map((t, i) => ({ t, ci: i })).concat(recall ? (q.distract || []).map(t => ({ t, ci: -1 })) : []);
      q._o = { items: shuffle(items), slots: new Array(n).fill(null) };
      if (!recall && n > 1 && q._o.items.every((it, k) => it.ci === k)) q._o.items.reverse();
      return `<div class="q">${fmt(q.q)}</div><div class="small">${recall ? '각 단계의 내용과 순서를 모두 맞히세요 (보기에는 오답 단계가 섞여 있음).' : '단계를 올바른 순서로 배치하세요.'} 칩을 누르면 다음 빈 칸에 들어가고, 배치된 칩을 누르면 되돌아갑니다. 배치된 칩은 끌어서 순서를 바꿀 수 있습니다.</div><div class="ord"><ol class="slots"></ol><div class="pool"></div></div><div class="hintbox small" hidden></div>`;
    },
    bind(q, el) { H.order.draw(q, el); },
    draw(q, el) {
      const o = q._o, done = !!el.dataset.done, root = $('.ord', el); if (!root) return;
      const placed = new Set(o.slots.filter(k => k !== null));
      $('.slots', root).innerHTML = o.slots.map((k, i) => `<li class="slot${k === null ? '' : ' full'}" data-i="${i}"><span class="no">${i + 1}</span>${k === null ? '<span class="ph">&nbsp;</span>' : `<span class="chip2" data-k="${k}"${done ? '' : ' draggable="true"'}>${fmt(o.items[k].t)}</span>`}</li>`).join('');
      $('.pool', root).innerHTML = o.items.map((it, k) => placed.has(k) ? '' : `<span class="chip2" data-k="${k}">${fmt(it.t)}</span>`).join('');
      if (done) return;
      $$('.pool .chip2', root).forEach(c => c.onclick = () => { const i = o.slots.indexOf(null); if (i >= 0) { o.slots[i] = +c.dataset.k; H.order.draw(q, el); } });
      $$('.slot .chip2', root).forEach(c => {
        c.onclick = () => { o.slots[+c.closest('.slot').dataset.i] = null; H.order.draw(q, el); };
        c.ondragstart = e => { e.dataTransfer.setData('text/plain', 's' + c.closest('.slot').dataset.i); e.dataTransfer.effectAllowed = 'move'; c.classList.add('drag'); };
        c.ondragend = () => c.classList.remove('drag');
      });
      $$('.pool .chip2', root).forEach(c => { c.draggable = true; c.ondragstart = e => { e.dataTransfer.setData('text/plain', 'p' + c.dataset.k); e.dataTransfer.effectAllowed = 'move'; }; });
      $$('.slot', root).forEach(sl => {
        sl.ondragover = e => { e.preventDefault(); sl.classList.add('over'); };
        sl.ondragleave = () => sl.classList.remove('over');
        sl.ondrop = e => {
          e.preventDefault(); const to = +sl.dataset.i, d = e.dataTransfer.getData('text/plain'); if (!d) return;
          if (d[0] === 's') { const from = +d.slice(1); if (from !== to) { const t = o.slots[to]; o.slots[to] = o.slots[from]; o.slots[from] = t; } }
          else o.slots[to] = +d.slice(1);
          H.order.draw(q, el);
        };
      });
    },
    read: (q, el) => q._o.slots.slice(),
    restore(q, el, ans) { if (ans) { q._o.slots = ans.slice(); H.order.draw(q, el); } },
    grade(q, ans, hinted) {
      const r = QZ.gradeOrder(q._o.items, ans);
      return { res: r.ok ? (hinted ? 'hint' : 'ok') : r.res, pts: r.pts, oks: r.oks };
    },
    reveal(q, el, ans, g) {
      el.dataset.done = 1; H.order.draw(q, el);
      $$('.slot', el).forEach((sl, i) => sl.classList.add(g.oks[i] ? 'ok' : 'bad'));
    },
    solution: q => `<b>정답 순서</b><ol class="sol">${q.steps.map(s => `<li>${fmt(s)}</li>`).join('')}</ol>${q.distract && q.distract.length ? `<div class="small">오답 보기: ${q.distract.map(fmt).join(' · ')}</div>` : ''}<div>${fmt(q.why || '')}</div>`,
    hint(q, el) {
      if (q.hint) { const b = $('.hintbox', el); b.hidden = false; b.innerHTML = '💡 ' + fmt(q.hint); return; }
      const o = q._o, k = o.items.findIndex(it => it.ci === 0); if (k < 0) return;
      const cur = o.slots.indexOf(k); if (cur >= 0) o.slots[cur] = null;
      o.slots[0] = k; H.order.draw(q, el);
    },
  };

  /* ---- MATCH: draw lines between two columns ---- */
  H.match = {
    render(q) {
      const n = q.pairs.length, perm = shuffle([...Array(n).keys()]);
      q._m = { perm, conn: new Array(n).fill(null), sel: null };
      const L = q.pairs.map((p, i) => `<div class="mi"><span class="mt">${fmt(p[0])}</span><span class="dot" data-s="L" data-k="${i}" role="button" tabindex="0" aria-label="left ${i + 1}"></span></div>`).join('');
      const R = perm.map(k => `<div class="mi r"><span class="dot" data-s="R" data-k="${k}" role="button" tabindex="0" aria-label="right"></span><span class="mt">${fmt(q.pairs[k][1])}</span></div>`).join('');
      return `<div class="q">${fmt(q.q)}</div><div class="small">왼쪽 점을 누른 뒤 오른쪽 점을 눌러 선을 긋습니다. 연결된 점이나 선을 다시 누르면 지워집니다. (1:1 대응)</div><div class="match"><svg class="mlines" xmlns="http://www.w3.org/2000/svg"></svg><div class="mcols"><div class="mcol">${L}</div><div class="mcol">${R}</div></div></div><div class="hintbox small" hidden></div>`;
    },
    bind(q, el) {
      const m = q._m, box = $('.match', el);
      const dot = (s, k) => $(`.dot[data-s="${s}"][data-k="${k}"]`, box);
      const redraw = () => H.match.lines(q, el);
      m.redraw = redraw;
      $$('.dot', box).forEach(d => {
        const act = () => {
          if (el.dataset.done) return;
          const s = d.dataset.s, k = +d.dataset.k;
          const cl = s === 'L' ? m.conn[k] !== null : m.conn.includes(k);
          if (m.sel && m.sel.s !== s) { // complete a line
            const l = s === 'L' ? k : m.sel.k, r = s === 'L' ? m.sel.k : k;
            const old = m.conn.indexOf(r); if (old >= 0) m.conn[old] = null;
            m.conn[l] = r; m.sel = null;
          } else if (m.sel && m.sel.s === s && m.sel.k === k) m.sel = null;
          else if (m.sel) m.sel = { s, k };
          else if (cl) { if (s === 'L') m.conn[k] = null; else m.conn[m.conn.indexOf(k)] = null; }
          else m.sel = { s, k };
          redraw();
        };
        d.onclick = act; d.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); act(); } };
      });
      if (window.ResizeObserver) { m.ro = new ResizeObserver(redraw); m.ro.observe(box); }
      redraw();
    },
    lines(q, el, g) {
      const m = q._m, box = $('.match', el); if (!box) return;
      const svg = $('.mlines', box), br = box.getBoundingClientRect(), done = !!el.dataset.done;
      const ctr = (s, k) => { const r = $(`.dot[data-s="${s}"][data-k="${k}"]`, box).getBoundingClientRect(); return [r.left + r.width / 2 - br.left, r.top + r.height / 2 - br.top]; };
      let h = '';
      const line = (l, r, cls, id) => { const a = ctr('L', l), b = ctr('R', r); return `<line class="ml ${cls}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" data-l="${l}"/>` + (id ? `<line class="mh" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" data-l="${l}"/>` : ''); };
      if (done) q.pairs.forEach((_, l) => { if (m.conn[l] !== l) h += line(l, l, 'miss'); });
      m.conn.forEach((r, l) => { if (r !== null) h += line(l, r, done ? (r === l ? 'ok' : 'bad') : '', !done); });
      svg.innerHTML = h;
      $$('.dot', box).forEach(d => {
        const s = d.dataset.s, k = +d.dataset.k;
        d.classList.toggle('sel', !!m.sel && m.sel.s === s && m.sel.k === k);
        d.classList.toggle('on', s === 'L' ? m.conn[k] !== null : m.conn.includes(k));
      });
      if (!done) $$('.mh', svg).forEach(ln => ln.onclick = () => { m.conn[+ln.dataset.l] = null; m.sel = null; m.redraw(); });
    },
    read: (q, el) => q._m.conn.slice(),
    restore(q, el, ans) { if (ans) { q._m.conn = ans.slice(); H.match.lines(q, el); } },
    grade(q, ans) { const r = QZ.gradeMatch(ans, q.pairs.length); return { res: r.res, pts: r.pts, oks: r.oks }; },
    reveal(q, el, ans, g) { el.dataset.done = 1; q._m.sel = null; H.match.lines(q, el, g); },
    solution: q => `<b>정답 짝</b><ul class="sol">${q.pairs.map(p => `<li>${fmt(p[0])} → ${fmt(p[1])}</li>`).join('')}</ul><div>${fmt(q.why || '')}</div>`,
    hint(q, el) {
      const b = $('.hintbox', el); b.hidden = false;
      if (q.hint) { b.innerHTML = '💡 ' + fmt(q.hint); return; }
      const m = q._m, l = q.pairs.findIndex((_, i) => m.conn[i] !== i); if (l < 0) return;
      const old = m.conn.indexOf(l); if (old >= 0) m.conn[old] = null; m.conn[l] = l; m.sel = null; m.redraw();
    },
  };

  /* ---- SIM: state + several input fields ---- */
  H.sim = {
    render(q) {
      const st = q.state || {}; let s = '';
      if (st.text) s += `<div class="simtext">${fmt(st.text)}</div>`;
      if (st.code) s += `<pre><code>${esc(st.code)}</code></pre>`;
      if (st.table) s += `<div class="tblwrap"><table class="simtbl"><thead><tr>${st.table.head.map(h => `<th>${inl(h)}</th>`).join('')}</tr></thead><tbody>${st.table.rows.map(r => `<tr>${r.map(c => `<td>${inl(String(c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      const f = q.fields.map((f, i) => `<div class="simf"><label for="sf${i}">${inl(f.label)}</label><input class="line simin" id="sf${i}" data-i="${i}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${f.kind === 'num' ? 'number (0x.. accepted)' : 'value'}">${f.unit ? `<span class="small">${esc(f.unit)}</span>` : ''}<span class="mk2"></span></div>`).join('');
      return `<div class="q">${fmt(q.q)}</div>${q.tag ? '<div class="small">Type: ' + esc(q.tag) + ' (values change every time)</div>' : ''}${s}<div class="simfs">${f}</div><div class="hintbox small" hidden></div>`;
    },
    bind(q, el) {
      const ins = $$('input.simin', el);
      ins.forEach((i, k) => i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (k < ins.length - 1) ins[k + 1].focus(); else checkNow(); } });
      if (ins[0]) ins[0].focus();
    },
    read: (q, el) => $$('input.simin', el).map(i => i.value),
    restore: (q, el, ans) => $$('input.simin', el).forEach((i, k) => { i.value = (ans && ans[k]) || ''; }),
    grade(q, ans, hinted) { const r = QZ.gradeSim(q, ans); return { res: r.ok ? (hinted ? 'hint' : 'ok') : r.res, pts: r.pts, oks: r.oks }; },
    reveal(q, el, ans, g) {
      $$('input.simin', el).forEach((i, k) => { i.classList.add(g.oks[k] ? 'ok' : 'bad'); i.readOnly = true; const m = $$('.mk2', el)[k]; m.textContent = g.oks[k] ? '✓' : '✗ ' + QZ.fmtAns(q.fields[k]); m.className = 'mk2 ' + (g.oks[k] ? 'ok' : 'bad'); });
    },
    solution: q => `<b>정답</b><ul class="sol">${q.fields.map(f => `<li>${inl(f.label)}: <b>${esc(QZ.fmtAns(f))}</b></li>`).join('')}</ul>${stepsBox(q.steps)}`,
    hint(q, el) { if (!q.hint) return; const b = $('.hintbox', el); b.hidden = false; b.innerHTML = '💡 ' + fmt(q.hint); },
  };

  const hOf = q => H[typeOf(q)];

  /* ---------- card building (shared by practice + exam) ---------- */
  function metaHTML(q) {
    const st = statusOf(q.id), bits = [`<span class="pill">${esc(LEC[q.lec] || '')}</span>`, `<span class="pill">${q.kcode ? '코드' : TYPE[typeOf(q)]}</span>`];
    if (q.topic) bits.push(`<span>${esc(q.topic)}</span>`);
    if (q.lab) bits.push('<span class="pill lab">KeOS quiz</span>');
    if (q.official) bits.push('<span class="pill lab">official sample</span>');
    bits.push(`<span class="pill ${st}">${st}</span>`);
    return `<div class="meta">${bits.join('')}</div>`;
  }
  const refHTML = q => q.ref ? `<div class="ref">📖 ${esc(q.ref)}</div>` : '';
  const head = res => ({ ok: ['ok', '✓ 정답'], wrong: ['bad', '✗ 오답'], partial: ['part', '△ 부분 정답'], hint: ['part', '△ 힌트를 사용함 (약점으로 기록)'] }[res] || ['part', '']);

  /* ---------- views ---------- */
  const F = { types: new Set(), scope: new Set(), status: 'all', count: 9999, smart: true };
  const E = { lecs: new Set(), tf: 10, mcq: 6, calc: 3, short: 3, min: 60 };
  let view = 'home', S = null, X = null, timer = null;

  function setNav(v) { view = v; $$('nav button').forEach(b => b.classList.toggle('on', b.id === 'n' + v[0].toUpperCase() + v.slice(1))); }
  $('#nHome').onclick = () => home();
  $('#nPractice').onclick = () => practiceSetup();
  $('#nExam').onclick = () => examSetup();

  function tally(list) { const t = { mastered: 0, learning: 0, weak: 0, new: 0, total: list.length }; list.forEach(q => t[statusOf(q.id)]++); return t; }
  function barHTML(t) { const p = k => (t.total ? t[k] / t.total * 100 : 0).toFixed(1) + '%'; return `<div class="bar"><i class="m" style="width:${p('mastered')}"></i><i class="l" style="width:${p('learning')}"></i><i class="w" style="width:${p('weak')}"></i></div>`; }

  function home() {
    stopTimer(); S = null; setNav('home');
    const all = active(), t = tally(all), dueN = all.filter(q => statusOf(q.id) !== 'new' && isDue(q.id)).length;
    const nBy = k => all.filter(q => typeOf(q) === k).length, nArch = Object.keys(P.archive).length;
    const rows = Object.keys(LEC).map(l => {
      const list = all.filter(q => q.lec == l), tt = tally(list);
      return `<div class="lrow" data-l="${l}" role="button" tabindex="0"><span>${esc(LEC[l])}</span>${barHTML(tt)}<span class="n">${tt.mastered}/${tt.total}</span></div>`;
    }).join('');
    const recent = P.hist.slice(-50), acc = recent.length ? Math.round(recent.reduce((a, h) => a + h[1], 0) / recent.length * 100) : null;
    app.innerHTML = `
      <div class="grid3">
        <div class="kpi"><b>${all.length}</b><span>문제 은행 (생성형 ${all.filter(q => q.t === 'gen').length}종은 무한)</span></div>
        <div class="kpi"><b>${t.total ? Math.round(t.mastered / t.total * 100) : 0}%</b><span>mastered (2회 연속 정답)</span></div>
        <div class="kpi"><b>${acc === null ? '–' : acc + '%'}</b><span>최근 ${recent.length}문항 정답률</span></div>
      </div>
      <div class="ctl" style="margin:16px 0 4px">
        <button class="primary" id="goWeak">복습 시작 (복습 ${dueN}개 + 새 문제)</button>
        <button id="goPractice">연습 설정</button>
        <button id="goExam">모의고사</button>
      </div>
      <div class="small">문제 유형: 빈칸 ${nBy('cloze')} · T/F ${nBy('tf')} · 복수선택 ${nBy('mcq')} · 계산 ${nBy('calc')} · 순서 ${nBy('order')} · 매칭 ${nBy('match')} · 시뮬레이션 ${nBy('sim')} (서술형은 모의고사 전용 ${QZ.bank.filter(q => q.t === 'short' && !P.archive[q.id]).length}문항). 강의를 누르면 해당 강의만 연습합니다.</div>
      <div class="sec">강의별 진행</div>${rows}
      <div class="row small" style="margin-top:6px"><span><i style="display:inline-block;width:10px;height:10px;background:var(--ok);border-radius:2px"></i> mastered</span><span><i style="display:inline-block;width:10px;height:10px;background:var(--warn);border-radius:2px"></i> learning</span><span><i style="display:inline-block;width:10px;height:10px;background:var(--bad);border-radius:2px"></i> weak</span></div>
      <div class="sec">시험 형식 (공식 샘플)</div>
      <div class="card small" style="color:var(--ink)">공식 샘플 PDF 기준: <b>A. True/False</b>(해설 없이 T/F) · <b>B. Select-all 객관식</b>(정답 여러 개) · <b>C. Short answer</b>(1–2줄 + 간단한 계산). 샘플은 "실제 시험보다 쉽고 출제 분포를 나타내지 않는다"고 명시돼 있으니, 개념을 <i>이유까지</i> 설명하고 숫자를 직접 계산할 수 있어야 합니다. 모의고사 모드가 이 형식을 그대로 따릅니다.</div>
      <div class="sec">데이터</div>
      <div class="ctl" style="margin-top:0"><button id="exp">진행 상황 내보내기</button><button id="imp">가져오기</button><button id="arch">제외한 문제 (${nArch})</button><button id="rst">초기화</button><button id="thm">테마 전환</button></div>
      <div class="small" style="margin-top:8px">진행 상황은 이 브라우저의 localStorage에만 저장됩니다. 기기를 바꾸려면 내보내기/가져오기를 쓰세요.</div>`;
    $('#goWeak').onclick = () => { F.types.clear(); F.scope.clear(); F.status = 'due'; F.smart = true; startPractice(); };
    $('#goPractice').onclick = practiceSetup; $('#goExam').onclick = examSetup;
    $$('.lrow').forEach(r => { const go = () => { F.scope = new Set([+r.dataset.l]); F.status = 'all'; practiceSetup(); }; r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); }; });
    $('#exp').onclick = () => { const b = new Blob([JSON.stringify(P)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'cs330-quiz-progress.json'; a.click(); };
    $('#imp').onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json'; i.onchange = () => { const f = i.files[0]; if (!f) return; f.text().then(txt => { try { const o = JSON.parse(txt); if (!o.items) throw 0; P = Object.assign({ v: 1, items: {}, hist: [], archive: {} }, o); P.archive = P.archive || {}; saveP(); home(); } catch (e) { alert('올바른 진행 상황 파일이 아닙니다.'); } }); }; i.click(); };
    $('#arch').onclick = archiveView;
    $('#rst').onclick = () => { if (confirm('모든 진행 상황을 지울까요?')) { P = { v: 1, items: {}, hist: [], archive: {} }; saveP(); home(); } };
    $('#thm').onclick = () => { const r = document.documentElement, cur = r.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'); r.dataset.theme = cur === 'dark' ? 'light' : 'dark'; try { localStorage.setItem(LS_THM, r.dataset.theme); } catch (e) { /* ignore */ } };
  }
  try { const th = (localStorage.getItem(LS_THM) || localStorage.getItem('cs330quiz.theme')); if (th) document.documentElement.dataset.theme = th; } catch (e) { /* ignore */ }

  function archiveView() {
    stopTimer(); setNav('home');
    const list = QZ.bank.filter(q => P.archive[q.id]);
    app.innerHTML = `<div class="card"><b>제외한 문제 ${list.length}개</b> <span class="small">— 연습·모의고사에 나오지 않습니다. 되돌리려면 복원을 누르세요.</span></div>` +
      (list.map(q => `<div class="card" data-id="${esc(q.id)}"><div class="meta"><span class="pill">${esc(LEC[q.lec] || '')}</span><span class="pill">${TYPE[typeOf(q)]}</span></div><div class="q">${fmt(plain(q))}</div><div class="ctl"><button class="rs">복원</button></div></div>`).join('') || '<div class="small">제외한 문제가 없습니다.</div>') +
      '<div class="ctl"><button id="hm">Home</button></div>';
    $$('.card[data-id] .rs').forEach(b => b.onclick = () => { delete P.archive[b.closest('.card').dataset.id]; saveP(); archiveView(); });
    $('#hm').onclick = home;
  }

  /* ----- practice setup ----- */
  function chipRow(label, opts, setOrVal, onPick, multi = true) {
    const on = v => multi ? setOrVal.has(v) : setOrVal === v;
    return `<div class="row"><span class="lbl">${label}</span>${opts.map(([v, l]) => `<button class="chip${on(v) ? ' on' : ''}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
  }
  function filteredPool() {
    return active().filter(q => {
      if (F.types.size && !F.types.has(typeOf(q))) return false;
      if (F.scope.size && !(F.scope.has(q.lec) || (F.scope.has('lab') && q.lab) || (F.scope.has('official') && q.official))) return false;
      const st = statusOf(q.id);
      if (F.status === 'new' && st !== 'new') return false;
      if (F.status === 'weak' && st !== 'weak') return false;
      if (F.status === 'nomaster' && st === 'mastered') return false;
      if (F.status === 'due' && !(st !== 'new' && isDue(q.id)) && st !== 'new') return false;
      return true;
    });
  }
  function practiceSetup() {
    stopTimer(); setNav('practice');
    const pool = filteredPool();
    app.innerHTML = `
      <div id="f"></div>
      <div class="card" style="margin-top:14px"><div class="small" id="info"></div>
        <div class="ctl"><button class="primary" id="start">시작</button></div></div>
      <div class="small">한 번에 한 문제 · 틀린 문제는 세션 끝에 한 번 더 · 힌트를 쓰면 약점 기록 · <b>Enter</b> 확인/다음 · <b>T / F</b> 또는 <b>1–9</b> 선택</div>`;
    const draw = () => {
      const p = filteredPool(), t = tally(p);
      $('#f').innerHTML =
        chipRow('범위', Object.entries(LEC).map(([k, v]) => [+k, v.split(' ')[0]]).concat([['lab', 'KeOS quiz'], ['official', 'official sample']]), F.scope, 0) +
        chipRow('상태', [['all', '전체'], ['due', '복습·새 문제'], ['nomaster', 'mastered 제외'], ['weak', '약점'], ['new', '새 문제']], F.status, 0, false) +
        chipRow('문항 수', [[10, '10'], [20, '20'], [40, '40'], [9999, '전부']], F.count, 0, false) +
        chipRow('순서', [['smart', '약점 우선'], ['rand', '무작위']], F.smart ? 'smart' : 'rand', 0, false);
      $('#info').textContent = `해당 문제 ${p.length}개 (new ${t.new} · weak ${t.weak} · learning ${t.learning} · mastered ${t.mastered})`;
      $('#start').disabled = !p.length;
      const rows = $$('#f .row');
      const bind = (idx, fn) => $$('button', rows[idx]).forEach(b => b.onclick = () => { fn(b.dataset.v); draw(); });
      const tog = (set, v) => { set.has(v) ? set.delete(v) : set.add(v); };
      bind(0, v => tog(F.scope, /^\d+$/.test(v) ? +v : v));
      bind(1, v => { F.status = v; }); bind(2, v => { F.count = +v; }); bind(3, v => { F.smart = v === 'smart'; });
    };
    draw(); $('#start').onclick = startPractice;
  }

  /* ----- practice session ----- */
  const WEIGHT = { weak: 0, new: 1, learning: 2, mastered: 3 };
  function startPractice() {
    let pool = filteredPool();
    if (!pool.length) { F.status = 'all'; pool = filteredPool(); }
    // each question appears once per session (generators get a fresh instance; wrong ones return via retry)
    let list = shuffle(pool.slice());
    if (F.smart) list.sort((a, b) => WEIGHT[statusOf(a.id)] - WEIGHT[statusOf(b.id)]);
    list = list.slice(0, F.count);
    S = { queue: list.map(q => ({ q, retry: false })), i: 0, res: [], total: list.length };
    setNav('practice'); nextCard();
  }
  function nextCard() {
    if (S.i >= S.queue.length) return summary();
    const it = S.queue[S.i], q = instOf(it.q), h = hOf(q);
    S.cur = { q, it, answered: false, hinted: false, ans: null, hintLv: [] };
    app.innerHTML = `
      <div class="stat"><span>${S.i + 1} / ${S.queue.length}${it.retry ? ' · 재도전' : ''}</span><span>정답 ${S.res.filter(r => r.res === 'ok').length}</span></div>
      <div class="prog"><div style="width:${S.i / S.queue.length * 100}%"></div></div>
      <div class="card" id="card">${metaHTML(q)}<div id="body">${h.render(q)}</div><div id="fb"></div><div class="ctl" id="ctl"></div></div>
      <div class="ctl"><button id="quit">⟵ 세션 종료</button></div>`;
    $('#quit').onclick = () => { if (S.i > 0 && !confirm('세션을 끝낼까요?')) return; summary(); };
    bindCard(q);
  }
  function setCtl(html) { $('#ctl').innerHTML = html; }
  function bindCard(q) {
    const c = S.cur, body = $('#body'), t = typeOf(q);
    if (t === 'cloze') {
      setCtl('<button class="primary" id="chk">확인</button><button id="hint">힌트</button><button id="giv">모르겠음</button>');
      $('#chk').onclick = checkNow; $('#hint').onclick = () => { c.hinted = true; $$('input.blank', body).forEach((inp, k) => { const alts = q._p.blanks[k]; if (!QZ.blankOK(inp.value, alts)) { c.hintLv[k] = (c.hintLv[k] || 0) + 1; inp.value = primary(alts).slice(0, c.hintLv[k]); } }); };
      $('#giv').onclick = () => { $$('input.blank', body).forEach((inp, k) => { inp.value = ''; }); checkNow(true); };
      $$('input.blank', body).forEach(i => i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const all = $$('input.blank', body), ix = all.indexOf(i); if (ix < all.length - 1 && !all[ix + 1].value) all[ix + 1].focus(); else checkNow(); } });
      const f = $('input.blank', body); if (f) f.focus();
    } else if (t === 'tf') {
      setCtl('');
      $$('.tfb', body).forEach(b => b.onclick = () => { $$('.tfb', body).forEach(x => x.classList.remove('sel')); b.classList.add('sel'); checkNow(); });
    } else if (t === 'mcq') {
      setCtl('<button class="primary" id="chk">확인</button>');
      $$('.opt', body).forEach(b => b.onclick = () => b.classList.toggle('sel')); $('#chk').onclick = checkNow;
    } else if (t === 'calc') {
      setCtl('<button class="primary" id="chk">확인</button><button id="giv">모르겠음</button>');
      $('#chk').onclick = checkNow; $('#giv').onclick = () => { $('input.line', body).value = ''; checkNow(true); };
      const inp = $('input.line', body); inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); checkNow(); } }; inp.focus();
    } else if (t === 'order' || t === 'match' || t === 'sim') {
      const hh = H[t].hint && (t === 'order' || q.hint);
      setCtl('<button class="primary" id="chk">확인</button>' + (hh ? '<button id="hint">힌트</button>' : '') + '<button id="giv">모르겠음</button>');
      $('#chk').onclick = () => checkNow();
      if (hh) $('#hint').onclick = () => { c.hinted = true; H[t].hint(q, body); };
      $('#giv').onclick = () => { if (t === 'order') q._o.slots.fill(null); else if (t === 'match') q._m.conn.fill(null); else $$('input.simin', body).forEach(i => { i.value = ''; }); checkNow(true); };
      if (H[t].bind) H[t].bind(q, body);
    } else {
      setCtl('<button class="primary" id="chk">모범 답안 보기</button>'); $('#chk').onclick = checkNow;
      $('textarea', body).focus();
    }
  }
  function checkNow(giveUp) {
    const c = S.cur; if (c.answered) return;
    const q = c.q, h = hOf(q), body = $('#body'), t = typeOf(q);
    const ans = h.read(q, body);
    if (t === 'tf' && ans === null) return;
    if (t === 'calc' && !giveUp && !String(ans).trim()) return;
    if (t === 'order' && !giveUp && ans.every(k => k === null)) return;
    if (t === 'match' && !giveUp && ans.every(k => k === null)) return;
    if (t === 'sim' && !giveUp && ans.every(v => !String(v).trim())) return;
    c.answered = true; c.ans = ans;
    if (t === 'short') return shortFlow(q, ans);
    const g = h.grade(q, ans, c.hinted); c.g = g; h.reveal(q, body, ans, g);
    finishCard(q, g.res, h.solution(q, ans, g));
  }
  function shortFlow(q, ans) {
    const body = $('#body'); H.short.reveal(q, body);
    $('#fb').innerHTML = `<div class="fb part"><div class="h">모범 답안</div>${H.short.solution(q, ans, null, { uid: 0 })}${refHTML(q)}</div>`;
    setCtl('<button class="primary" id="done">채점 완료</button>');
    $('#done').onclick = () => { const ks = $$('.key', $('#fb')), ratio = ks.length ? ks.filter(k => k.checked).length / ks.length : 0; const res = QZ.shortResult(ratio); ks.forEach(k => k.disabled = true); finishCard(q, res, null, true); };
  }
  function finishCard(q, res, solHTML, keepFb) {
    const c = S.cur, [cls, title] = head(res);
    if (!keepFb) $('#fb').innerHTML = `<div class="fb ${cls}"><div class="h">${title}</div>${solHTML}${refHTML(q)}</div>`;
    else { const f = $('#fb .fb'); f.className = 'fb ' + cls; $('.h', f).textContent = title + ' — 모범 답안'; }
    const prev = record(q.id, res === 'partial' ? 'hint' : res);
    const entry = { q, res, ans: c.ans }; S.res.push(entry);
    c.retryEntry = (res === 'wrong' || res === 'partial') && !c.it.retry ? { q: c.it.q, retry: true } : null; // partial (△) also comes back
    if (c.retryEntry) S.queue.push(c.retryEntry);
    setCtl('<button class="primary" id="next">다음 (Enter)</button>' + (res !== 'ok' ? '<button id="mark">맞음으로 처리</button>' : '') + `<button id="excl">${P.archive[q.id] ? '제외 취소' : '시험에 안 나옴 (제외)'}</button>`);
    $('#next').onclick = () => { S.i++; nextCard(); }; $('#next').focus();
    const mark = $('#mark');
    if (mark) mark.onclick = () => { // typo / synonym: count it as correct
      undoRecord(q.id, prev); record(q.id, 'ok'); entry.res = 'ok';
      if (c.retryEntry) { const k = S.queue.indexOf(c.retryEntry); if (k >= 0) S.queue.splice(k, 1); c.retryEntry = null; } // not pop(): 제외 may have already removed it
      const f = $('#fb .fb'); f.className = 'fb ok'; $('.h', f).textContent = '✓ 맞음으로 처리됨'; mark.remove();
    };
    $('#excl').onclick = () => { // not on the exam: drop from all pools
      const on = toggleArchive(q.id); $('#excl').textContent = on ? '제외 취소' : '시험에 안 나옴 (제외)';
      if (on) S.queue = S.queue.filter((it, k) => k <= S.i || it.q.id !== q.id);
    };
  }
  function plain(q) {
    if (q.t === 'cloze') { QZ.parseCloze(q.text); H.cloze.prep(q); return q._p.parts.map(p => p.t !== undefined ? p.t : '____').join(''); }
    if (q.t === 'gen') return `[${QZ.GEN_LABEL[q.gen]}]`;
    return q.q;
  }
  function ansPlain(q) {
    if (q.t === 'cloze') return q._p.blanks.map(b => b[0]).join(' · ');
    if (q.t === 'tf') return q.a ? 'True' : 'False';
    if (q.t === 'mcq') return q.ansIdx.map(i => String.fromCharCode(97 + i)).join(',');
    if (q.t === 'short') return q.model;
    if (q.t === 'order') return q.steps.join(' → ');
    if (q.t === 'match') return q.pairs.map(p => p[0] + ' ↔ ' + p[1]).join('; ');
    if (q.t === 'sim') return q.fields.map(f => f.label + ' = ' + QZ.fmtAns(f)).join('; ');
    return '';
  }
  function summary() {
    const ok = S.res.filter(r => r.res === 'ok').length, n = S.res.length;
    const bad = S.res.filter(r => r.res !== 'ok'), uniq = [...new Map(bad.map(r => [r.q.id, r])).values()];
    app.innerHTML = `
      <div class="card"><div class="score">${n ? Math.round(ok / n * 100) : 0}%</div><div class="small">${ok} / ${n} 정답 (첫 시도 기준 아님, 재도전 포함)</div></div>
      ${uniq.length ? `<div class="sec">다시 볼 문제 ${uniq.length}</div>` + uniq.map(r => `<div class="card"><div class="meta"><span class="pill">${esc(LEC[r.q.lec])}</span><span class="pill">${TYPE[typeOf(r.q)]}</span></div><div class="q">${fmt(plain(r.q))}</div>${r.q.t === 'gen' ? '' : `<div class="small">정답: ${fmt(ansPlain(r.q))}</div>`}</div>`).join('') : '<div class="card">전부 맞혔습니다 👏</div>'}
      <div class="ctl"><button class="primary" id="again">같은 설정으로 다시</button><button id="hm">Home</button></div>`;
    $('#again').onclick = startPractice; $('#hm').onclick = home; S = null;
  }

  document.addEventListener('keydown', e => {
    if (view === 'practice' && S && S.cur) {
      const c = S.cur, tag = (e.target.tagName || '').toLowerCase();
      if (e.key === 'Enter' && e.repeat) { e.preventDefault(); return; } // held key must not skip the result
      if (e.key === 'Enter' && c.answered && tag !== 'textarea' && tag !== 'button') { const n = $('#next'); if (n) { e.preventDefault(); n.click(); } return; }
      if (c.answered || tag === 'input' || tag === 'textarea') return;
      const t = typeOf(c.q);
      if (t === 'tf' && /^[tf]$/i.test(e.key)) $(`.tfb[data-v="${e.key.toLowerCase() === 't' ? 1 : 0}"]`).click();
      if (t === 'mcq' && /^[1-9]$/.test(e.key)) { const b = $(`.opt[data-k="${+e.key - 1}"]`); if (b) b.click(); }
      // preventDefault: checkNow moves focus to #next, and the same Enter's default action would otherwise click it
      if ((t === 'mcq' || t === 'order' || t === 'match') && e.key === 'Enter') { e.preventDefault(); checkNow(); }
    }
  });

  /* ---------- mock exam ---------- */
  const pad = n => String(n).padStart(2, '0');
  const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
  function examSetup() {
    stopTimer(); setNav('exam'); X = null;
    const drawn = () => {
      const lecs = E.lecs.size ? E.lecs : new Set(Object.keys(LEC).map(Number)), pool = activeAll().filter(q => lecs.has(q.lec));
      const c = k => pool.filter(q => typeOf(q) === k).length;
      app.innerHTML = `
        <div class="card"><b>모의고사</b> <span class="small">— 공식 샘플 형식: A) True/False  B) Select-all  C) Short answer·계산. 제출 전에는 정답/해설이 나오지 않습니다.</span></div>
        <div id="eLecs">${chipRow('범위', Object.entries(LEC).map(([k, v]) => [+k, v.split(' ')[0]]), E.lecs, 0)}</div>
        <div class="small">아무것도 선택하지 않으면 전체 범위</div>
        <div class="row" style="margin-top:12px"><span class="lbl">A T/F</span><input class="line" id="eTf" type="number" min="0" max="40" value="${E.tf}" style="width:90px"><span class="small">(문제 풀 ${c('tf')})</span></div>
        <div class="row"><span class="lbl">B 복수선택</span><input class="line" id="eMcq" type="number" min="0" max="30" value="${E.mcq}" style="width:90px"><span class="small">(풀 ${c('mcq')})</span></div>
        <div class="row"><span class="lbl">C 계산</span><input class="line" id="eCalc" type="number" min="0" max="20" value="${E.calc}" style="width:90px"><span class="small">(풀 ${c('calc')})</span></div>
        <div class="row"><span class="lbl">C 서술</span><input class="line" id="eShort" type="number" min="0" max="20" value="${E.short}" style="width:90px"><span class="small">(풀 ${c('short')})</span></div>
        <div class="row"><span class="lbl">시간(분)</span><input class="line" id="eMin" type="number" min="0" max="240" value="${E.min}" style="width:90px"><span class="small">0 = 제한 없음</span></div>
        <div class="ctl"><button class="primary" id="eStart">시작</button></div>`;
      $$('#eLecs button').forEach(b => b.onclick = () => { const v = +b.dataset.v; E.lecs.has(v) ? E.lecs.delete(v) : E.lecs.add(v); drawn(); });
      const rd = () => { E.tf = +$('#eTf').value || 0; E.mcq = +$('#eMcq').value || 0; E.calc = +$('#eCalc').value || 0; E.short = +$('#eShort').value || 0; E.min = +$('#eMin').value || 0; };
      $$('input.line', app).forEach(i => i.onchange = rd);
      $('#eStart').onclick = () => { rd(); startExam(); };
    };
    drawn();
  }
  function startExam() {
    const lecs = E.lecs.size ? E.lecs : new Set(Object.keys(LEC).map(Number)), pool = activeAll().filter(q => lecs.has(q.lec));
    const take = (k, n) => shuffle(pool.filter(q => typeOf(q) === k)).slice(0, n).map(q => instOf(q));
    const sections = [['A', 'True / False', 1, take('tf', E.tf)], ['B', 'Select all that apply', 2, take('mcq', E.mcq)], ['C', 'Short answer · 계산', 3, shuffle([...take('calc', E.calc), ...take('short', E.short)])]].filter(s => s[3].length);
    if (!sections.length) { alert('선택한 범위에 문제가 없습니다.'); return; }
    X = { sections, answers: {}, t0: Date.now(), limit: E.min * 60, done: false };
    renderExam();
    if (X.limit) timer = setInterval(tick, 500);
  }
  function tick() {
    const left = Math.max(0, X.limit - Math.floor((Date.now() - X.t0) / 1000)), el = $('#clock');
    if (el) el.textContent = `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
    if (left <= 0) submitExam();
  }
  function renderExam() {
    let n = 0;
    app.innerHTML = `<div class="timer"><span id="clock">${X.limit ? '' : '∞'}</span><button class="primary" id="submit">제출</button></div>` +
      X.sections.map(([L, name, pt, qs]) => `<div class="sec">${L}. ${name} (${pt}점/문항)</div>` + qs.map(q => { n++; return `<div class="card eq-card" data-n="${n - 1}"><div><span class="qn">${L}${n}.</span></div><div class="qb">${hOf(q).render(q)}</div></div>`; }).join('')).join('');
    X.flat = X.sections.flatMap(s => s[3].map(q => ({ q, pt: s[2], L: s[0] })));
    $$('.eq-card').forEach(card => {
      const q = X.flat[+card.dataset.n].q, t = typeOf(q);
      if (t === 'tf') $$('.tfb', card).forEach(b => b.onclick = () => { $$('.tfb', card).forEach(x => x.classList.remove('sel')); b.classList.add('sel'); });
      if (t === 'mcq') $$('.opt', card).forEach(b => b.onclick = () => b.classList.toggle('sel'));
    });
    $('#submit').onclick = () => { if (confirm('제출할까요?')) submitExam(); };
    if (X.limit) tick();
  }
  function submitExam() {
    if (!X || X.done) return; X.done = true; stopTimer();
    X.flat.forEach((it, i) => { const card = $(`.eq-card[data-n="${i}"]`); it.ans = hOf(it.q).read(it.q, $('.qb', card)); });
    reviewExam();
  }
  function reviewExam() {
    let n = 0;
    app.innerHTML = `<div class="card" id="scoreBox"></div><div class="ctl" style="margin:0 0 12px"><button class="primary" id="saveX">결과 저장 (진행 상황에 반영)</button><button id="hm">Home</button></div>` +
      X.flat.map((it, i) => `<div class="card" data-n="${i}"><div class="meta"><span class="qn">${it.L}${++n}.</span><span class="pill">${esc(LEC[it.q.lec])}</span><span id="pt${i}" class="pill"></span></div><div class="qb">${hOf(it.q).render(it.q)}</div><div class="fbh"></div></div>`).join('');
    X.flat.forEach((it, i) => {
      const card = $(`.card[data-n="${i}"]`), body = $('.qb', card), h = hOf(it.q), t = typeOf(it.q);
      h.restore(it.q, body, it.ans);
      if (t === 'short') {
        H.short.reveal(it.q, body); it.checked = []; $('.fbh', card).innerHTML = `<div class="fb part"><div class="h">모범 답안</div>${H.short.solution(it.q, it.ans, null, { uid: i })}${refHTML(it.q)}</div>`;
        $$('.key', card).forEach(k => k.onchange = () => { it.checked[+k.dataset.i] = k.checked; scoreAll(); });
        it.auto = false;
      } else {
        const g = h.grade(it.q, it.ans); it.g = g; h.reveal(it.q, body, it.ans, g); it.auto = true;
        const [cls, title] = head(g.res); $('.fbh', card).innerHTML = `<div class="fb ${cls}"><div class="h">${title}</div>${h.solution(it.q, it.ans, g)}${refHTML(it.q)}</div>`;
      }
      const ctl = document.createElement('div'); ctl.className = 'ctl';
      ctl.innerHTML = (t !== 'short' && it.g.res !== 'ok' ? '<button class="mk">맞음으로 처리</button>' : '') + `<button class="ex">${P.archive[it.q.id] ? '제외 취소' : '시험에 안 나옴 (제외)'}</button>`;
      card.appendChild(ctl);
      const mk = $('.mk', ctl);
      if (mk) mk.onclick = () => { it.g = { res: 'ok', pts: 1 }; const f = $('.fb', card); f.className = 'fb ok'; $('.h', f).textContent = '✓ 맞음으로 처리됨'; mk.remove(); scoreAll(); };
      $('.ex', ctl).onclick = e => { e.target.textContent = toggleArchive(it.q.id) ? '제외 취소' : '시험에 안 나옴 (제외)'; };
    });
    $('#saveX').onclick = () => { X.flat.forEach(it => { const t = typeOf(it.q); let res; if (t === 'short') { const ks = it.q.keys || []; res = QZ.shortResult(ks.length ? ks.filter((_, k) => it.checked[k]).length / ks.length : 0); } else res = it.g.res; record(it.q.id, res === 'partial' ? 'hint' : res); }); $('#saveX').disabled = true; $('#saveX').textContent = '저장됨'; };
    $('#hm').onclick = home; scoreAll();
  }
  function scoreAll() {
    let got = 0, max = 0; const sec = {};
    X.flat.forEach((it, i) => {
      const t = typeOf(it.q); let p;
      if (t === 'short') { const ks = it.q.keys || []; p = ks.length ? Math.round(it.pt * 2 * ks.filter((_, k) => it.checked[k]).length / ks.length) / 2 : 0; }
      else p = it.g.pts * it.pt;
      got += p; max += it.pt; (sec[it.L] = sec[it.L] || [0, 0]); sec[it.L][0] += p; sec[it.L][1] += it.pt;
      const el = $('#pt' + i); if (el) el.textContent = `${p} / ${it.pt}점`;
    });
    $('#scoreBox').innerHTML = `<div class="score">${got} / ${max}점 <span class="small">(${Math.round(got / max * 100)}%)</span></div><div class="small">${Object.entries(sec).map(([k, v]) => `${k}: ${v[0]}/${v[1]}`).join(' · ')} · 복수선택은 한 항목만 틀리면 절반 점수, 서술은 체크리스트 비율로 환산 (자가 채점)</div>`;
  }

  home();
})();
