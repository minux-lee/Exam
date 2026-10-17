/* Parametrised calculation problems. Each generator returns a calc-shaped item
   {q, kind:'num'|'text', ans, unit?, tol?, steps}. Answers are computed, never hand-typed. */
(function (QZ) {
  'use strict';
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[R(0, a.length - 1)];
  const lg = n => Math.round(Math.log2(n));
  const hex = (n, w = 0) => '0x' + n.toString(16).toUpperCase().padStart(w, '0');
  const sz = n => { // pretty byte size
    const u = [['TB', 2 ** 40], ['GB', 2 ** 30], ['MB', 2 ** 20], ['KB', 2 ** 10]];
    for (const [s, v] of u) if (n >= v && n % v === 0) return (n / v) + ' ' + s;
    return n + ' B';
  };
  const unitFor = n => { // largest unit giving an integer >= 1
    for (const [s, v] of [['TB', 2 ** 40], ['GB', 2 ** 30], ['MB', 2 ** 20], ['KB', 2 ** 10], ['B', 1]]) if (n >= v && n % v === 0) return [s, v];
    return ['B', 1];
  };
  const G = QZ.gens;

  /* 1. paging bit arithmetic ------------------------------------------------ */
  G.pagebits = () => {
    const va = pick([32, 36, 40, 48]), ps = pick([1024, 2048, 4096, 8192, 16384]), pte = pick([4, 8]);
    const off = lg(ps), vpn = va - off, npte = 2 ** vpn, pt = npte * pte;
    const ask = pick(['offset', 'vpn', 'npte', 'ptsize']);
    const base = `${va}-bit virtual address, page size ${sz(ps)}, PTE size ${pte} B, single-level linear page table.`;
    const steps = `offset = log2(${ps}) = ${off} bits\nVPN = ${va} − ${off} = ${vpn} bits\n#PTE = 2^${vpn}\npage table size = 2^${vpn} × ${pte} B = ${sz(pt)}`;
    if (ask === 'offset') return { q: base + '\nHow many bits is the offset?', kind: 'num', ans: off, steps };
    if (ask === 'vpn') return { q: base + '\nHow many bits is the VPN?', kind: 'num', ans: vpn, steps };
    if (ask === 'npte') return { q: base + '\nHow many PTEs are there in total? (2^n or decimal)', kind: 'num', ans: npte, steps };
    const [u, v] = unitFor(pt);
    return { q: base + `\nWhat is the size of one process's page table? (unit: ${u})`, kind: 'num', ans: pt / v, unit: u, steps };
  };

  /* 2. how many pages does an array span (cf. official sample C2) ------------- */
  G.npages = () => {
    const ps = pick([128, 256, 512, 1024]), es = pick([4, 8]), n = R(40, 400), off = pick([0, 0, es * R(1, ps / es - 1)]);
    const bytes = n * es, pages = Math.ceil((off + bytes) / ps);
    return {
      q: `A contiguous array holds ${n} elements of ${es} bytes each. It starts ${off} bytes after a page boundary. Page size = ${ps} B. How many pages does the array span?`,
      kind: 'num', ans: pages,
      steps: `array size = ${n} × ${es} = ${bytes} B\nstart offset inside the first page = ${off}\nposition of the last byte = ${off} + ${bytes} − 1 = ${off + bytes - 1}\npages = floor(${off + bytes - 1} / ${ps}) + 1 = ${pages}`,
    };
  };

  /* 3. base & bound translation -------------------------------------------- */
  G.baseBound = () => {
    const base = R(1, 0x40) * 0x100, bound = pick([0x800, 0x1000, 0x2000, 0x2200, 0x4000]);
    const bad = Math.random() < 0.35;
    const va = bad ? bound + R(0, 0x400) : R(0, bound - 1);
    const ok = va < bound;
    return {
      q: `Base & bound (bound = size). base = ${hex(base)}, bound = ${hex(bound)}.\nWhat is the physical address of VA ${hex(va)}? (answer "fault" if the access is illegal)`,
      kind: 'text', ans: ok ? hex(base + va).slice(2) + '|' + hex(base + va) : 'fault',
      steps: ok ? `${hex(va)} < ${hex(bound)} ✓ → PA = base + VA = ${hex(base)} + ${hex(va)} = ${hex(base + va)}` : `${hex(va)} ≥ ${hex(bound)} → bound violated → protection fault`,
    };
  };

  /* 4. segmentation (slide's table, stack excluded) ------------------------- */
  const SEG = [
    { n: 'Code', base: 0x8000, bound: 0x800, prot: 'RO-X' },
    { n: 'Data', base: 0x8800, bound: 0x400, prot: 'RW' },
    { n: 'Heap', base: 0x9000, bound: 0x800, prot: 'RW' },
  ];
  G.segment = () => {
    const s = R(0, 2), seg = SEG[s], over = Math.random() < 0.3;
    const off = over ? seg.bound + R(0, 0x200) : R(0, seg.bound - 1);
    const op = pick(['read', 'write']);
    const va = (s << 14) | off;
    const protBad = op === 'write' && seg.prot === 'RO-X';
    const ok = off < seg.bound && !protBad;
    return {
      q: `Segmentation (14-bit offset, top 2 bits = segment #; 16-bit VA).\nTable: 0 Code base 0x8000 bound 0x0800 RO-X · 1 Data base 0x8800 bound 0x0400 RW · 2 Heap base 0x9000 bound 0x0800 RW\nWhat is the physical address for a ${op} at VA ${hex(va, 4)}? (answer "fault" if illegal)`,
      kind: 'text', ans: ok ? hex(seg.base + off).slice(2) + '|' + hex(seg.base + off) : 'fault',
      steps: `segment # = ${s} (${seg.n}), offset = ${hex(off)}\n` + (off >= seg.bound ? `offset ≥ bound(${hex(seg.bound)}) → segmentation violation` : protBad ? `${seg.n} is ${seg.prot} → write not allowed → protection fault` : `offset < bound ✓ → PA = ${hex(seg.base)} + ${hex(off)} = ${hex(seg.base + off)}`),
    };
  };

  /* 5. multi-level: how many levels ---------------------------------------- */
  G.levels = () => {
    const va = pick([30, 32, 39, 48, 57]), ps = pick([512, 1024, 4096]), pte = pick([4, 8]);
    const off = lg(ps), per = ps / pte, k = lg(per), vpn = va - off, lv = Math.ceil(vpn / k);
    return {
      q: `${va}-bit VA, page size ${sz(ps)}, PTE ${pte} B. Every level's table must fit in exactly one page. What is the minimum number of levels of a multi-level page table?`,
      kind: 'num', ans: lv,
      steps: `offset = ${off} bits, VPN = ${va} − ${off} = ${vpn} bits\nPTEs per page = ${ps}/${pte} = ${per} = 2^${k} → ${k} bits per level\nlevels = ceil(${vpn}/${k}) = ${lv}`,
    };
  };

  /* 6. x86-64 4-level indices ----------------------------------------------- */
  G.x86idx = () => {
    const va = BigInt('0x' + [...Array(12)].map(() => '0123456789abcdef'[R(0, 15)]).join('')) & ((1n << 47n) - 1n);
    const f = (sh) => Number((va >> sh) & 511n);
    const names = [['PML4', 39n], ['PDPT(Directory Ptr)', 30n], ['PD(Directory)', 21n], ['PT(Table)', 12n]];
    const [nm, sh] = pick(names);
    const vs = '0x' + va.toString(16).padStart(12, '0');
    return {
      q: `x86-64 4-level paging (4KB page, 9 bits per level). VA = ${vs}.\nWhat is the ${nm} index? (decimal)`,
      kind: 'num', ans: f(sh),
      steps: `VA = PML4[47:39] | PDPT[38:30] | PD[29:21] | PT[20:12] | offset[11:0]\nPML4 = ${f(39n)}, PDPT = ${f(30n)}, PD = ${f(21n)}, PT = ${f(12n)}, offset = 0x${Number(va & 0xfffn).toString(16)}\n→ ${nm} = ${f(sh)}  (= (VA >> ${sh}) & 0x1FF)`,
    };
  };

  /* 7. TLB misses on an array walk ------------------------------------------ */
  G.tlbArray = () => {
    const ps = pick([16, 32, 64, 128, 4096]), es = 4, n = pick([10, 16, 20, 100]);
    const start = es * R(0, Math.min(ps / es - 1, 5)) + pick([0, 0, 0]);
    const first = Math.floor(start / ps), last = Math.floor((start + es * (n - 1)) / ps), miss = last - first + 1;
    const askRate = Math.random() < 0.5;
    return {
      q: `An int (4 B) array a[0..${n - 1}] is read once in order. a[0] starts at offset ${start} within a page. Page size = ${ps} B, the TLB starts empty, and accesses other than the array are ignored.\n` + (askRate ? 'What is the TLB hit rate? (%, tolerance about 0.5 points)' : 'How many TLB misses?'),
      kind: 'num', ans: askRate ? (n - miss) / n * 100 : miss, tol: askRate ? 0.005 : 0, unit: undefined,
      steps: `first element on page ${first}, last element at byte ${start + es * (n - 1)} → page ${last}\ndistinct pages = ${miss} → misses = ${miss} (only the first access per page misses: spatial locality)\nhit = ${n} − ${miss} = ${n - miss}, hit rate = ${n - miss}/${n} = ${((n - miss) / n * 100).toFixed(1)}%`,
    };
  };

  /* 8. TLB coverage ---------------------------------------------------------- */
  G.coverage = () => {
    const e = pick([16, 32, 64, 128, 256, 512, 1024]), ps = pick([4096, 2 ** 21, 2 ** 30]);
    const cov = e * ps, [u, v] = unitFor(cov);
    return {
      q: `${e} TLB entries, page size ${sz(ps)}. What is the TLB coverage? (unit: ${u})`,
      kind: 'num', ans: cov / v, unit: u,
      steps: `coverage = #entries × page size = ${e} × ${sz(ps)} = ${sz(cov)}`,
    };
  };

  /* 9. AMAT ----------------------------------------------------------------- */
  G.amat = () => {
    const tm = pick([50, 100, 200]), td = pick([5e6, 1e7]), pm = pick([0.0001, 0.001, 0.005]);
    const a = (1 - pm) * tm + pm * td;
    return {
      q: `AMAT = P_hit·T_M + P_miss·T_D. T_M = ${tm} ns, T_D = ${td / 1e6} ms, page fault (miss) probability = ${pm * 100}%. What is AMAT in ns? (tolerance 1%)`,
      kind: 'num', ans: a, tol: 0.01, unit: undefined,
      steps: `T_D = ${td.toLocaleString('en-US')} ns\nAMAT = ${(1 - pm)} × ${tm} + ${pm} × ${td.toLocaleString('en-US')} = ${a.toFixed(1)} ns  (${(a / tm).toFixed(0)}× the hit time)`,
    };
  };

  /* 10. page replacement ----------------------------------------------------- */
  function simulate(policy, refs, nf) {
    let mem = [], faults = 0; const rows = [];
    refs.forEach((p, i) => {
      const hit = mem.includes(p); let ev = '';
      if (hit) { if (policy === 'LRU') { mem = mem.filter(x => x !== p); mem.push(p); } }
      else {
        faults++;
        if (mem.length === nf) {
          let v;
          if (policy === 'OPT') {
            let far = -1; mem.forEach(x => { const nx = refs.indexOf(x, i + 1); const d = nx < 0 ? Infinity : nx; if (d > far) { far = d; v = x; } });
          } else v = mem[0]; // FIFO and LRU keep order so index 0 is victim
          mem = mem.filter(x => x !== v); ev = String(v);
        }
        mem.push(p);
      }
      rows.push(`${String(p).padStart(2)}  ${hit ? 'hit ' : 'MISS'}  evict ${ev.padEnd(2)}  [${mem.join(',')}]`);
    });
    return { faults, rows };
  }
  QZ.simulate = simulate;
  G.replace = () => {
    const nf = pick([3, 3, 4]), len = pick([10, 12]), pol = pick(['FIFO', 'LRU', 'OPT']);
    const refs = Array.from({ length: len }, () => R(0, 4));
    const r = simulate(pol, refs, nf);
    return {
      q: `Reference string: ${refs.join(' ')}\n${nf} physical frames (initially empty), ${pol} policy. How many page faults (misses)? (the first accesses that fill empty frames count as misses)`,
      kind: 'num', ans: r.faults,
      steps: `columns: access / hit·MISS / evicted page / memory after the access` + (pol !== 'OPT' ? '\n(front of the list = oldest page for FIFO, least recently used for LRU)' : '\n(OPT: evict the page used furthest in the future, or never again)') + '\n' + r.rows.join('\n') + `\n→ faults = ${r.faults}`,
    };
  };

  QZ.GEN_LABEL = {
    pagebits: 'paging bit arithmetic', npages: 'pages spanned by an array', baseBound: 'base & bound translation', segment: 'segmentation translation',
    levels: 'number of multi-level levels', x86idx: 'x86-64 page-table index', tlbArray: 'TLB misses / hit rate', coverage: 'TLB coverage',
    amat: 'AMAT', replace: 'page replacement trace',
  };

  /* bank entries for generators */
  const g = QZ.mk.G;
  QZ.add([
    
    g(6, 'paging', 'pagebits'), g(6, 'paging', 'npages'),
    g(7, 'multilevel', 'levels'), g(7, 'x86', 'x86idx', { lab: true }), g(7, 'tlb', 'tlbArray'), g(7, 'tlb', 'coverage'),
    
  ]);

  /* instantiate a bank item into something the UI can render */
  QZ.instantiate = item => {
    if (item.t !== 'gen') return item;
    const inst = G[item.gen]();
    return Object.assign({}, item, inst, { t: 'calc', gen: item.gen, id: item.id, tag: QZ.GEN_LABEL[item.gen] });
  };
})((typeof window !== 'undefined' && window.QZ) || require('./lib.js'));
