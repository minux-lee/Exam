/* Lecture 8 extension: ORDER / MATCH / SIM items (practice only) covering the study gaps of swapping & page replacement. */
(function () {
  const { TF, M, O, X, SIM, G } = QZ.mk;
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[R(0, a.length - 1)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = R(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const asc = a => a.slice().sort((x, y) => x - y);
  const fmtSet = a => asc(a).join(',');

  /* ============================== static ORDER / MATCH / misc ============================== */
  QZ.add([
    /* ---- page fault control flow (HIGH) ---- */
    O(8, 'page fault', 'A process executes `Load M` and the PTE of M\'s page has present = 0; the page is in swap space and a free frame exists. Recall the six steps of page-fault handling in order.', [
      'The instruction references a virtual address whose PTE is marked invalid (not present)',
      'The CPU traps into the operating system',
      'The OS checks in secondary storage (swap space) that the page exists',
      'The OS reads the page from disk into a free page frame',
      'The OS resets the page table: the PTE now points to the frame (present = 1)',
      'The OS restarts the faulting instruction (`Load M` runs again)',
    ], { mode: 'recall', distract: ['The OS kills the process with a segmentation fault', 'The OS flushes the whole TLB and the process continues at the next instruction', 'The hardware itself reads the page from disk and updates the PTE'], why: 'Reference -> trap -> check storage -> get the page -> reset page table -> restart instruction. The faulting instruction is re-executed (not skipped), and the OS, not the hardware, does the disk I/O.', ref: 'L8 p.9', lvl: 2 }),
    O(8, 'page fault', 'Put the page-fault handling steps (swap-in case, a free frame exists) in the correct order.', [
      'Load M references a page whose PTE is invalid',
      'Trap to the OS',
      'Check that the page is in secondary storage',
      'Bring the page into a free frame',
      'Update the PTE to point to the new frame',
      'Re-execute Load M',
    ], { mode: 'order', why: 'The restart is last because the PTE must already be valid; otherwise Load M would fault again immediately.', ref: 'L8 p.9', lvl: 1 }),
    O(8, 'page fault', 'Memory is full when a page fault occurs. Recall what the OS does, in order, when the victim page is DIRTY.', [
      'Trap to the OS and find the page on disk',
      'Find that there is no free frame',
      'The replacement policy picks a victim page',
      'The victim is dirty (D bit = 1): write it to swap space and mark its PTE not present (recording its swap location)',
      'Read the faulting page into the freed frame',
      'Update the faulting page\'s PTE and restart the instruction',
    ], { mode: 'recall', distract: ['Terminate the process owning the victim page', 'Double the size of physical memory', 'Wait until the swap daemon wakes up before doing anything'], why: 'The evict branch sits between "check the page exists" and "get the page". If the victim were clean (D = 0) the write-out would be skipped and the page simply dropped.', ref: 'L8 p.9-11', lvl: 3 }),
    M(8, 'page fault', 'In the six-step page-fault flow, which event happens IMMEDIATELY after the OS reads the page from disk into a frame?', ['The CPU traps into the OS', 'The OS resets the page table so the PTE points to the new frame', 'The faulting instruction is restarted', 'The OS checks storage to see if the page exists'], 'b', 'Order: reference, trap, check storage, get the page, reset page table, restart instruction.', { ref: 'L8 p.9', lvl: 1 }),

    /* ---- eviction matrix (HIGH) ---- */
    X(8, 'eviction', 'Match each page being evicted with what the OS does.', [
      ['Code page (backed by the executable file)', 'Removed; it can be re-read from the executable later'],
      ['Anonymous page, unmodified, already swapped out earlier (swap copy still valid)', 'Dropped; the old swap copy is used on the next fault'],
      ['Anonymous page, modified (dirty), already has a swap block', 'Written out, overwriting its swap block'],
      ['Anonymous page, unmodified, never swapped before, not a zero page', 'A new swap block is allocated and the page is written'],
      ['Unmodified zero page', 'No swap write at all'],
    ], { why: 'File-backed (code) pages can always be re-read from the file. Anonymous pages have no file, so swap space is the only backing store: valid copy -> drop; stale or missing copy -> write; the zero page can be regenerated.', ref: 'L8 p.10-11', lvl: 2 }),
    X(8, 'PTE bits', 'Match each bit/field with the role it plays in swapping and replacement.', [
      ['present bit = 0', 'The page is on disk; the OS keeps its disk location in the PTE'],
      ['dirty (D) bit', 'Tells the OS whether a write-back is needed on eviction'],
      ['use / accessed bit', 'Set to 1 by hardware on every reference; used by Clock'],
      ['clearing the use bit', 'Performed by the OS, never by hardware'],
    ], { why: 'Hardware only records present/dirty/accessed information; the OS decides what to do with it.', ref: 'L8 p.8, 10, 23', lvl: 1 }),
    O(8, 'swap history', 'An anonymous page is written (dirty), evicted, swapped back in by a read, and evicted again without being modified. Put these events in the order they happen.', [
      'First eviction: the dirty page is written to a newly allocated swap block',
      'Page fault: the page is read back from the swap block',
      'The page is only read; the dirty bit stays 0',
      'Second eviction: the page is simply dropped (the swap copy is still valid)',
    ], { mode: 'order', why: 'After swap-in the page is clean and its swap copy matches memory, so the second eviction needs no write. A write before the second eviction would have made the copy stale and forced a write-out.', ref: 'L8 p.11', lvl: 2 }),

    /* ---- policy / workload MATCH (MEDIUM) ---- */
    X(8, 'policies', 'Match each replacement policy with its defining property.', [
      ['OPT', 'Evicts the page used furthest in the future; lowest fault rate but needs the future'],
      ['FIFO', 'Evicts the page that has been in memory longest; can show Belady\'s anomaly'],
      ['Random', 'Picks any page; result depends entirely on luck'],
      ['LRU', 'Uses recency of access to estimate the future'],
      ['Clock', 'Circular list, a hand and a use bit set by hardware and cleared by the OS'],
      ['LFU', 'Uses access frequency; expensive to obtain'],
    ], { why: 'OPT = future, LRU = recency, LFU = frequency, FIFO = arrival time, Random = none, Clock = 1-bit LRU approximation.', ref: 'L8 p.15-23', lvl: 1 }),
    X(8, 'workloads', 'Match each workload / situation with the outcome shown in the lecture graphs.', [
      ['No-locality workload (uniformly random pages), cache smaller than the working set', 'LRU, FIFO and Random behave about the same; only OPT is better'],
      ['80-20 workload', 'LRU keeps the hot pages and beats FIFO and Random'],
      ['Looping over 50 pages with a cache of 40 blocks', 'LRU and FIFO hit rate is about 0%; Random does better'],
      ['Any workload with a cache big enough for all pages', 'Policy does not matter; all policies have the same hit rate (only compulsory misses)'],
      ['80-20 workload with the Clock algorithm', 'Just below LRU, clearly above FIFO and Random'],
    ], { why: 'Without locality history is useless; with locality recency helps; in a loop larger than the cache LRU always evicts exactly the page needed next; with a large cache nothing is evicted.', ref: 'L8 p.20-24', lvl: 2 }),

    /* ---- converted from old select-all items ---- */
    X(8, 'swapping approaches', 'Match each description with the swapping approach or term it describes.', [
      ['The programmer decides what to move in and out of memory; no OS support', 'Overlays'],
      ['The whole process is suspended while it is swapped out', 'Process-level swapping'],
      ['A process runs with only some of its pages resident, using the PTE present bit', 'Page-level swapping'],
      ['Moving a single page from memory to disk', 'Page-out (swap-out)'],
      ['Reading a swapped-out page back into memory on a fault', 'Page-in (swap-in)'],
    ], { why: 'Overlays are manual; process-level swapping moves whole processes; modern OSes use page-level swapping, which only moves the pages that are needed (page-out / page-in) and relies on the present bit.', ref: 'L8 p.6', lvl: 1 }),
    X(8, 'hardware vs OS', 'Match each hardware action with the OS action that follows or complements it in swapping and Clock.', [
      ['Hardware raises a page fault when present = 0', 'OS reads the page from disk and updates the PTE'],
      ['Hardware ignores the other PTE bits when present = 0', 'OS stores the swap location in those bits'],
      ['Hardware sets the dirty bit on a write', 'OS reads the dirty bit to decide whether a write-back is needed'],
      ['Hardware sets the use bit on a reference', 'OS clears the use bit during the clock sweep'],
      ['Hardware has no role in choosing the victim', 'OS runs the replacement policy to choose the victim page'],
    ], { why: 'Hardware only detects (fault) and records (dirty, use) information; every decision and all disk I/O are done by the OS.', ref: 'L8 p.8-10, 23', lvl: 2 }),
    X(8, 'prefetch / clustering', 'Match each statement with the technique or fact it describes.', [
      ['Reading a page in before it is referenced, relying on spatial locality', 'Prefetching'],
      ['Combining several pending page writes into one large write', 'Clustering'],
      ['What a wrong prefetch costs', 'Wasted disk I/O and memory'],
      ['First access to a page that was prefetched', 'Served without disk I/O (only the mapping must be set)'],
      ['Why clustering helps', 'One large write is more efficient than many small ones'],
    ], { why: 'Prefetching reads ahead (guess may be wrong); clustering batches writes (same pages written, fewer and larger I/Os).', ref: 'L8 p.25-26', lvl: 1 }),

    /* ---- daemon, thrashing, clock ordering (MEDIUM) ---- */
    O(8, 'swap daemon', 'Order the life cycle of the swap daemon (kswapd) around the two watermarks.', [
      'Free pages drop below the low watermark (LW)',
      'The swap daemon wakes up',
      'The daemon evicts pages in the background',
      'Free pages rise above the high watermark (HW)',
      'The daemon goes back to sleep',
    ], { mode: 'order', why: 'Waking at LW and sleeping only at HW leaves a gap so the daemon does not flip on/off around one threshold (hysteresis). Eviction happens in the background, so a later fault can use a free frame immediately.', ref: 'L8 p.12', lvl: 1 }),
    M(8, 'swap daemon', 'Why does the swap daemon use two thresholds (LW and HW) instead of a single one?', ['Because HW means "hardware" and LW means "software"', 'To avoid waking up and going back to sleep repeatedly around a single boundary', 'Because the daemon must evict exactly HW - LW pages each time', 'Because clean and dirty pages need different thresholds'], 'b', 'The wake-up level (LW) and sleep level (HW) are separated: once awake, the daemon frees enough memory to get well above LW before sleeping (hysteresis).', { ref: 'L8 p.12', lvl: 2 }),
    O(8, 'thrashing', 'Order one full turn of the thrashing feedback loop, starting from admitting too many processes.', [
      'Too many processes are admitted; their working sets together exceed physical memory',
      'Page faults explode and most time goes to paging back and forth from disk',
      'CPU utilization collapses because processes wait for disk I/O',
      'The OS sees an idle CPU and admits even more processes, making it worse',
    ], { mode: 'order', why: 'The feedback loop (low utilization -> more processes) is what makes thrashing self-reinforcing. The way out (not a step of the loop) is to run fewer processes, i.e. reduce the degree of multiprogramming.', ref: 'L8 p.27', lvl: 2 }),
    O(8, 'Clock', 'The clock hand points to a page and a page fault needs a victim. Recall the steps of one victim selection.', [
      'Look at the page under the clock hand',
      'If its use bit is 1, clear it to 0',
      'Advance the hand to the next page and look at it',
      'Repeat until a page with use bit 0 is found',
      'Evict that page',
    ], { mode: 'recall', distract: ['Set the use bit of every page back to 1', 'Evict the page with the smallest page number'], why: 'Pages used since the hand last passed get a second chance (bit cleared); the first page with bit 0 was not used during a full revolution, so it is evicted. If all bits are 1 the hand circles once clearing them all.', ref: 'L8 p.23', lvl: 2 }),

    /* ---- swap full / Belady (MEDIUM) ---- */
    TF(8, 'swap space', 'Physical memory is full and the swap space is completely full. A clean code page can still be evicted, but a dirty anonymous page with no swap block cannot.', true, 'The code page is dropped and re-read from the executable, needing no swap space. The dirty anonymous page needs a swap block for its only copy, so the total number of usable pages is capped by memory plus swap.', { ref: 'L8 p.7, 10-11', lvl: 3 }),
    TF(8, 'Belady', 'LRU cannot show Belady\'s anomaly because the pages held with n frames are always a subset of those held with n+1 frames (stack property).', true, 'FIFO has no such property (3 frames: 9 faults, 4 frames: 10 faults on the lecture string). LRU and OPT do.', { ref: 'L8 p.17', lvl: 3 }),
  ]);

  /* ============================== simulation helpers ============================== */
  // policy: 'FIFO' | 'LRU' | 'OPT' | 'RAND' (rv = predetermined draws for RAND: index into the oldest-first memory list; loose = accept OPT ties)
  function run(policy, refs, nf, rv, loose) {
    let mem = [], faults = 0, vi = 0; const out = [];
    for (let i = 0; i < refs.length; i++) {
      const p = refs[i]; let hit = mem.includes(p), ev = null;
      if (hit) { if (policy === 'LRU') { mem = mem.filter(x => x !== p); mem.push(p); } }
      else {
        faults++;
        if (mem.length === nf) {
          let v;
          if (policy === 'OPT') {
            const dist = mem.map(x => { const nx = refs.indexOf(x, i + 1); return nx < 0 ? Infinity : nx; });
            const mx = Math.max(...dist);
            if (!loose && dist.filter(d => d === mx).length > 1) return null; // ambiguous tie
            v = mem[dist.indexOf(mx)];
          } else if (policy === 'RAND') v = mem[rv ? rv[vi++] : R(0, mem.length - 1)];
          else v = mem[0];
          ev = v; mem = mem.filter(x => x !== v);
        }
        mem.push(p);
      }
      out.push({ i: i + 1, p, hit, ev, mem: mem.slice(), faults });
    }
    return { out, faults };
  }
  const rowTxt = (s, policy) => `#${String(s.i).padStart(2)}  ref ${s.p}  ${s.hit ? 'hit ' : 'MISS'}  evict ${s.ev === null ? '-' : s.ev}  memory ${policy === 'LRU' ? '(LRU first) ' : (policy === 'FIFO' || policy === 'RAND') ? '(oldest first) ' : ''}[${s.mem.join(',')}]  faults so far = ${s.faults}`;

  /* ============================== generated: step-by-step traces ============================== */
  function traceGen(policy) {
    return () => {
      for (let tries = 0; tries < 500; tries++) {
        const nf = pick([3, 3, 4]), len = R(10, 12);
        const refs = Array.from({ length: len }, () => R(0, 5));
        let rv = null;
        if (policy === 'RAND') rv = Array.from({ length: len }, () => R(0, nf - 1)); // one pre-drawn index per possible eviction
        const r = run(policy, refs, nf, rv); if (!r) continue;
        const evs = r.out.filter(s => s.ev !== null);
        if (evs.length < 2 || r.faults < 6) continue;
        const ks = pick(evs).i, s = r.out[ks - 1];
        const fields = [
          { label: `Page evicted at access #${ks}`, ans: String(s.ev), kind: 'text' },
          { label: `Pages in memory after access #${ks} (ascending, comma-separated)`, ans: fmtSet(s.mem), kind: 'text' },
          { label: `Page faults up to and including access #${ks}`, ans: s.faults, kind: 'num' },
          { label: 'Page faults for the whole reference string', ans: r.faults, kind: 'num' },
        ];
        if (policy === 'LRU') fields.push({ label: `After access #${ks}: which page is the next LRU victim?`, ans: String(s.mem[0]), kind: 'text' });
        if (policy === 'FIFO') fields.push({ label: `After access #${ks}: which page would FIFO evict next?`, ans: String(s.mem[0]), kind: 'text' });
        const name = { FIFO: 'FIFO', LRU: 'LRU', OPT: 'OPT (Belady\'s optimal)', RAND: 'Random' }[policy];
        const used = r.out.filter(x => x.ev !== null).length;
        const note = policy === 'RAND' ? `Random draws (index into the oldest-first list of pages in memory, 0 = oldest), one per eviction in the order the evictions happen: ${rv.slice(0, used).join(', ')}.` : policy === 'OPT' ? 'Evict the page whose next use is furthest in the future (or never).' : policy === 'LRU' ? 'Evict the least recently used page.' : 'Evict the page that has been in memory longest.';
        return {
          kind: 'sim', q: `Simulate ${name} replacement with ${nf} frames (initially empty) and answer for access #${ks} (1-based). The first accesses that fill empty frames count as faults and evict nothing.`,
          state: { text: `Reference string: ${refs.map((p, i) => `${i + 1}:${p}`).join('  ')}\nFrames: ${nf}\n${note}` },
          fields,
          steps: r.out.map(x => rowTxt(x, policy)).join('\n') + `\n-> at access #${ks}: evicted ${s.ev}, memory {${fmtSet(s.mem)}}, ${s.faults} faults so far; ${r.faults} faults in total` + (policy === 'LRU' || policy === 'FIFO' ? `\n(front of the list = ${policy === 'LRU' ? 'least recently used' : 'oldest'} page; ${policy === 'LRU' ? 'a hit moves the page to the back' : 'a hit changes nothing'})` : ''),
        };
      }
      throw new Error('traceGen failed');
    };
  }
  QZ.gens.traceFIFO = traceGen('FIFO'); QZ.gens.traceLRU = traceGen('LRU'); QZ.gens.traceOPT = traceGen('OPT'); QZ.gens.traceRand = traceGen('RAND');
  Object.assign(QZ.GEN_LABEL, { traceFIFO: 'FIFO step-by-step trace', traceLRU: 'LRU step-by-step trace', traceOPT: 'OPT step-by-step trace', traceRand: 'Random replacement trace' });

  /* ============================== generated: looping workload (larger than the cache) ============================== */
  QZ.gens.loopSim = () => {
    const N = R(4, 6), nf = pick([N - 1, N - 1, N - 2]), loops = R(3, 4);
    const refs = []; for (let l = 0; l < loops; l++) for (let p = 1; p <= N; p++) refs.push(p);
    const lru = run('LRU', refs, nf, null, true), fifo = run('FIFO', refs, nf, null, true), opt = run('OPT', refs, nf, null, true);
    const hit = x => refs.length - x.faults;
    return {
      kind: 'sim', q: `A program loops over ${N} pages ${loops} times in order (${refs.length} accesses). Physical memory holds ${nf} pages, initially empty. Count the page faults of each policy.`,
      state: { text: `Reference string: ${refs.join(' ')}\nFrames: ${nf} (fewer than the ${N} pages in the loop)` },
      fields: [
        { label: 'LRU page faults', ans: lru.faults, kind: 'num' },
        { label: 'FIFO page faults', ans: fifo.faults, kind: 'num' },
        { label: 'OPT page faults', ans: opt.faults, kind: 'num' },
        { label: 'OPT hits', ans: hit(opt), kind: 'num' },
      ],
      steps: `LRU:\n${lru.out.map(x => rowTxt(x, 'LRU')).join('\n')}\nFIFO:\n${fifo.out.map(x => rowTxt(x, 'FIFO')).join('\n')}\nOPT:\n${opt.out.map(x => rowTxt(x, 'OPT')).join('\n')}\n-> LRU ${lru.faults}, FIFO ${fifo.faults} (every access misses: the page just evicted is exactly the one needed next), OPT ${opt.faults} (${hit(opt)} hits). A loop larger than the cache is the worst case for LRU and FIFO; Random would do better. (If several pages are never used again, OPT's choice among them does not change the fault count.)`,
    };
  };
  QZ.GEN_LABEL.loopSim = 'Looping workload: LRU/FIFO vs OPT';

  /* ============================== generated: Belady's anomaly ============================== */
  QZ.gens.belady = () => {
    // pool of strings (pages 1..5) precomputed so that FIFO with 4 frames faults MORE than with 3 frames
    const POOL = ['123412512345', '1532453153241', '35521315435214', '2531254253143', '3124321531245', '41234415141235', '43254314513251', '51435125124323', '35125354435124', '1453154214532', '4523451452231', '23153213423154', '43351432435124', '4315432431524', '12431325124535', '25412523254132', '15421531542232', '35413533235412', '54352541543213', '2514253245143', '31543412312542', '35213543152214', '13521334135324', '52351525452314', '54125435342123'];
    const lab = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]); let refs = [...pick(POOL)].map(ch => lab[+ch]);
    let a, b;
    a = run('FIFO', refs, 3); b = run('FIFO', refs, 4);
    const la = run('LRU', refs, 3), lb = run('LRU', refs, 4);
    const line = r => '\n' + r.out.map(s => `  #${String(s.i).padStart(2)} ref ${s.p} ${s.hit ? 'H' : 'M'} [${s.mem.join(',')}]`).join('\n') + '\n  ';
    return {
      kind: 'sim', q: 'Count page faults for the same reference string with 3 and with 4 frames (all frames initially empty).',
      state: { text: `Reference string: ${refs.join(' ')}` },
      fields: [
        { label: 'FIFO faults with 3 frames', ans: a.faults, kind: 'num' },
        { label: 'FIFO faults with 4 frames', ans: b.faults, kind: 'num' },
        { label: 'LRU faults with 3 frames', ans: la.faults, kind: 'num' },
        { label: 'LRU faults with 4 frames', ans: lb.faults, kind: 'num' },
      ],
      steps: `(per access: reference, H = hit / M = miss, memory after the access; FIFO lists oldest first, LRU lists least recently used first)\nFIFO, 3 frames:${line(a)}-> ${a.faults} faults\nFIFO, 4 frames:${line(b)}-> ${b.faults} faults\nLRU, 3 frames:${line(la)}-> ${la.faults} faults\nLRU, 4 frames:${line(lb)}-> ${lb.faults} faults\n` + (b.faults > a.faults ? 'FIFO got WORSE with more memory (Belady\'s anomaly); LRU never gets worse because of its stack property (the n-frame contents are a subset of the (n+1)-frame contents).' : ''),
    };
  };
  QZ.GEN_LABEL.belady = "Belady's anomaly";

  /* ============================== generated: Clock sweeps ============================== */
  QZ.gens.clockSweep = () => {
    for (let tries = 0; tries < 200; tries++) {
      const n = R(5, 6), names = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
      const slots = names.slice(), bits = names.map(() => (Math.random() < 0.65 ? 1 : 0));
      if (bits.filter(b => b === 1).length < 3) continue;
      let h = R(0, n - 1); const h0 = h, bits0 = bits.slice();
      const k = 3, victims = [], log = []; let cleared = 0;
      for (let f = 1; f <= k; f++) {
        const sweep = [];
        while (bits[h] === 1) { sweep.push(`${slots[h]}(slot ${names[h]}) use=1 -> clear`); bits[h] = 0; cleared++; h = (h + 1) % n; }
        const v = slots[h];
        sweep.push(`${v}(slot ${names[h]}) use=0 -> EVICT`);
        victims.push(v); slots[h] = 'N' + f; bits[h] = 1; h = (h + 1) % n;
        log.push(`Fault ${f}: ${sweep.join('; ')}; N${f} loaded with use=1, hand -> slot ${names[h]}`);
      }
      if (cleared < 2) continue;
      return {
        kind: 'sim', q: `Clock algorithm, ${n} frames arranged in a circle. Three page faults occur in a row with no other memory references in between (the only use bit set during these faults is the newly loaded page's, set to 1 when it is referenced). For each fault the OS runs the clock; the newly loaded page N1, N2, N3 gets use bit 1 and the hand then advances to the slot after the victim. Bits cleared by the OS stay cleared.`,
        state: { table: { head: ['Slot', ...names], rows: [['Page', ...names], ['Use bit', ...bits0.map(String)]] }, text: `The clock hand initially points at slot ${names[h0]}.` },
        fields: [
          { label: 'Page evicted by fault 1', ans: victims[0], kind: 'text' },
          { label: 'Page evicted by fault 2', ans: victims[1], kind: 'text' },
          { label: 'Page evicted by fault 3', ans: victims[2], kind: 'text' },
          { label: 'Slot the hand points at afterwards', ans: names[h], kind: 'text' },
          { label: 'Total number of use bits cleared (1 -> 0) during the three faults', ans: cleared, kind: 'num' },
        ],
        steps: log.join('\n') + `\n-> victims ${victims.join(', ')}; hand at slot ${names[h]}; ${cleared} bit(s) cleared. The bits cleared during fault 1 stay 0, so fault 2 starts its sweep where fault 1 stopped and bits cleared in fault 1 remain 0 for fault 2's sweep.`,
      };
    }
    throw new Error('clockSweep failed');
  };
  QZ.GEN_LABEL.clockSweep = 'Clock hand sweep (multi-eviction)';

  /* ============================== generated: AMAT with other numbers ============================== */
  QZ.gens.amatVar = () => {
    const tm = pick([100, 200, 50]), tdms = pick([5, 8, 10]), td = tdms * 1e6, pm = pick([0.0001, 0.0005, 0.001, 0.005, 0.01]);
    const amat = (1 - pm) * tm + pm * td, slow = amat / tm;
    const pmax = 0.1 * tm / (td - tm) * 100; // percent
    const pct = pm * 100;
    return {
      kind: 'sim', q: 'AMAT = P_hit * T_M + P_miss * T_D. Answer all three parts.',
      state: { text: `T_M = ${tm} ns (memory access)\nT_D = ${tdms} ms (disk access) = ${td.toLocaleString('en-US')} ns\nPage fault (miss) probability = ${pct}%` },
      fields: [
        { label: 'AMAT in ns', ans: amat, kind: 'num', tol: 0.01, unit: 'ns' },
        { label: 'AMAT / T_M (how many times slower than a pure hit)', ans: slow, kind: 'num', tol: 0.02 },
        { label: 'Largest miss probability (in %) for which AMAT stays within 10% of T_M (AMAT <= 1.1 * T_M)', ans: pmax, kind: 'num', tol: 0.03, unit: '%' },
      ],
      steps: `AMAT = ${(1 - pm)} * ${tm} + ${pm} * ${td.toLocaleString('en-US')} = ${amat.toFixed(1)} ns\nratio = ${amat.toFixed(1)} / ${tm} = ${slow.toFixed(1)}x\nAMAT = T_M + p*(T_D - T_M) <= 1.1*T_M  =>  p <= 0.1*${tm} / (${td.toLocaleString('en-US')} - ${tm}) p = ${(pmax / 100).toExponential(3)} (fraction) = ${pmax.toExponential(3)} %\nThe miss penalty is so large that even a tiny miss rate dominates the average.`,
    };
  };
  QZ.GEN_LABEL.amatVar = 'AMAT with other miss rates';

  /* ============================== generated: history of one anonymous page ============================== */
  QZ.gens.pageHistory = () => {
    // model: page is anonymous, starts as a zero-filled, unmodified, never-swapped page in memory
    let dirty = false, copy = false, zero = true; const lines = []; const events = []; const fields = []; let writes = 0;
    for (let r = 1; r <= 4; r++) {
      const op = pick(['', 'W', 'R']);
      if (op === 'W') { dirty = true; zero = false; events.push(`${events.length + 1}. The process WRITES to the page`); lines.push(`write: dirty = 1; any swap copy is now stale`); copy = false; }
      else if (op === 'R') { events.push(`${events.length + 1}. The process only READS the page`); lines.push('read: nothing changes'); }
      let act;
      if (dirty) { act = 'write'; copy = true; writes++; }
      else if (copy) act = 'drop';
      else act = 'none';
      events.push(`${events.length + 1}. The page is EVICTED  (eviction #${r})`);
      fields.push({ label: `Eviction #${r}: what happens? (write / drop / none)`, ans: act === 'write' ? 'write|swap|write to swap' : act === 'drop' ? 'drop|dropped|discard' : 'none|no write|nothing', kind: 'text' });
      lines.push(`eviction #${r}: dirty=${dirty ? 1 : 0}, valid swap copy=${copy ? 'yes' : 'no'}${zero && !copy ? ', still zero page' : ''} -> ${act === 'write' ? 'WRITE to swap (dirty), swap copy now valid' : act === 'drop' ? 'DROP (clean, swap copy valid)' : 'NONE (unmodified zero page, nothing worth saving)'}`);
      dirty = false;
      events.push(`${events.length + 1}. The page is touched again (page fault, brought back in)`);
      lines.push(copy ? 'fault: read from swap, page is clean with a valid swap copy' : 'fault: zero page is recreated, clean, still no swap copy');
    }
    fields.push({ label: 'Total number of writes to swap space', ans: writes, kind: 'num' });
    return {
      kind: 'sim', q: 'An anonymous page starts as an unmodified zero page in memory that was never swapped. Events happen in the order listed. Memory is full, so every "evicted" event really evicts it. For each eviction state the action: write (written to swap), drop (just removed, swap copy reused) or none (no swap write at all since it is an unmodified zero page).',
      state: { text: events.join('\n') },
      fields,
      steps: lines.join('\n') + `\n-> ${writes} write(s). Rules: dirty -> write; clean with valid swap copy -> drop; unmodified zero page -> nothing to write; a write after a swap-in makes the old swap copy stale.`,
    };
  };
  QZ.GEN_LABEL.pageHistory = 'swap history of an anonymous page';

  QZ.add([
    G(8, 'page replacement', 'traceFIFO', { ref: 'L8 p.16', lvl: 2 }),
    G(8, 'page replacement', 'traceLRU', { ref: 'L8 p.19', lvl: 2 }),
    G(8, 'page replacement', 'traceOPT', { ref: 'L8 p.15', lvl: 3 }),
    G(8, 'page replacement', 'traceRand', { ref: 'L8 p.18', lvl: 2 }),
    G(8, 'workload', 'loopSim', { ref: 'L8 p.22', lvl: 2 }),
    G(8, 'Belady', 'belady', { ref: 'L8 p.17', lvl: 3 }),
    G(8, 'Clock', 'clockSweep', { ref: 'L8 p.23', lvl: 3 }),
    G(8, 'AMAT', 'amatVar', { ref: 'L8 p.14', lvl: 2 }),
    G(8, 'eviction', 'pageHistory', { ref: 'L8 p.10-11', lvl: 3 }),
  ]);
})();
