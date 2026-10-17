/* Lecture 5 extension: ORDER / MATCH / SIM items (address translation) */
(function () {
  const { M, O, X, SIM, G } = QZ.mk;
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[R(0, a.length - 1)];
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = R(0, i); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const hex = (n, w = 0) => '0x' + n.toString(16).toUpperCase().padStart(w, '0');
  const lo = (n, w = 0) => n.toString(16).padStart(w, '0');

  /* ===================== generated simulations ===================== */

  /* 1. segmentation: full check order with random segment table / VA / access */
  QZ.gens.segXlate = () => {
    const names = ['Code', 'Data', 'Heap', 'Stack'], prots = ['RO-X', 'RW', 'RW', 'RW'];
    const bounds = names.map(() => pick([0x200, 0x400, 0x600, 0x800]));
    let addr = pick([0x4000, 0x5000, 0x6000]);
    const base = [];
    shuffle([0, 1, 2, 3]).forEach(i => { base[i] = addr; addr += bounds[i] + pick([0, 0x200, 0x400, 0x1000]); });
    const V = [1, 1, 1, 1];
    if (Math.random() < 0.45) V[R(0, 3)] = 0;
    const seg = R(0, 3), op = pick(['read', 'write', 'execute (instruction fetch)']);
    const offset = Math.random() < 0.4 ? R(0, bounds[seg] - 1) : R(bounds[seg], bounds[seg] + 0x300);
    const va = (seg << 14) | offset;
    const allowed = op === 'read' ? true : op === 'write' ? prots[seg] === 'RW' : prots[seg] === 'RO-X';
    let stage, pa;
    if (!V[seg]) stage = 'valid'; else if (!allowed) stage = 'prot'; else if (offset >= bounds[seg]) stage = 'bound'; else stage = 'none';
    pa = stage === 'none' ? base[seg] + offset : null;
    const steps = [
      `VA = ${hex(va, 4)} = ${va.toString(2).padStart(16, '0')} (binary)`,
      `1. split: top 2 bits = ${(seg).toString(2).padStart(2, '0')} -> segment # ${seg} (${names[seg]}); low 14 bits = offset ${hex(offset)}`,
      `2. entry ${seg}: base ${hex(base[seg], 4)}, bound ${hex(bounds[seg], 4)}, ${prots[seg]}, V=${V[seg]}`,
      `3. valid check: V=${V[seg]} -> ${V[seg] ? 'pass' : 'FAULT (stop here, nothing else is looked at)'}`,
    ];
    if (V[seg]) {
      steps.push(`4. prot check: ${op} on ${prots[seg]} -> ${allowed ? 'pass' : 'FAULT (RO-X = read/execute only, RW = read/write only)'}`);
      if (allowed) {
        steps.push(`5. bound check: offset ${hex(offset)} < bound ${hex(bounds[seg])}? -> ${offset < bounds[seg] ? 'yes' : 'NO -> segmentation violation'}`);
        if (offset < bounds[seg]) steps.push(`6. PA = base + offset = ${hex(base[seg], 4)} + ${hex(offset)} = ${hex(pa)}`);
      }
    }
    steps.push(`Order of checks: valid -> prot -> bound -> base + offset. Result: ${stage === 'none' ? hex(pa) : 'fault, stopped by the ' + stage + ' check'}.`);
    return {
      kind: 'sim',
      q: 'Segmented MMU. 16-bit VA: the top 2 bits are the segment #, the low 14 bits are the offset. Bound = segment size. RO-X = read and execute only; RW = read and write only. Checks are done in the order the hardware does them. The Grows field is omitted: treat every segment as growing forward. Fill in the translation of the access below.',
      state: {
        table: { head: ['#', 'Segment', 'Base', 'Bound', 'Prot', 'V'], rows: names.map((n, i) => [String(i), n, hex(base[i], 4), hex(bounds[i], 4), prots[i], String(V[i])]) },
        text: `Access: ${op} at VA ${hex(va, 4)}`,
      },
      fields: [
        { label: 'Segment # (decimal)', ans: seg, kind: 'num' },
        { label: 'Offset (hex)', ans: `${lo(offset)}|${hex(offset).toLowerCase()}|${lo(offset, 4)}`, kind: 'text' },
        { label: 'Which check stops the access? (valid / prot / bound / none)', ans: { valid: 'valid|V|valid bit', prot: 'prot|protection|prot bits', bound: 'bound|offset|bounds', none: 'none|no|ok' }[stage], kind: 'text' },
        { label: 'Physical address (hex), or "fault"', ans: pa === null ? 'fault' : `${lo(pa)}|${hex(pa).toLowerCase()}`, kind: 'text' },
      ],
      steps: steps.join('\n'),
    };
  };

  /* 2. context switch A -> B with base/bound registers, either bound convention */
  QZ.gens.ctxSwitch = () => {
    const sizeA = pick([8, 12]), sizeB = sizeA + pick([4, 8]);
    const baseA = pick([16, 20, 24]), baseB = baseA + sizeA + pick([0, 4]);
    const conv = pick(['size', 'end']);
    const bA = conv === 'size' ? sizeA : baseA + sizeA, bB = conv === 'size' ? sizeB : baseB + sizeB;
    const va = Math.random() < 0.5 ? R(1, sizeA - 1) : R(sizeA, sizeB - 1);
    const good = baseB + va, stale = va < sizeA ? baseA + va : null;
    const convTxt = conv === 'size' ? 'In this system the bound register holds the SIZE of the address space.' : 'In this system the bound register holds the END physical address of the region.';
    return {
      kind: 'sim',
      q: 'Base & bound, all values in KB. The timer fires while A is running, and the OS switches to B. ' + convTxt,
      state: {
        table: { head: ['Process', 'Physical region'], rows: [['A (running now)', `${baseA}KB - ${baseA + sizeA}KB`], ['B (next)', `${baseB}KB - ${baseB + sizeB}KB`]] },
        text: `Registers now hold A's values. B will access VA = ${va}KB right after the switch.`,
      },
      fields: [
        { label: "A's base saved in its PCB (KB)", ans: baseA, kind: 'num' },
        { label: "A's bound saved in its PCB (KB)", ans: bA, kind: 'num' },
        { label: 'Base register after the switch (KB)', ans: baseB, kind: 'num' },
        { label: 'Bound register after the switch (KB)', ans: bB, kind: 'num' },
        { label: "PA of B's VA after a CORRECT switch (KB)", ans: good, kind: 'num' },
        { label: "PA of B's VA if the OS FORGOT to reload (KB, or fault)", ans: stale === null ? 'fault' : `${stale}|${stale}KB|${stale} KB`, kind: 'text' },
      ],
      steps: `1. Save: registers (base, bound) = (${baseA}, ${bA}) are copied into A's PCB.\n2. Restore: B's PCB values (${baseB}, ${bB}) are loaded into the registers.\n3. Correct translation: ${conv === 'size' ? `${va}KB < ${sizeB}KB (B's size)` : `base + VA = ${baseB + va}KB < ${bB}KB (B's end)`} -> PA = ${baseB} + ${va} = ${good}KB.\n4. Forgot to reload: the MMU still checks against A's registers. A's size is ${sizeA}KB: ${va}KB ${va < sizeA ? '< ' + sizeA + 'KB passes -> PA = ' + baseA + ' + ' + va + ' = ' + stale + 'KB, which lies inside A (protection hole!)' : '>= ' + sizeA + 'KB -> fault, although B is allowed to touch that address'}.\n(In the end-address form, the check is base + VA < bound; the size is bound - base.)`,
    };
  };

  /* 3. bound convention conversion */
  QZ.gens.bbConv = () => {
    const base = pick([16, 20, 24, 32, 40]), size = pick([8, 12, 16]);
    const shown = pick(['size', 'end']);
    const va = size + pick([-2, -1, 0, 1, 2]);
    const ok = va < size;
    return {
      kind: 'sim',
      q: `Base & bound, all values in KB. base = ${base}. The bound register holds ${shown === 'size' ? size + ' (the SIZE of the address space)' : (base + size) + ' (the END physical address of the region)'}. VA = ${va}.`,
      state: { text: shown === 'size' ? 'Convention of p.12-13: bound = size.' : 'Convention of the context-switch figure (p.18): bound = end address.' },
      fields: [
        { label: shown === 'size' ? 'Same bound written as an END address' : 'Same bound written as a SIZE', ans: shown === 'size' ? base + size : size, kind: 'num' },
        { label: 'PA of the VA (KB), or fault', ans: ok ? `${base + va}|${base + va}KB|${base + va} KB` : 'fault', kind: 'text' },
      ],
      steps: `size = ${size}, end = base + size = ${base + size}.\nsize form: legal iff VA < size: ${va} < ${size} -> ${ok}.\nend form: legal iff base + VA < end: ${base + va} < ${base + size} -> ${ok}. Both forms must agree.\n${ok ? 'PA = ' + base + ' + ' + va + ' = ' + (base + va) + 'KB' : `fault (VA ${va} is not < size ${size})`}.`,
    };
  };

  /* 4. instruction-level translation trace */
  QZ.gens.instrTrace = () => {
    const base = pick([16, 20, 24, 32, 40, 48]) * 1024, pc0 = pick([128, 256, 512, 1024]);
    const pc1 = pc0 + 4, pc2 = pc1 + 3, ebxKB = pick([12, 13, 14, 15]), ebx = ebxKB * 1024;
    return {
      kind: 'sim',
      q: `Base & bound with base = ${base / 1024}KB and a 16KB address space (bound = 16KB). ebx holds ${ebxKB}KB. Program (VA : instruction). Every memory reference, including instruction fetches, is translated. Answer in bytes (decimal).`,
      state: { code: `${pc0} : movl 0x0(%ebx), %eax   ; load\n${pc1} : addl $0x03, %eax       ; register only\n${pc2} : movl %eax, 0x0(%ebx)   ; store` },
      fields: [
        { label: 'Number of translated references while running the 3 instructions', ans: 5, kind: 'num' },
        { label: 'PA of the fetch of the 3rd instruction', ans: base + pc2, kind: 'num' },
        { label: 'PA read by the load', ans: base + ebx, kind: 'num' },
        { label: 'PA written by the store', ans: base + ebx, kind: 'num' },
      ],
      steps: `fetch ${pc0}: PA ${base + pc0}; load VA ${ebx}: PA ${base + ebx}\nfetch ${pc1}: PA ${base + pc1}; addl: no memory reference\nfetch ${pc2}: PA ${base + pc2}; store VA ${ebx}: PA ${base + ebx}\nTotal: 3 fetches + load + store = 5 translations. The store and the load hit the same location. Every VA is below 16KB, so no bound fault.`,
    };
  };

  /* 5. free list on start / terminate */
  QZ.gens.freeList = () => {
    for (;;) {
      const cells = Array.from({ length: 12 }, () => (Math.random() < 0.45 ? 0 : 1));
      const runs = []; let i = 0;
      while (i < 12) { let j = i; while (j < 12 && cells[j] === cells[i]) j++; runs.push({ free: cells[i] === 0, start: 16 + 4 * i, size: 4 * (j - i) }); i = j; }
      const holes = runs.filter(r => r.free), procs = runs.filter(r => !r.free);
      if (holes.length < 2 || holes.length > 4 || procs.length < 2) continue;
      procs.forEach((p, k) => { p.name = 'P' + (k + 1); });
      const maxH = Math.max(...holes.map(h => h.size));
      const s = 4 * R(1, maxH / 4);
      const h = holes.find(x => x.size >= s);
      const remain = h.size - s;
      const nStart = holes.length - (remain === 0 ? 1 : 0);
      const P = pick(procs);
      return {
        kind: 'sim',
        q: `64KB physical memory, the OS occupies 0-16KB. Base & bound, so each process needs ONE contiguous range. The free list is kept in address order and the OS uses first-fit (lowest-address hole that is large enough), placing the process at the start of the hole. Step 1: a new process D needs ${s}KB. Step 2: process ${P.name} then terminates (its range is put back on the free list as a new node; as in the slide figure, adjacent nodes are NOT merged).`,
        state: {
          table: { head: ['Range', 'Contents'], rows: runs.map(r => [`${r.start}KB - ${r.start + r.size}KB`, r.free ? 'free' : r.name]) },
          text: 'Free list (start, size): ' + holes.map(x => `(${x.start}KB, ${x.size}KB)`).join(' -> '),
        },
        fields: [
          { label: 'Start address of D (KB)', ans: h.start, kind: 'num' },
          { label: 'Size left in the hole D was taken from (KB; 0 if the node disappears)', ans: remain, kind: 'num' },
          { label: 'Number of free-list nodes after D is placed', ans: nStart, kind: 'num' },
          { label: `Number of free-list nodes after ${P.name} terminates`, ans: nStart + 1, kind: 'num' },
        ],
        steps: `First-fit scan in address order: ${holes.map(x => `(${x.start},${x.size})${x.size >= s ? ' fits' : ' too small'}`).join(', ')} -> D goes to the first hole that fits, start ${h.start}KB.\nThe hole shrinks from ${h.size}KB to ${remain}KB ${remain === 0 ? '(node removed)' : '(node now starts at ' + (h.start + s) + 'KB)'}, so the list has ${nStart} node(s).\n${P.name} (${P.start}KB-${P.start + P.size}KB) ends: its range becomes a new node, no merging -> ${nStart + 1} nodes.`,
      };
    }
  };

  QZ.GEN_LABEL.segXlate = 'segmentation check order';
  QZ.GEN_LABEL.ctxSwitch = 'context switch base/bound trace';
  QZ.GEN_LABEL.bbConv = 'bound = size vs end address';
  QZ.GEN_LABEL.instrTrace = 'instruction-level translation';
  QZ.GEN_LABEL.freeList = 'free list on start / exit';

  QZ.add([
    /* ---------------- ORDER ---------------- */
    O(5, 'segmentation', 'Segmentation hardware translates a virtual address. Put the steps in the order the MMU performs them.', [
      'Split the VA: top bits = segment number, low bits = offset',
      'Look up the segment table entry selected by the segment number',
      'Check the valid bit; fault if V = 0',
      'Check the protection bits against the access type; fault on a mismatch',
      'Check offset < bound; segmentation violation otherwise',
      'Compute PA = base + offset',
    ], { mode: 'recall', distract: ['Check the VA against the size of the whole address space', 'Add the process-wide base register to the whole VA', 'Reload the segment table from the PCB'], why: 'The entry must be found first; V = 0 means the entry itself is unusable, so it is checked before anything else. Protection and bound checks follow, and only an access that passed everything gets base + offset. A V = 0 access stops at the valid check even if its offset is also out of range.', ref: 'L5 p.22', lvl: 2 }),
    O(5, 'base-bound', 'Base & bound: order the events of one memory reference.', [
      'The CPU issues a virtual address',
      'The MMU compares the VA with the bound register',
      'If VA < bound, the MMU adds the base register to the VA',
      'The physical address is sent to memory (otherwise a protection fault is raised instead)',
    ], { mode: 'order', why: 'The bound check comes before the addition so an illegal VA never reaches physical memory.', ref: 'L5 p.12', lvl: 1 }),
    O(5, 'os-issues', 'Base & bound: arrange the life of a process from the memory-management point of view.', [
      'The OS searches the free list for a contiguous range large enough for the address space',
      'The OS sets the base and bound registers for the process',
      'On a context switch the OS saves the (base, bound) pair into the PCB',
      'On a later switch back the OS restores the pair from the PCB',
      'When the process terminates, its range is put back on the free list',
    ], { mode: 'order', why: 'These are the three critical junctures of the OS (start, context switch, terminate) placed in time order.', ref: 'L5 p.15-18', lvl: 1 }),
    O(5, 'os-issues', 'Switching from process A to process B under base & bound. Order the OS actions.', [
      'Stop A and enter the OS (timer interrupt)',
      "Save A's (base, bound) from the registers into A's PCB",
      "Read B's (base, bound) from B's PCB",
      "Load them into the base and bound registers",
      "Return to user mode; B's references now use B's translation",
    ], { mode: 'order', why: 'Save before restore, otherwise A\'s values are overwritten and lost. Returning to user mode last guarantees that B never runs with A\'s registers.', ref: 'L5 p.18', lvl: 2 }),
    O(5, 'compaction', 'Order the steps of compaction that makes one big hole out of scattered holes.', [
      'Stop the running process',
      'Copy its data to a new place in physical memory',
      'Change its segment register (base) value',
    ], { mode: 'recall', distract: ['Rewrite every absolute address in its binary', 'Flush the whole free list'], why: 'The process must not run while its memory moves; the copy follows; the base is updated so that the same VAs map to the new place. No address in the program needs to change because relocation is dynamic.', ref: 'L5 p.26', lvl: 2 }),
    O(5, 'relocation', 'Order the techniques in the lecture as they evolve (each fixes a weakness of the previous one).', [
      'Static relocation',
      'Fixed partitions',
      'Base & bound',
      'Segmentation',
      'Paging (next lecture)',
    ], { mode: 'order', why: 'Static relocation has no protection and cannot move; fixed partitions give internal fragmentation; base & bound is variable-size but contiguous with no partial sharing; segmentation has many base/bound pairs but still external fragmentation; paging removes it.', ref: 'L5 p.5-26', lvl: 1 }),

    /* ---------------- MATCH: design points matrix, one per axis ---------------- */
    X(5, 'matrix', 'Design point 1 - memory PROTECTION. Match each technique with how it protects (or not).', [
      ['Static relocation', 'No protection: nothing is checked at run time'],
      ['Base & bound', 'One bound comparison per reference, protection fault on violation'],
      ['Segmentation', 'Per-segment valid bit and read/write/execute bits'],
      ['Dynamic relocation (general)', 'MMU raises an exception for an invalid address'],
    ], { why: 'Static relocation only rewrites addresses before loading. Dynamic relocation puts the check in the MMU; base & bound has a single bound, segmentation has per-segment V and Prot.', ref: 'L5 p.5,8,14,22', lvl: 2 }),
    X(5, 'matrix', 'Design point 2 - HARDWARE required. Match each technique with its hardware.', [
      ['Static relocation', 'No special hardware'],
      ['Fixed partitions', 'A base register only'],
      ['Base & bound', 'Base register and bound register'],
      ['Segmentation', 'Segment table/registers with base, bound, Grows, Prot and V'],
    ], { why: 'The hardware grows with the flexibility: nothing -> base -> base + bound -> a table of base/bound/protection entries.', ref: 'L5 p.5,11,14,22', lvl: 1 }),
    X(5, 'matrix', 'Design point 3 - FRAGMENTATION. Match each technique with the waste it produces.', [
      ['Fixed partitions', 'Internal: unused space inside an equal-size slot'],
      ['Base & bound', 'Internal (unused heap-stack gap) and external (scattered holes, reduced by compaction)'],
      ['Segmentation', 'External per segment, plus internal inside a heap segment'],
      ['Static relocation', 'External: loaded processes cannot be moved to merge holes'],
    ], { why: 'Fixed-size units -> internal; variable-size contiguous units -> external. Segments are contiguous so external remains; freed objects in a heap segment leave internal waste.', ref: 'L5 p.6-7,11,14,25', lvl: 2 }),
    X(5, 'matrix', 'Design point 4 - SHARING UNIT. Match each technique with what can be shared.', [
      ['Static relocation', 'Nothing can be shared'],
      ['Base & bound', 'Only the whole address space (no partial sharing)'],
      ['Segmentation', 'A segment, such as read-only code or a shared library'],
      ['Paging (next lecture)', 'A page'],
    ], { why: 'The sharing unit is the unit that has its own translation entry: one block, one segment, one page.', ref: 'L5 p.14,23-24', lvl: 2 }),
    X(5, 'matrix', 'Design point 5 - MAIN WEAKNESS (the motivation for the next technique). Match each technique with its weakness.', [
      ['Static relocation', 'Cannot move after loading; no protection'],
      ['Fixed partitions', 'One partition size does not fit all processes'],
      ['Base & bound', 'The unused gap between heap and stack still occupies physical memory'],
      ['Segmentation', 'Each segment must be contiguous, so external fragmentation and costly compaction'],
    ], { why: 'Each weakness motivates the next step in the evolution; segmentation\'s contiguity leads to paging.', ref: 'L5 p.6,11,19,25-26', lvl: 2 }),
    X(5, 'os-issues', 'Match each OS situation under base & bound with the action the OS must take.', [
      ['A process starts running', 'Find a contiguous range for its address space in the free list'],
      ['A process terminates', 'Put its range back on the free list'],
      ['A context switch occurs', 'Save and restore the (base, bound) pair via the PCB'],
      ['Compaction', 'Stop the process, copy the data, change the register value'],
    ], { why: 'The first three are the three critical junctures; compaction is the extra OS work caused by external fragmentation.', ref: 'L5 p.15-18,26', lvl: 1 }),
    X(5, 'segmentation', 'Match each way of choosing the segment with its description.', [
      ['Explicit approach', 'Top bits of the virtual address are the segment number'],
      ['Implicit approach', 'The type of memory reference decides the segment'],
      ['PC-based addressing', 'Code segment'],
      ['SP- or BP-based addressing', 'Stack segment'],
    ], { why: 'Explicit = part of the address; implicit = determined by how the address is formed.', ref: 'L5 p.21', lvl: 2 }),
    X(5, 'segmentation', 'Match each segment table field with its role.', [
      ['Base', 'Starting physical address of the segment'],
      ['Bound', 'Size of the segment, compared with the offset'],
      ['Grows', 'Direction the segment extends, needed because the stack grows backward'],
      ['Prot', 'Read/write/execute permission bits'],
      ['V', 'Whether the entry is usable at all'],
    ], { why: 'Every entry is a base/bound pair extended with growth direction, protection and validity information.', ref: 'L5 p.22', lvl: 1 }),

    X(5, 'hw', 'Hardware or OS? Match each task under base & bound with who does it and how.', [
      ['Compare each VA with the bound', 'MMU: on every reference, so it must be fast'],
      ['Add the base to a legal VA', 'MMU: the per-reference addition'],
      ['Raise the exception on a violation', 'MMU detects it and raises it; the OS then handles it'],
      ['Find space for a new address space', 'OS: search the free list at process creation'],
      ['Save and restore (base, bound) at a context switch', 'OS: copy the pair to and from the PCB'],
    ], { why: 'Anything done on every memory reference is hardware (it must be fast); policy and bookkeeping (free list, PCB, setting the registers) are software.', ref: 'L5 p.8,15-18', lvl: 1 }),

    /* ---------------- fixed SIMs ---------------- */
    SIM(5, 'segmentation', 'The slide\'s segment table is used. 16-bit VA: top 2 bits = segment #, low 14 bits = offset. Translate the accesses (checks in order: valid, prot, bound).', {
      table: { head: ['#', 'Segment', 'Base', 'Bound', 'Prot', 'V'], rows: [['0', 'Code', '0x8000', '0x0800', 'RO-X', '1'], ['1', 'Data', '0x8800', '0x0400', 'RW', '1'], ['2', 'Heap', '0x9000', '0x0800', 'RW', '1'], ['3', 'Stack', '0x7000', '0x0800', 'RW', '1']] },
      text: 'Access a: read VA 0x4362\nAccess b: read VA 0x8362\nAccess c: write VA 0x0900\nAccess d: as b, but assume V = 0 in the Heap row (the table shows the original V = 1)',
    }, [
      { label: 'a: physical address (hex)', ans: '8b62|0x8b62', kind: 'text' },
      { label: 'b: physical address (hex)', ans: '9362|0x9362', kind: 'text' },
      { label: 'c: which check stops it? (valid / prot / bound)', ans: 'prot|protection|prot bits', kind: 'text' },
      { label: 'd: which check stops it? (valid / prot / bound)', ans: 'valid|V|valid bit', kind: 'text' },
    ], { steps: 'a: 0x4362 = 01|00 0011 0110 0010 -> seg 1 (Data), offset 0x362 < 0x400 -> 0x8800 + 0x362 = 0x8B62.\nb: 0x8362 = 10|... -> seg 2 (Heap), offset 0x362 < 0x800 -> 0x9000 + 0x362 = 0x9362.\nc: seg 0 (Code), offset 0x900 is beyond the bound 0x800 AND the write violates RO-X; the prot check comes before the bound check, so the stopping check is prot.\nd: V = 0 is checked first, so the access faults at the valid check.', ref: 'L5 p.22', lvl: 2 }),
    SIM(5, 'os-issues', 'The slide figure of the context switch (bounds given as END addresses): A is running at 32KB-48KB with base = 32KB, bounds = 48KB; B sits at 48KB-64KB. The OS switches to B.', {
      text: 'Process B accesses VA 6KB just after the switch.',
    }, [
      { label: 'Value saved in A\'s PCB: base (KB)', ans: 32, kind: 'num' },
      { label: 'Value saved in A\'s PCB: bounds (KB)', ans: 48, kind: 'num' },
      { label: 'Base register after the switch (KB)', ans: 48, kind: 'num' },
      { label: 'Bounds register after the switch (KB)', ans: 64, kind: 'num' },
      { label: 'PA of B\'s VA 6KB (KB)', ans: 54, kind: 'num' },
      { label: 'PA of that access if the OS forgot to reload the registers (KB, or fault)', ans: '38|38KB|38 KB', kind: 'text' },
    ], { steps: 'Save (32, 48) in A\'s PCB; load B\'s (48, 64) into the registers.\nCorrect: PA = 48 + 6 = 54KB.\nForgot to reload: registers still (32, 48), size 16KB; 6KB is legal -> PA = 32 + 6 = 38KB, which is inside A. No fault is raised, so B silently reads A\'s memory.', ref: 'L5 p.18', lvl: 2 }),
    SIM(5, 'base-bound', 'One region, two conventions. A process lives at physical 32KB-48KB.', {
      text: 'Convention 1 (p.12-13): bound = size.\nConvention 2 (context-switch figure, p.18): bound = end address.\nbase = 32KB for both.',
    }, [
      { label: 'Bound register value in convention 1 (KB)', ans: 16, kind: 'num' },
      { label: 'Bound register value in convention 2 (KB)', ans: 48, kind: 'num' },
      { label: 'PA of VA 10KB (KB)', ans: 42, kind: 'num' },
      { label: 'Result for VA 16KB (PA in KB, or fault)', ans: 'fault', kind: 'text' },
    ], { steps: 'size = 16KB; end = 32 + 16 = 48KB.\nVA 10KB: 10 < 16 (or 32 + 10 = 42 < 48) -> PA 42KB.\nVA 16KB: 16 < 16 is false (or 32 + 16 = 48 < 48 is false) -> fault in both conventions. Always check which convention the question uses.', ref: 'L5 p.12-13,18', lvl: 2 }),
    SIM(5, 'translation', 'Instruction-level view: base & bound with base = 32KB, bound = 16KB (size). ebx = 15KB. The three instructions are at VA 128, 132 and 135.', {
      code: '128 : movl 0x0(%ebx), %eax   ; load 0+ebx into eax\n132 : addl $0x03, %eax       ; add 3 to eax\n135 : movl %eax, 0x0(%ebx)   ; store eax back to memory',
    }, [
      { label: 'How many references are translated in total?', ans: 5, kind: 'num' },
      { label: 'PA of the fetch at VA 132 (bytes)', ans: 32900, kind: 'num' },
      { label: 'PA read by the load (bytes)', ans: 48128, kind: 'num' },
      { label: 'Number of data-memory references made by the addl', ans: 0, kind: 'num' },
    ], { steps: 'fetch 128 -> 32768 + 128 = 32896; load VA 15360 -> 32768 + 15360 = 48128; fetch 132 -> 32900; addl uses registers only (no data reference); fetch 135 -> 32903; store VA 15360 -> 48128.\nTotal 3 fetches + 2 data = 5 translations.', ref: 'L5 p.3', lvl: 2 }),
    SIM(5, 'os-issues', 'Free list from the termination figure. Memory: OS 0-16KB, free 16-32KB, Process A 32-48KB, free 48-64KB. Free list: 16KB -> 48KB. Process A terminates (no merging of adjacent nodes, as in the figure).', {
      text: 'Free list before: (16KB) -> (48KB)',
    }, [
      { label: 'Start address of the new node (KB)', ans: 32, kind: 'num' },
      { label: 'Number of nodes after A terminates', ans: 3, kind: 'num' },
      { label: 'Start of the node that comes right before the new node (KB)', ans: 16, kind: 'num' },
    ], { steps: 'The OS puts A\'s range back on the free list: new node 32KB between 16KB and 48KB -> 16KB -> 32KB -> 48KB, 3 nodes. The figure does not coalesce the three adjacent nodes.', ref: 'L5 p.16-17', lvl: 1 }),
    SIM(5, 'segmentation', 'Sharing code between two processes using segmentation.', {
      table: { head: ['Process', '# / Segment', 'Base', 'Bound', 'Prot', 'V'], rows: [['P1', '0 Code', '0x8000', '0x0800', 'RO-X', '1'], ['P1', '1 Data', '0x8800', '0x0400', 'RW', '1'], ['P2', '0 Code', '?', '?', '?', '1'], ['P2', '1 Data', '0xA000', '0x0400', 'RW', '1']] },
      text: 'P2 runs the same program as P1 and shares the code in physical memory. Fill the ? entries and translate P2\'s read of VA 0x0010.',
    }, [
      { label: 'P2 Code: Base (hex)', ans: '8000|0x8000', kind: 'text' },
      { label: 'P2 Code: Bound (hex)', ans: '800|0x800|0800|0x0800', kind: 'text' },
      { label: 'P2 Code: Prot', ans: 'RO-X|ROX|RO X', kind: 'text' },
      { label: 'PA of P2 read at VA 0x0010 (hex)', ans: '8010|0x8010', kind: 'text' },
      { label: 'Must P2\'s Data entry equal P1\'s Data entry? (yes / no)', ans: 'no', kind: 'text' },
    ], { steps: 'Sharing = both tables point at the same physical region with identical protection bits: Base 0x8000, Bound 0x0800, RO-X. P2 VA 0x0010 -> seg 0, offset 0x10 -> 0x8010. Data is private, so P2 uses its own physical region (0xA000), which is why the Data entries differ.', ref: 'L5 p.23', lvl: 2 }),

    /* ---------------- generated SIM registrations ---------------- */
    G(5, 'segmentation', 'segXlate', { ref: 'L5 p.22', lvl: 3 }),
    G(5, 'os-issues', 'ctxSwitch', { ref: 'L5 p.18', lvl: 2 }),
    G(5, 'base-bound', 'bbConv', { ref: 'L5 p.12-13,18', lvl: 2 }),
    G(5, 'translation', 'instrTrace', { ref: 'L5 p.3', lvl: 2 }),
    G(5, 'os-issues', 'freeList', { ref: 'L5 p.16-17', lvl: 2 }),

    /* ---------------- MCQ fill-ins ---------------- */
    M(5, 'segmentation', 'Select all that are consistent with the slides about the STACK segment in segmentation.', [
      'The slide memo says the stack grows backward, so extra hardware support is needed for the growing direction when translating',
      'The segment table has a Grows field so the hardware knows how to interpret the offset of such a segment',
      'The stack and the heap can grow independently because each has its own base and bound',
      'The stack can use exactly the same translation rule as the code segment, so the Grows field is unnecessary',
      'The valid bit tells the hardware the growing direction',
    ], 'abc', 'Grows exists precisely because the stack is not a normal forward-growing segment; V only says whether the entry is usable.', { ref: 'L5 p.22,24', lvl: 2 }),
    M(5, 'segmentation', 'In segmentation translation, which check is performed immediately after the valid-bit check?', [
      'The protection bits against the access type',
      'offset < bound',
      'Base + offset is added',
      'The VA is compared with the size of the whole address space',
    ], 'a', 'Order: valid, prot, bound, then base + offset.', { ref: 'L5 p.22', lvl: 2 }),
    M(5, 'relocation', 'A loader rewrites the absolute addresses of a program before running it (static relocation). Select all consequences.', [
      'No run-time check exists, so the process is not protected from stray addresses',
      'The process cannot be moved after loading, because the rewritten addresses are fixed',
      'The OS can compact memory just by changing a register value',
      'An MMU is required to translate each reference',
      'Holes between loaded processes cannot be merged by moving them, causing external fragmentation',
    ], 'abe', 'Everything is done once at load time by software; a register-based move is the privilege of dynamic relocation.', { ref: 'L5 p.5-8', lvl: 2 }),
    M(5, 'hw', 'Select all tasks performed by HARDWARE (MMU) rather than by the OS in base & bound.', [
      'Comparing each virtual address with the bound register',
      'Adding the base register to produce the physical address',
      'Raising a protection fault when the bound is violated',
      'Finding space for a new address space on the free list',
      "Saving and restoring (base, bound) in the PCB on a context switch",
    ], 'abc', 'Per-reference translation and checking is hardware (it must be fast); setting the registers, free-list management and PCB handling are software.', { ref: 'L5 p.8,15-18', lvl: 1 }),
  ]);
})();
