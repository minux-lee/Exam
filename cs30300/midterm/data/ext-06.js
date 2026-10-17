/* Lecture 6 extension: ordered procedures, mapping taxonomy, simulations (page fault, COW, translation, first touch) */
(function () {
  const { C, TF, M, N, O, X, SIM, G } = QZ.mk;
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[R(0, a.length - 1)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = R(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const hx = n => n.toString(16).toUpperCase();

  QZ.add([
    /* ---------- ORDER ---------- */
    O(6, 'fault', 'Put the steps of handling a page fault on a valid page that lives in the backing store (swap) in the correct order.', [
      'The load/store references a page whose PTE is invalid',
      'The CPU traps into the kernel (page fault exception)',
      'The kernel checks that the page is valid and is stored in the backing store',
      'The kernel brings the page from the backing store into a free frame',
      'The kernel updates the PTE with the frame number and marks it valid',
      'The CPU restarts the faulting instruction',
    ], { mode: 'recall', distract: ['The CPU continues with the instruction after the faulting one', 'The kernel terminates the process with a segmentation violation', 'The kernel copies the whole page table to disk'],
      why: 'Trap first (the CPU cannot continue), then the kernel decides what the fault is, brings the page in (the only step with disk I/O), fixes the PTE, and only then restarts the SAME instruction, which now succeeds. Restarting before the PTE is fixed would fault again forever; skipping to the next instruction would lose the access.',
      ref: 'L6 p.13', lab: true, lvl: 2 }),
    O(6, 'demand', 'A process touches a lazily allocated anonymous page for the first time. Order what happens.', [
      'The access faults and the application pauses',
      'The page fault handler asks the physical memory manager to allocate a page',
      'The manager takes a frame from the free page list',
      'The frame is zeroed',
      'The handler maps the frame in the page table',
      'The application resumes',
    ], { why: 'The page has no contents on disk, so there is no disk read: free frame, zero it (so no old data leaks), map it, resume. Compare with the swapped-out case, which reads the page from the backing store. This is a minor fault.', ref: 'L6 p.10', lab: true, lvl: 2 }),
    O(6, 'mmap', 'A process dereferences a pointer into a freshly mmap-ed file region for the first time. Put the steps in order.', [
      'mmap() creates the mapping and marks every PTE of the region invalid',
      'The process dereferences a pointer into the region',
      'The CPU raises a page fault',
      'The kernel reads the corresponding page of the file into a free frame',
      'The kernel updates the PTE to point to that frame',
      'The faulting instruction is restarted',
    ], { mode: 'recall', distract: ['mmap() copies the whole file into memory before returning', 'The kernel zero-fills the frame instead of reading the file', 'The process calls read() to fetch the page'],
      why: 'mmap only builds the mapping with invalid PTEs; the data is loaded lazily by the page fault handler (demand paging). The kernel knows which file offset backs the page, so the fault is a major one that reads the file.',
      ref: 'L6 p.21', lab: true, lvl: 2 }),
    O(6, 'cow', 'Put the steps of a copy-on-write write after fork() in the correct order.', [
      'fork(): the child gets the parent\'s PFNs and both sets of PTEs are made read-only',
      'One of the processes writes to a shared page',
      'The write hits a read-only PTE and raises a protection fault',
      'The kernel allocates a new frame',
      'The kernel copies the old frame\'s contents into the new frame',
      'The writer\'s PTE is changed to the new frame and made writable',
      'The write instruction is restarted',
    ], { mode: 'recall', distract: ['fork() copies every page of the parent immediately', 'The kernel kills the writer with SIGSEGV', 'The kernel writes the old frame back to the swap disk'],
      why: 'Nothing is copied at fork: only PTEs, marked read-only. The first write is a legitimate protection fault; the handler copies just that page, repoints and re-enables write for the writer only, then restarts the write, which now succeeds. The other process keeps the original frame.',
      ref: 'L6 p.22-23', lab: true, lvl: 2 }),
    O(6, 'cow', 'Order the events when a child calls exec() immediately after fork() in a COW system.', [
      'fork(): the child\'s PTEs point to the parent\'s frames, all read-only',
      'The child calls exec() right away',
      'The child\'s old address space is discarded',
      'A new address space is built for the new program',
    ], { why: 'COW defers copying "as long as possible, hoping to avoid it altogether". Since exec throws the child\'s old address space away before anything is written, the copy never happens. No page of the parent was ever copied. That is why COW is efficient for fork+exec.', ref: 'L6 p.23', lvl: 2 }),
    O(6, 'translation', 'Order the steps of address translation with a valid bit, for an access whose PTE has V=1.', [
      'Split the VA into VPN and offset',
      'Use the VPN as an index into the page table',
      'Read the PTE and check the valid bit',
      'Take the PFN from the PTE (V=1)',
      'Form the PA as <PFN, offset> with the offset unchanged',
    ], { mode: 'recall', distract: ['Add the offset to the VPN to form the PA', 'Translate the offset through the page table too', 'If V=1, raise a page fault'],
      why: 'Only the VPN is translated. The valid bit is checked before the PFN is used; if V=0 the CPU raises a page fault instead of forming a PA (see the generated translation simulation). The offset is copied unchanged because pages and frames have the same size.',
      ref: 'L6 p.4-5', lvl: 2 }),
    O(6, 'shared', 'Order the lines of the shared-memory example from the lecture by what each one does.', [
      'shm_open creates the named object /shm1 and returns a file descriptor',
      'ftruncate sets the size of the object to 4096 bytes',
      'mmap maps the object with MAP_SHARED (PTEs start invalid; frames attach on first access)',
      'The loop stores i into p[i] for i = 0..1023',
      'close(fd) releases the descriptor',
    ], { why: 'The object must exist and have a size before it can be mapped, and it must be mapped before the loop writes through the pointer. 1024 ints x 4 B = 4096 B = exactly one page.', ref: 'L6 p.25', lvl: 1 }),
    O(6, 'shared', 'A frame mapped by PTEs in two processes is chosen for eviction. Put the steps in order.', [
      'The replacement policy picks the shared frame',
      'Use reverse mapping to find every PTE that maps the frame',
      'Mark each of those PTEs invalid',
      'If the page is dirty, write it to disk',
      'Reuse the frame for the new page',
    ], { mode: 'recall', distract: ['Invalidate only the PTE of the process that triggered the eviction', 'Copy the frame into private memory of each sharing process'],
      why: 'Both PTEs must be updated when the page becomes invalid. Without reverse mapping (frame to all PTEs that point to it) the kernel could not find the second PTE, which would then point at a frame now holding someone else\'s data. Only a dirty page is written to disk.',
      ref: 'L6 p.10,26', lvl: 3 }),

    /* ---------- MATCH ---------- */
    X(6, 'mmap', 'Match each kind of mapping to a typical use.', [
      ['Private file mapping (MAP_PRIVATE with fd)', 'Loading a program\'s .data section: writes never change the file'],
      ['Shared file mapping (MAP_SHARED with fd)', 'File I/O through pointers; writes reach the file and other mappers'],
      ['Private anonymous mapping (MAP_ANONYMOUS | MAP_PRIVATE)', 'Heap or stack memory, zero-filled, private to the process'],
      ['Shared anonymous mapping (MAP_ANONYMOUS | MAP_SHARED)', 'Memory shared between a parent and its child'],
    ], { why: 'File vs anonymous = is there a file behind the pages. Shared vs private = are writes visible to others (shared) or copy-on-write (private).', ref: 'L6 p.18', lvl: 2 }),
    X(6, 'mmap', 'Two processes run /bin/ls. Match each region to its mapping description from the summary figure.', [
      ['Code (both processes)', 'File-backed, read-only; the same physical frames are shared by both processes'],
      ['Process 1 data (before any write)', 'File-backed private, read-only; a write would trigger COW'],
      ['Process 2 data (after it wrote)', 'File-backed, COW\'d private copy, R/W'],
      ['Process 2 heap', 'Anonymous, R/W, zero-filled on first touch'],
      ['Process 2 stack', 'Anonymous, R/W, private to the process'],
    ], { why: 'code is shared read-only file pages; data starts as the same file pages but is private, so the first write makes a COW copy; heap and stack have no file (anonymous).', ref: 'L6 p.27', lvl: 3 }),
    X(6, 'fault', 'Match each situation to the way the kernel classifies and handles it.', [
      ['Valid page whose contents are in swap on disk', 'Major page fault: read the page from disk'],
      ['First touch of a lazily allocated heap page', 'Minor page fault: zero a free frame and map it, no disk I/O'],
      ['Access to an address that belongs to no mapped region', 'Invalid page fault: segmentation violation'],
      ['Write to a read-only page that is COW-shared after fork', 'Protection fault, not one of the three classes: copy the page, map it writable, restart'],
    ], { why: 'The deciding question is what the kernel finds when it looks up the faulting address: contents on disk (major), nothing needed but a frame (minor), no region (invalid), or a legitimate write to a COW page (copy). Valid and not present can be major OR minor. The COW write is none of these three classes: the page is present, but the write violates its read-only PTE, and the kernel resolves it by copying (it is not a minor fault).', ref: 'L6 p.11,23', lab: true, lvl: 2 }),
    X(6, 'io', 'Match each way of reading a file to what happens to the data on its way to the program.', [
      ['open() + read(fd, buf, 1024)', 'One copy: kernel buffer to the user buffer'],
      ['fopen() + fgets()', 'Two copies: kernel buffer to the C library buffer to the user buffer'],
      ['open() + mmap() + pointer access', 'No copy: the page cache frames are mapped into the user address space'],
      ['mmap(MAP_SHARED) then a pointer read of a page that is already resident', 'No fault, no copy: the PTE is valid and the frame is already in the page cache'],
    ], { why: 'read() copies from the kernel buffer to the user buffer once; stdio adds a second copy through its own buffer; mmap maps the same frames the kernel holds, so there is no user-buffer copy. (A page that is not yet resident still pays one page fault on its first access.)', ref: 'L6 p.20-21', lvl: 2 }),

    X(6, 'pte', 'Match each task to who performs it and how (hardware/software split of paging).', [
      ['Translating the VA of every load/store', 'MMU hardware, using the page table the OS built'],
      ['Setting the dirty bit when a page is written', 'MMU hardware, as a side effect of the access'],
      ['Noticing that a PTE is invalid', 'MMU hardware raises the page fault exception'],
      ['Bringing the page in and writing the new frame number into the PTE', 'OS page fault handler'],
      ['Switching to the next process\'s address space', 'OS loads CR3 / satp with that process\'s page table at the context switch'],
      ['Choosing which page to evict', 'OS replacement policy, reading the A and D bits the hardware recorded'],
    ], { why: 'The MMU does everything that must happen on every access (translate, check valid/protection, record A/D, trap). The OS owns the page table contents, resolves faults, restarts the instruction, switches the base register and picks victims. Hardware records, software decides.', ref: 'L6 p.4,8-10,13', lvl: 2 }),
    X(6, 'pte', 'Match each x86 PTE flag to its meaning.', [
      ['P (present)', 'The page is currently in physical memory (not the same as belonging to the address space)'],
      ['R/W', 'Whether writes to the page are allowed'],
      ['U/S', 'Whether user-mode code may access the page'],
      ['A (accessed)', 'Set by the MMU when the page is touched; the OS reads it to help choose a victim'],
      ['D (dirty)', 'Set by the MMU when the page is written; the OS reads it to decide whether eviction needs a disk write'],
    ], { why: 'P says where the page is, R/W and U/S are protection, A and D are recorded by hardware on each access and only read and cleared by the OS (the OS is not involved in every load).', ref: 'L6 p.9-10', lvl: 2 }),

    /* ---------- code reading / reasoning (MCQ) ---------- */
    M(6, 'mmap', 'Select all correct options. More than one option may be correct. The program does fd = open("/bin/ls", O_RDONLY); p = mmap(0, 4096, PROT_READ, MAP_SHARED, fd, 0); and then prints *p. Which statements are correct?',
      ['Right after mmap returns, the PTEs of the region are marked invalid and the data has not necessarily been loaded', 'The first access *p raises a page fault and the kernel reads the page from the file', 'The file contents are copied into a kernel buffer and then into a user buffer that p points to', 'The address p+n corresponds to offset n in the file', 'The mapping is anonymous because the program never calls read()'], 'abd',
      'c is the read() path, not mmap. e is wrong: an mmap with a file descriptor is a file mapping. a, b and d follow the implementation notes: all pages start invalid, faults read from the file, and base+n refers to offset+n.', { ref: 'L6 p.19,21', lvl: 3 }),
    M(6, 'shared', 'Select all correct options. More than one option may be correct. A program does fd = shm_open("/shm1", O_CREAT|O_EXCL|O_RDWR, 0600); ftruncate(fd, 4096); p = mmap(0, 4096, PROT_READ|PROT_WRITE, MAP_SHARED, fd, 0); for (i = 0; i < 1024; i++) p[i] = i;. Which statements are correct?',
      ['An unrelated process can open "/shm1" by name and map it to see the values', 'The loop writes exactly one page of 4-byte ints', 'Each process gets its own private copy of the page when it maps the object', 'Both page tables can have PTEs for the same physical frame, with different protection bits', 'A pointer stored in the region is always valid in every process that maps it'], 'abd',
      'c is the private-mapping behaviour (COW); here MAP_SHARED keeps one frame. e is false unless every process maps the region at the same virtual address. 1024 x 4 B = 4096 B = one page.', { ref: 'L6 p.25-26', lvl: 3 }),
    M(6, 'shared', 'A physical frame is mapped by PTEs in two different processes and the OS decides to evict it. Why does the OS need a reverse mapping (frame to PTEs)?',
      ['To find and invalidate every PTE that points to the frame, otherwise a process could still access a frame that now holds other data', 'To compute the VPN from the offset', 'To check the dirty bit of the process that faulted last', 'To avoid zeroing the frame before reuse'], 'a',
      'Both PTEs must be updated when the page becomes invalid. A PTE is indexed by VPN, so going from frame to PTEs needs extra bookkeeping.', { ref: 'L6 p.26', lvl: 3 }),
    M(6, 'demand', 'Select all correct options. More than one option may be correct. A program mmaps 1 GiB anonymous memory and calls memset over it twice. The first pass is much slower than the second. Which explain this?',
      ['Each first touch of a 4 KB page raises a minor page fault, about 2^18 in total', 'For each first touch the kernel zeroes a free frame before mapping it', 'Every first touch is a major fault that reads the page from disk', 'In the second pass all pages are already mapped, so there are no faults', 'mmap itself copied 1 GiB from disk into memory before returning'], 'abd',
      'The mapping is lazy: mmap only reserves virtual space. c is wrong because an anonymous page has no contents on disk, and e is wrong because nothing is loaded at mmap time.', { ref: 'L6 p.12', lvl: 3 }),
    M(6, 'cons', 'Select all correct options. More than one option may be correct. A 32-bit system changes its page size from 4 KB to 64 KB. Which statements are correct?',
      ['The number of PTEs of a linear page table drops by a factor of 16', 'Expected internal fragmentation grows', 'External fragmentation appears', 'The offset field becomes 16 bits wide'], 'abd',
      'Offset = log2(64 KB) = 16 bits, VPN = 16 bits (2^16 PTEs instead of 2^20). Larger pages waste more of the last page. Paging never has external fragmentation.', { ref: 'L6 p.6,15', lvl: 2 }),
    TF(6, 'fault', 'A page that is valid but not present always causes a major page fault when accessed.', false, 'Only if its contents must be read from disk. A lazily allocated anonymous page that was never touched is also valid and not present, but needs only a zeroed frame: a minor fault.', { ref: 'L6 p.11', lvl: 2 }),

    /* ---------- SIM (fixed) ---------- */
    SIM(6, 'pte', 'A process is 10 KB. Compare 4 KB and 64 KB pages (32-bit VA, 4 B per PTE, linear page table). Fill in the values.',
      { text: 'The process uses 10 KB of contiguous virtual space starting at a page boundary.' },
      [{ label: 'Pages used with 4 KB pages', ans: 3 }, { label: 'Internal fragmentation with 4 KB pages', ans: 2, unit: 'KB' },
       { label: 'Pages used with 64 KB pages', ans: 1 }, { label: 'Internal fragmentation with 64 KB pages', ans: 54, unit: 'KB' },
       { label: 'Linear page table size with 64 KB pages', ans: 256, unit: 'KB' }],
      { steps: '4 KB: ceil(10/4) = 3 pages = 12 KB, waste 12-10 = 2 KB.\n64 KB: 1 page = 64 KB, waste 54 KB.\nTable for 64 KB pages: offset 16 bits, VPN 16 bits, 2^16 PTEs x 4 B = 256 KB (vs 4 MB for 4 KB pages).\nTrade-off: bigger pages shrink the table but waste more in the last page.', ref: 'L6 p.6,15', lvl: 2 }),

    /* ---------- generated sims ---------- */
    G(6, 'translation', 'xlate', { ref: 'L6 p.4-5', lab: true, lvl: 2 }),
    G(6, 'fault', 'faultClass', { ref: 'L6 p.11-13', lab: true, lvl: 3 }),
    G(6, 'cow', 'cowFork', { ref: 'L6 p.22-23', lab: true, lvl: 3 }),
    G(6, 'demand', 'touchCount', { ref: 'L6 p.10-12', lvl: 2 }),
    G(6, 'cons', 'pageSizeCmp', { ref: 'L6 p.6,15', lvl: 2 }),
  ]);

  /* ---- translation with valid bit ---- */
  QZ.gens.xlate = () => {
    const off = pick([8, 12]), n = 8, nv = R(4, 6);
    const vIdx = shuffle([...Array(n).keys()]).slice(0, nv);
    const pfns = shuffle([...Array(16).keys()]);
    const pt = [...Array(n).keys()].map(i => vIdx.includes(i) ? { v: 1, pfn: pfns[i] } : { v: 0, pfn: null });
    const valid = pt.map((e, i) => e.v ? i : -1).filter(i => i >= 0), inval = pt.map((e, i) => e.v ? -1 : i).filter(i => i >= 0);
    const vpns = shuffle([pick(valid), pick(inval), pick(valid)].concat([])); // two valid, one invalid (random order)
    const vas = vpns.map(p => p * (1 << off) + R(0, (1 << off) - 1));
    const w = off / 4 + 1;
    const fields = [], lines = [];
    vas.forEach(va => {
      const vpn = va >> off, o = va & ((1 << off) - 1), e = pt[vpn];
      const ans = e.v ? hx(e.pfn * (1 << off) + o) : 'fault';
      fields.push({ label: `VA 0x${hx(va).padStart(w, '0')}: PA in hex, or "fault"`, ans, kind: 'text' });
      lines.push(`VA 0x${hx(va).padStart(w, '0')}: VPN = ${vpn}, offset = 0x${hx(o)}; PTE[${vpn}] has V=${e.v}` + (e.v ? ` and PFN 0x${hx(e.pfn)} -> PA = <0x${hx(e.pfn)}, 0x${hx(o)}> = 0x${ans}` : ' -> page fault (no PA is formed)'));
    });
    fields.push({ label: 'How many pages of the address space are valid?', ans: nv, kind: 'num' });
    return {
      kind: 'sim',
      q: `Linear page table, page size ${1 << off} B (offset = ${off} bits), 3-bit VPN. Translate each virtual address, or answer "fault" if the translation cannot be completed.`,
      state: { table: { head: ['VPN', 'V', 'PFN'], rows: pt.map((e, i) => [String(i), String(e.v), e.v ? '0x' + hx(e.pfn) : '-']) } },
      fields,
      steps: `Split VA: offset = low ${off} bits, VPN = the bits above.\nIndex the table with the VPN; if V=0 the CPU raises a page fault, otherwise PA = <PFN, offset>.\n` + lines.join('\n') + `\nValid pages = ${nv}.`,
    };
  };

  /* ---- classification of accesses ---- */
  QZ.gens.faultClass = () => {
    const kinds = [
      { s: 'resident', v: 'valid', pr: 'yes', c: 'in memory' },
      { s: 'swapped', v: 'valid', pr: 'no', c: 'in swap on disk' },
      { s: 'lazy', v: 'valid', pr: 'no', c: 'anonymous, never touched' },
      { s: 'file', v: 'valid', pr: 'no', c: 'file-mapped, not yet read' },
      { s: 'unmapped', v: 'invalid', pr: 'no', c: 'not in any region' },
    ];
    const st = [pick([kinds[1], kinds[3]]), kinds[2], kinds[0], pick(kinds), pick([kinds[4], kinds[1], kinds[2]])];
    const seq = Array.from({ length: 8 }, () => R(0, 4));
    let major = 0, minor = 0, inv = 0, dead = false, done = 0;
    const loaded = st.map(k => k.s === 'resident');
    const log = [];
    for (const p of seq) {
      const k = st[p];
      if (k.s === 'unmapped') { inv++; log.push(`P${p}: not in any region -> invalid fault, process killed`); dead = true; break; }
      if (loaded[p]) { log.push(`P${p}: present, no fault`); done++; continue; }
      if (k.s === 'swapped' || k.s === 'file') { major++; log.push(`P${p}: valid, ${k.c} -> MAJOR (disk read)`); }
      else { minor++; log.push(`P${p}: valid, ${k.c} -> MINOR (zeroed frame, no disk I/O)`); }
      loaded[p] = true; done++;
    }
    const resident = loaded.filter(Boolean).length;
    return {
      kind: 'sim',
      q: 'The process executes the accesses below in order (each is a load or a store to that page). Major fault = valid page whose contents must come from disk; minor fault = resolved without disk I/O; invalid fault = the page is not in use, and the process is killed at the first one. After a fault is resolved the page stays resident.',
      state: { table: { head: ['Page', 'Valid', 'Present', 'Situation'], rows: st.map((k, i) => ['P' + i, k.v, k.pr, k.c]) }, text: 'Access sequence: ' + seq.map(p => 'P' + p).join(', ') },
      fields: [{ label: 'Major page faults', ans: major }, { label: 'Minor page faults', ans: minor }, { label: 'Accesses that complete successfully (before any kill)', ans: done }, { label: 'Resident pages at the end', ans: resident }],
      steps: log.join('\n') + `\nMajor ${major}, minor ${minor}, invalid ${inv}${dead ? ' (process killed, later accesses never run)' : ''}; ${done} accesses completed; resident pages at the end: ${resident}.\nNote: "valid and not present" is major only if the contents must be read from disk; a never-touched anonymous page is minor.`,
    };
  };

  /* ---- COW after fork ---- */
  QZ.gens.cowFork = () => {
    const n = R(4, 6), writer = [...Array(n).keys()].map(() => pick(['P', 'C', null]));
    if (!writer.some(w => w)) writer[0] = 'C';
    const ops = [];
    for (let i = 0; i < R(7, 9); i++) {
      const p = R(0, n - 1), who = pick(['P', 'C']);
      ops.push(writer[p] === who && Math.random() < 0.6 ? { who, w: 1, p } : { who, w: 0, p });
    }
    if (!ops.some(o => o.w)) { const p = writer.findIndex(w => w); ops[R(0, ops.length - 1)] = { who: writer[p], w: 1, p }; }
    const priv = Array(n).fill(false);
    let faults = 0; const log = [];
    ops.forEach(o => {
      if (!o.w) { log.push(`${o.who} reads page ${o.p}: no fault`); return; }
      if (!priv[o.p]) { priv[o.p] = true; faults++; log.push(`${o.who} writes page ${o.p}: PTE is read-only -> protection fault, new frame, copy, writable; frames now ${n + faults}`); }
      else log.push(`${o.who} writes page ${o.p}: already private and writable, no fault`);
    });
    return {
      kind: 'sim',
      q: `fork() just returned. Parent (P) and child (C) share ${n} data pages (page 0..${n - 1}) through read-only PTEs; the kernel uses copy-on-write. The operations below run in order. Each page is written by at most one of P and C.`,
      state: { code: ops.map((o, i) => `${i + 1}. ${o.who} ${o.w ? 'writes' : 'reads'} page ${o.p}`).join('\n') },
      fields: [{ label: 'Frames used by the two address spaces right after fork()', ans: n }, { label: 'Protection faults', ans: faults }, { label: 'Frames copied', ans: faults }, { label: 'Frames in use at the end', ans: n + faults }],
      steps: `After fork both PTE sets point to the same ${n} frames: ${n} frames, not ${2 * n}.\n` + log.join('\n') + `\nA read never faults; the first write to each page faults once and copies one frame; later writes by the same process hit its private writable copy.`,
    };
  };

  /* ---- first-touch cost ---- */
  QZ.gens.touchCount = () => {
    const mb = pick([4, 16, 64, 1024]), pages = mb * 256, strideB = pick([4096, 8192, 16384, 1024]);
    const stepPages = Math.max(1, strideB / 4096), touched = Math.ceil(pages / stepPages);
    const label = mb >= 1024 ? (mb / 1024) + ' GiB' : mb + ' MiB';
    return {
      kind: 'sim',
      q: `4 KB pages. A program maps ${label} of anonymous private memory and then runs the loop below twice (pass 1, pass 2). Count the page faults. Remember that mmap itself does not allocate frames.`,
      state: { code: `char *a = mmap(NULL, LEN, PROT_READ|PROT_WRITE,\n               MAP_ANONYMOUS|MAP_PRIVATE, -1, 0);   // LEN = ${label}\nfor (long i = 0; i < LEN; i += ${strideB})\n    a[i] = 1;                          // pass 1, then the same loop again as pass 2` },
      fields: [{ label: 'Minor page faults in pass 1', ans: touched }, { label: 'Page faults in pass 2', ans: 0 }, { label: 'Resident set size after pass 1', ans: touched * 4, unit: 'KB' }],
      steps: `Pages = ${label} / 4 KB = ${pages}.\nStride ${strideB} B = ${strideB / 4096} page(s): ` + (strideB < 4096 ? 'several writes land in the same page, so every page is touched once' : `every ${stepPages}th page is touched`) + ` -> ${touched} distinct pages.\nEach first touch of an anonymous page is a minor fault: take a frame from the free list, zero it, map it (no disk read) -> ${touched} faults, ${touched} zeroed frames = ${touched * 4} KB resident after pass 1.\nPass 2 touches only already mapped pages: 0 faults. No disk I/O, so 0 major faults.`,
    };
  };

  /* ---- page size trade-off ---- */
  QZ.gens.pageSizeCmp = () => {
    const s = pick([10, 13, 22, 27, 35, 41]), pte = pick([4, 8]);
    const p4 = Math.ceil(s / 4), p16 = Math.ceil(s / 16), tab = (2 ** 18) * pte / 1024;
    return {
      kind: 'sim',
      q: `A process uses ${s} KB of contiguous virtual memory starting at a page boundary. 32-bit VA, ${pte} B per PTE, linear page table. Compare 4 KB and 16 KB pages.`,
      state: { text: 'Internal fragmentation = allocated page space minus the bytes actually used.' },
      fields: [{ label: 'Pages with 4 KB pages', ans: p4 }, { label: 'Internal fragmentation with 4 KB pages', ans: p4 * 4 - s, unit: 'KB' },
        { label: 'Pages with 16 KB pages', ans: p16 }, { label: 'Internal fragmentation with 16 KB pages', ans: p16 * 16 - s, unit: 'KB' },
        { label: 'Linear page table size with 16 KB pages', ans: tab, unit: 'KB' }],
      steps: `4 KB: ceil(${s}/4) = ${p4} pages = ${p4 * 4} KB, waste ${p4 * 4 - s} KB.\n16 KB: ceil(${s}/16) = ${p16} pages = ${p16 * 16} KB, waste ${p16 * 16 - s} KB.\nTable with 16 KB pages: offset 14 bits, VPN 18 bits, 2^18 PTEs x ${pte} B = ${tab} KB (4 KB pages would need 2^20 x ${pte} B = ${4 * tab} KB).\nBigger pages: smaller table, more internal fragmentation.`,
    };
  };

  Object.assign(QZ.GEN_LABEL, {
    xlate: 'translation with valid bit', faultClass: 'page-fault classification trace', cowFork: 'copy-on-write after fork trace',
    touchCount: 'first-touch fault count', pageSizeCmp: 'page-size trade-off',
  });
})();
