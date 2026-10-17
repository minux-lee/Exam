/* Lecture 7 extension: ORDER / MATCH / SIM items (multi-level walk, translation order, TLB, superpages) */
(function () {
  const { O, X } = QZ.mk;
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[R(0, a.length - 1)];
  const lg = n => Math.round(Math.log2(n));
  const hx = n => '0x' + n.toString(16).toUpperCase();
  const bin = (n, w) => n.toString(2).padStart(w, '0');
  const G = QZ.gens;

  /* ======================= generated simulations ======================= */

  /* 1. random 2-level page table walk, 11-bit VA, 32B pages, 3+3 index bits */
  G.walk2 = () => {
    const OFF = 5, PTB = 3, PDB = 3, PS = 32;
    const dirIdx = []; while (dirIdx.length < 3) { const d = R(0, 7); if (!dirIdx.includes(d)) dirIdx.push(d); }
    dirIdx.sort((a, b) => a - b);
    const ptFrame = {}, pte = {};
    dirIdx.forEach((d, fi) => {
      ptFrame[d] = 16 + fi * 2;
      const idxs = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5).slice(0, 3).sort((x, y) => x - y);
      const pf = [...Array(16).keys()].sort(() => Math.random() - 0.5);
      pte[d] = {}; idxs.forEach((i, j) => { pte[d][i] = pf[j]; });
    });
    const kind = pick(['ok', 'ok', 'ok', 'pd', 'pt']);
    let pdi, pti;
    if (kind === 'ok') { pdi = pick(dirIdx); pti = +pick(Object.keys(pte[pdi])); }
    else if (kind === 'pd') { const inv = [0, 1, 2, 3, 4, 5, 6, 7].filter(d => !dirIdx.includes(d)); pdi = pick(inv); pti = R(0, 7); }
    else { pdi = pick(dirIdx); const inv = [0, 1, 2, 3, 4, 5, 6, 7].filter(i => !(i in pte[pdi])); pti = pick(inv); }
    const off = R(0, PS - 1);
    const va = (pdi << (PTB + OFF)) | (pti << OFF) | off;
    let res, acc, why;
    if (kind === 'pd') { res = 'fault'; acc = 1; why = `PD[${pdi}] is invalid -> page fault after 1 memory access (the PDE read).`; }
    else if (kind === 'pt') { res = 'fault'; acc = 2; why = `PD[${pdi}] -> PT page at frame ${ptFrame[pdi]}, but its entry ${pti} is invalid -> page fault after 2 memory accesses (PDE, PTE).`; }
    else { const pfn = pte[pdi][pti]; const pa = (pfn << OFF) | off; res = pa; acc = 3; why = `PD[${pdi}] -> PT page at frame ${ptFrame[pdi]}; its entry ${pti} -> PFN ${pfn}; PA = ${pfn}*32 + ${off} = ${pa} = ${hx(pa)}. Memory accesses: PDE, PTE, data = 3.`; }
    const rows = dirIdx.map(d => [String(d), 'frame ' + ptFrame[d], Object.keys(pte[d]).map(i => `${i}->PFN ${pte[d][i]}`).join(', ')]);
    const resAns = res === 'fault' ? 'fault|page fault|pagefault|invalid|exception' : [hx(res), res.toString(16).toUpperCase(), '0x' + res.toString(16).toUpperCase().padStart(3, '0'), res.toString(16).toUpperCase().padStart(3, '0')].join('|');
    return {
      kind: 'sim',
      q: `A machine has an 11-bit virtual address and 32-byte pages. The VPN is split into a 3-bit page-directory index and a 3-bit page-table index (each page-table page holds 8 PTEs; each PTE is 4 bytes). The TLB is empty, so the walk starts from the page directory. Only valid entries are listed; every other directory entry and every other PTE is invalid. Translate VA = ${hx(va)}.`,
      state: { table: { head: ['PD index', 'PT page', 'valid PTEs in that PT page (index -> PFN)'], rows } },
      fields: [
        { label: 'page-directory index', ans: pdi, kind: 'num' },
        { label: 'page-table index', ans: pti, kind: 'num' },
        { label: "PA in hex (or 'fault')", ans: resAns, kind: 'text' },
        { label: 'memory accesses made (PDE/PTE/data reads)', ans: acc, kind: 'num' },
      ],
      steps: `VA ${hx(va)} = ${bin(va, 11)} = [PD ${bin(pdi, 3)} | PT ${bin(pti, 3)} | offset ${bin(off, 5)}]\nPD index = ${pdi}, PT index = ${pti}, offset = ${off}\n${why}`,
    };
  };

  /* 2. designing the number of levels for a given VA width */
  G.levelDesign = () => {
    let va, ps, pte, k, off, vpn, lv;
    do {
      va = R(30, 48); ps = pick([512, 1024, 2048, 4096]); pte = pick([4, 8]);
      k = lg(ps / pte); off = lg(ps); vpn = va - off; lv = Math.ceil(vpn / k);
    } while (lv < 2 || lv > 5);
    const top = vpn - k * (lv - 1);
    const split = [top, ...Array(lv - 1).fill(k)].join(' + ');
    return {
      kind: 'sim',
      q: `Design a multi-level page table so that every table fits in one page (the top-level table may be smaller). VA width = ${va} bits, page size = ${ps} B, PTE size = ${pte} B.`,
      state: {},
      fields: [
        { label: 'offset bits', ans: off, kind: 'num' },
        { label: 'index bits per full level', ans: k, kind: 'num' },
        { label: 'number of levels', ans: lv, kind: 'num' },
        { label: 'index bits at the top level', ans: top, kind: 'num' },
      ],
      steps: `offset = log2(${ps}) = ${off}; VPN = ${va} - ${off} = ${vpn} bits\nPTEs per page = ${ps}/${pte} = ${ps / pte} = 2^${k} -> ${k} index bits per level\nlevels = ceil(${vpn}/${k}) = ${lv}\nsplit (top..bottom) = ${split} + offset ${off} = ${top + k * (lv - 1) + off} bits (top level uses ${top} bits, so its table is smaller than a page)\nA walk costs ${lv} table reads + 1 data read = ${lv + 1} memory accesses on a TLB miss.`,
    };
  };

  /* 3. array access TLB trace (page size / element size varied) */
  G.tlbTrace = () => {
    const ps = pick([16, 32, 64, 128]), es = pick([4, 8, 16].filter(e => e < ps)), n = R(8, 14);
    const base = ps * R(3, 30) + es * R(0, ps / es - 1);
    const seen = new Set(); let misses = 0, hits = 0; const rows = [];
    for (let i = 0; i < n; i++) {
      const a = base + i * es, v = Math.floor(a / ps);
      if (seen.has(v)) { hits++; rows.push(`a[${i}] @${hx(a)} VPN ${v}: hit`); } else { seen.add(v); misses++; rows.push(`a[${i}] @${hx(a)} VPN ${v}: MISS (loaded)`); }
    }
    const rate = Math.round(hits / n * 1000) / 10;
    return {
      kind: 'sim',
      q: `A loop reads a[0] ... a[${n - 1}] in order (only these array accesses are counted). Each element is ${es} bytes, a[0] is at virtual address ${hx(base)}, and the page size is ${ps} bytes. The TLB starts empty and is large enough that nothing is evicted.`,
      state: {},
      fields: [
        { label: 'TLB misses', ans: misses, kind: 'num' },
        { label: 'TLB hits', ans: hits, kind: 'num' },
        { label: 'hit rate', ans: rate, kind: 'num', unit: '%', tol: 0.01 },
      ],
      steps: `VPN = floor(address / ${ps}); the first access to each VPN misses, the rest hit (spatial locality).\n${rows.join('\n')}\nmisses = ${misses} (= pages touched), hits = ${hits}, hit rate = ${hits}/${n} = ${rate}%`,
    };
  };

  /* 4. TLB with base + superpage entries; THP walk length on a miss */
  G.spLookup = () => {
    const sps = []; while (sps.length < 2) { const s = R(1, 2000); if (!sps.includes(s)) sps.push(s); }
    const bases = []; while (bases.length < 2) { const b = R(1, 1000000); if (!sps.includes(b >> 9) && !bases.some(x => (x >> 9) === (b >> 9)) && !bases.includes(b)) bases.push(b); }
    const kind = pick(['base', 'super', 'miss', 'miss']);
    let va, huge;
    if (kind === 'base') { va = (pick(bases) * 4096) + R(0, 4095); huge = false; }
    else if (kind === 'super') { va = (pick(sps) * 2097152) + R(0, 2097151); huge = true; }
    else { let b, s; do { b = R(1, 1000000); s = b >> 9; } while (sps.includes(s) || bases.includes(b)); va = b * 4096 + R(0, 4095); huge = Math.random() < 0.5; }
    const e = kind === 'miss' ? 'none' : kind;
    const acc = kind === 'miss' ? (huge ? 4 : 5) : 1;
    const vpn = Math.floor(va / 4096), sp = Math.floor(va / 2097152);
    const why = kind === 'base' ? `VPN ${hx(vpn)} matches a base-page entry -> TLB hit; only the data access remains = 1.`
      : kind === 'super' ? `SP number ${hx(sp)} matches a superpage entry -> TLB hit (21-bit offset); only the data access = 1.`
        : `Neither VPN ${hx(vpn)} nor SP ${hx(sp)} is in the TLB -> TLB miss -> page walk. ${huge ? 'The region is a 2MB page: PGD, PUD, PMD (PS=1) = 3 table reads + 1 data = 4.' : 'The region is a 4KB page: PGD, PUD, PMD, PTE = 4 table reads + 1 data = 5.'}`;
    return {
      kind: 'sim',
      q: `x86_64 with a TLB that holds both 4KB-page entries (tagged by VPN = VA>>12) and 2MB-superpage entries (tagged by SP = VA>>21). A load to VA = ${hx(va)} arrives. The OS page table maps the region containing this address with ${huge ? 'a 2MB huge page (PS=1 in the PMD entry)' : 'a regular 4KB page'}. Count every memory access this load makes (table reads and the final data read).`,
      state: { table: { head: ['TLB entry', 'tag'], rows: [...bases.map(b => ['4KB page', 'VPN ' + hx(b)]), ...sps.map(s => ['2MB superpage', 'SP ' + hx(s)])] } },
      fields: [
        { label: "which TLB entry matches ('base', 'super' or 'none')", ans: e === 'base' ? 'base|base page|4kb|4k|page' : e === 'super' ? 'super|superpage|2mb|huge' : 'none|miss|no', kind: 'text' },
        { label: 'total memory accesses for this load', ans: acc, kind: 'num' },
      ],
      steps: `VA ${hx(va)}: VPN = ${hx(vpn)}, SP = ${hx(sp)}\ntags compared: VPN ${bases.map(b => hx(b)).join(', ')}; SP ${sps.map(x => hx(x)).join(', ')}\n${why}`,
    };
  };

  QZ.GEN_LABEL = Object.assign(QZ.GEN_LABEL || {}, {
    walk2: '2-level page walk', levelDesign: 'design page-table levels', tlbTrace: 'array TLB trace', spLookup: 'superpage TLB lookup',
  });

  /* ======================= items ======================= */
  const g = QZ.mk.G;
  QZ.add([
    g(7, 'multilevel', 'walk2', { ref: 'L7 p.9-11', lab: true, lvl: 2 }),
    g(7, 'multilevel', 'levelDesign', { ref: 'L7 p.11-13', lab: true, lvl: 2 }),
    g(7, 'tlb', 'tlbTrace', { ref: 'L7 p.20', lvl: 2 }),
    g(7, 'superpage', 'spLookup', { ref: 'L7 p.14,32', lab: true, lvl: 3 }),

    /* ---- ORDER ---- */
    O(7, 'multilevel', 'Put the steps of a two-level page-table walk (TLB miss, hardware-managed) in order.', [
      'Split the VA into page-directory index p1, page-table index p2 and offset d',
      'Read the page-directory entry at (directory base + p1) and check that it is valid',
      'Take the page-table page address from that entry',
      'Read the PTE at (that page-table page + p2) and check that it is valid',
      'Take the PFN from the PTE',
      'Form PA = PFN | d and read the data',
    ], { mode: 'recall', distract: ['Index the page directory with the offset d', 'Read the PTE first, then the directory entry', 'Allocate a fresh page-table page for p1 on every walk'], why: 'The directory must be read first because it tells where the page-table page is; the PTE read then yields the PFN; only after both pointer hops is PA formed. Cost: 2 table reads + 1 data read.', ref: 'L7 p.9,11', lab: true, lvl: 2 }),
    O(7, 'multilevel', 'Order the pointer chain a 3-level walk follows from the translation base register to the data byte.', [
      'Base register (CR3/satp) -> top-level directory',
      'Top-level entry -> second-level table page',
      'Second-level entry -> page-table page',
      'Page-table entry -> page frame',
      'Frame + offset -> the data byte',
    ], { mode: 'order', why: 'Each level index selects an entry whose content is the physical address of the next table; the last table yields the frame, and the offset is appended unchanged.', ref: 'L7 p.12', lvl: 1 }),
    O(7, 'multilevel', 'Order the x86_64 4KB-page walk starting from CR3.', [
      'CR3 gives the base of the PML4 table',
      'PML4E (bits 47-39) gives the PDPT',
      'PDPTE (bits 38-30) gives the page directory',
      'PDE (bits 29-21), with PS=0, gives the page table',
      'PTE (bits 20-12) gives the 4KB frame',
      'Frame + 12-bit offset gives the physical address',
    ], { mode: 'order', why: 'Four table reads (PML4E, PDPTE, PDE, PTE) precede the data read; each index is 9 bits.', ref: 'L7 p.14', lab: true, lvl: 2 }),
    O(7, 'hybrid', 'Hybrid (Multics) translation: put the steps in order.', [
      'Split the VA into segment, page# and offset',
      'Use the segment to select an entry in the segment table (found via the segment table register)',
      'Compare page# with the Size in that entry; raise an exception if page# is beyond it',
      'Use the entry\'s page-table address and page# to read the page-table entry',
      'Take the Frame from that entry',
      'Form PA = Frame | offset',
    ], { mode: 'recall', distract: ['Index the page table with the segment number', 'Flush the TLB before comparing sizes', 'Add the segment base to the VA'], why: 'The bounds check (page# vs Size) happens before the page table is read, so an out-of-range page# never touches the page table; the page table is per segment, so the segment entry must be consulted first.', ref: 'L7 p.5', lvl: 2 }),
    O(7, 'tlb', 'Translation with a TLB where the translation HITS: put the steps in order.', [
      'CPU issues a VA <p, d>',
      'Extract the VPN p',
      'Compare p with all TLB entries in parallel',
      'A valid entry matches (TLB hit)',
      'Take the PFN from the cached PTE',
      'Form <f, d> and access memory',
    ], { mode: 'order', why: 'On a hit the page table is not read at all: only the final data access touches memory.', ref: 'L7 p.23', lvl: 1 }),
    O(7, 'tlb', 'Hardware-managed TLB, valid PTE, TLB miss: put the events in order.', [
      'CPU issues a read to a VA and the VPN is extracted',
      'The TLB lookup finds no matching entry (miss)',
      'The MMU computes the PTE address from the page-table base (CR3/satp) and the VPN',
      'The MMU reads the PTE from memory; it is valid',
      'The PTE is loaded into the TLB and the translation restarts',
      'The restarted lookup hits; PA is built from the PFN and the offset',
      'The data is read from memory into the register',
    ], { mode: 'recall', distract: ['The CPU traps to the OS, which loads the PTE with a privileged instruction', 'The whole TLB is flushed before the walk starts', 'A page fault is raised because the TLB missed'], why: 'A TLB miss is not a page fault: the hardware walker (no OS involvement) fetches the PTE, fills the TLB and retries. The OS trap path belongs to the software-managed TLB.', ref: 'L7 p.17,28-29', lvl: 2 }),
    O(7, 'tlb', 'Software-managed TLB miss: put the events in order.', [
      'Lookup misses in the TLB',
      'The CPU traps into the OS',
      'The OS looks up the PTE in its own page table (any format)',
      'The OS loads the PTE into the TLB with a privileged instruction',
      'The OS returns from the exception',
      'The translation is restarted and now hits',
    ], { mode: 'recall', distract: ['The MMU walks the page table at CR3', 'The OS flushes the TLB and does not retry', 'The OS allocates a new frame before reading the PTE'], why: 'The CPU cannot read the page table itself, so the OS handler supplies the PTE; only after the handler returns can the instruction be retried and hit.', ref: 'L7 p.24,29', lvl: 2 }),
    O(7, 'tlb', 'TLB shootdown after the OS changes a PTE shared by threads on several cores: put the steps in order.', [
      'The initiating core changes the PTE in the page table',
      'It sends an IPI to the remote cores',
      'Each remote core invalidates the stale entry (or flushes its TLB)',
      'The remote cores finish and the initiator, which was waiting, continues',
    ], { mode: 'recall', distract: ['Hardware automatically copies the new PTE into every core\'s TLB', 'The initiator continues immediately without waiting for the remote cores', 'The remote cores reload the PTE before the page table is changed'], why: 'The PTE must change first (otherwise a remote core could re-cache the old PTE after invalidating); then IPIs, which cost several hundred cycles; the initiator waits so that no core still holds a stale translation when it proceeds.', ref: 'L7 p.27', lab: true, lvl: 2 }),
    O(7, 'superpage', 'Order the Linux x86_64 walk that ends in a 2MB transparent huge page.', [
      'CR3 gives the PGD',
      'The PGD entry gives the PUD',
      'The PUD entry gives the PMD',
      'The PMD entry points directly to the 2MB huge page',
      'The 21-bit offset selects the byte inside the huge page',
    ], { mode: 'recall', distract: ['The PMD entry points to a PTE table that is read next', 'A fifth table read happens at the PTE level'], why: 'The huge-page walk stops at the PMD entry, so only 3 table reads precede the data (4 with a regular 4KB page), and the offset is 21 bits (2MB = 2^21).', ref: 'L7 p.32', lvl: 2 }),
    O(7, 'superpage', 'Lookup in a TLB that holds base-page and superpage entries: order the steps.', [
      'Split VA: VPN = VA>>12 and SP = VA>>21',
      'Compare VPN with all base-page tags and SP with all superpage tags in parallel',
      "If a tag matches, take that entry's frame",
      'Build PA = frame | offset (12-bit offset for base, 21-bit for superpage)',
      'If no tag matches, walk the page table',
    ], { mode: 'order', why: 'Both entry kinds are compared in parallel; a match yields the frame directly and the page table is consulted only when nothing matches.', ref: 'L7 p.22,32', lvl: 2 }),

    /* ---- MATCH ---- */
    X(7, 'multilevel', 'Match each problem with the mechanism that addresses it.', [
      ['Linear table: one PTE per VPN even though most entries are invalid', 'Multi-level page table'],
      ['Every reference needs an extra memory read for the PTE', 'TLB'],
      ['TLB coverage is too small for large footprints', 'Superpage (2MB)'],
      ['Flushing the TLB at every context switch causes cold misses', 'ASID tags'],
      ['Other cores keep stale translations after a PTE change', 'TLB shootdown (IPI)'],
    ], { why: 'Multi-level: only page-sized pieces covering used regions are allocated, anywhere in memory; TLB: caches PTEs; superpage: 512x more coverage per entry; ASID: no flush needed; shootdown: OS restores coherence because HW does not.', ref: 'L7 p.7,15,19,25-27,31', lvl: 2 }),
    X(7, 'multilevel', 'Match each scheme with its main weakness.', [
      ['Linear page table', 'Size is maximal regardless of how sparse the address space is'],
      ['Hybrid (segments + paging)', 'Variable-sized, contiguous per-segment tables cause external fragmentation'],
      ['Multi-level page table', 'More memory accesses per walk and more complex hardware'],
      ['2MB superpages', 'Internal fragmentation and need for contiguous physical memory'],
    ], { why: 'Linear: one entry per virtual page; hybrid: ext. frag. in page tables; multi-level: one read per level; superpage: big contiguous frames, compaction cost.', ref: 'L7 p.2,6,15,35', lvl: 2 }),
    X(7, 'tlb', 'Match each aspect of TLB miss handling with its answer.', [
      ['Software-managed TLB: who handles a miss', 'OS trap handler'],
      ['Hardware-managed TLB: who handles a miss', 'MMU page walker'],
      ['Software-managed TLB: page-table format', 'Any format convenient for the OS'],
      ['Hardware-managed TLB: page-table format', 'Hardware-defined format'],
      ['Software-managed TLB: how entries get into the TLB', 'Privileged TLB instructions'],
      ['Hardware-managed TLB: how HW finds the table', 'CR3 / satp register'],
    ], { why: 'The page table is read by hardware only in the hardware-managed design, which forces its format and needs a base register; in the software-managed design the OS supplies PTEs through privileged instructions after a trap.', ref: 'L7 p.24,29', lvl: 2 }),
    X(7, 'superpage', 'Match each fact about huge pages to its explanation.', [
      ['A 2MB page needs a 21-bit offset', '2MB = 2^21 bytes'],
      ['A huge-page walk reads only 3 tables', 'The PMD entry points directly to the huge page'],
      ['One 2MB entry covers 512x more than a 4KB entry', '2MB / 4KB = 512'],
      ['Vendors advise disabling THP for some workloads', 'Compaction and khugepaged cause CPU contention'],
      ['Ingens (OSDI 16)', 'Research on better huge-page management policy'],
    ], { why: 'Offset width follows page size; skipping the PTE level shortens the walk; coverage = entries x page size; automatic THP can hurt, which motivates policy research.', ref: 'L7 p.31-36', lvl: 2 }),
    X(7, 'x86', 'Match each x86_64 4KB-page address field with its bit range.', [
      ['PML4 index', 'bits 47-39'],
      ['PDPT index', 'bits 38-30'],
      ['PD index', 'bits 29-21'],
      ['PT index', 'bits 20-12'],
      ['Page offset', 'bits 11-0'],
    ], { why: 'Each of the four indices is 9 bits (512 entries x 8B = one 4KB page), the offset is 12 bits: 4x9 + 12 = 48 bits.', ref: 'L7 p.14', lab: true, lvl: 2 }),
    X(7, 'hybrid', 'In the lecture\'s hybrid VA format (Seg | VPN | offset), match each Seg value with the segment it selects.', [
      ['Seg = 00', 'Unused'],
      ['Seg = 01', 'Code'],
      ['Seg = 10', 'Heap'],
      ['Seg = 11', 'Stack'],
    ], { why: '00 is the unused segment (not code, not stack); 01 code, 10 heap, 11 stack.', ref: 'L7 p.4', lvl: 1 }),
    X(7, 'tlb', 'Match each field of a TLB entry\'s value with its meaning.', [
      ['V', 'Valid: the entry holds a usable translation'],
      ['R', 'Reference: the page was recently accessed'],
      ['M', 'Modified: the page was written (dirty)'],
      ['Prot', 'Protection bits (read/write/execute permissions)'],
      ['PFN', 'Physical frame number'],
    ], { why: 'The TLB caches the whole PTE, so the permission and status bits are available on a hit; PFN gives the frame.', ref: 'L7 p.22', lvl: 2 }),
    X(7, 'multilevel', 'Match each page-table scheme with how its table space behaves.', [
      ['Linear', 'Always maximal: one PTE per VPN regardless of use'],
      ['Hybrid (segments + paging)', 'Follows the segment size, but each table must be contiguous'],
      ['Multi-level', 'Proportional to the amount of address space actually used'],
    ], { why: 'Linear wastes entries on invalid pages; hybrid shrinks them to segment size but reintroduces external fragmentation for the tables; multi-level allocates page-sized pieces only where needed.', ref: 'L7 p.2,6,15', lvl: 2 }),
  ]);
})();
