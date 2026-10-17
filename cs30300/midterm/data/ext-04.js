/* Lecture 4 extension: ORDER / MATCH / SIM items for the study gaps (heap snapshots, translation flow, lazy allocation, layout, ...) */
(function () {
  const { M, N, O, X, SIM, G } = QZ.mk;

  /* ---------- helpers ---------- */
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = ri(0, i); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const hx = n => '0x' + n.toString(16);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ================= GENERATED SIMS ================= */

  /* per-process run-time translation (same VA -> different PA, fault on illegal) */
  QZ.gens.xlate4 = () => {
    const vp = shuffle([0, 1, 2, 3, 4, 5]);
    const [a, b, c, d] = vp;                   // a,d: both; b: P1 only; c: P2 only; the other two: neither
    const pfns = shuffle([...Array(60).keys()].map(i => i + 0x10)).slice(0, 4);
    const t1 = {}, t2 = {};
    t1[a] = pfns[0]; t2[a] = pfns[1]; t1[d] = pfns[2]; t2[d] = pfns[3]; t1[b] = pfns[0] + 0x41; t2[c] = pfns[1] + 0x40;
    const lookup = (t, v) => (v in t ? t[v] : null);
    const qs = [{ p: 1, v: a }, { p: 2, v: a }];
    const pool = shuffle([[1, b], [2, b], [1, c], [2, c], [1, d], [2, d], [1, vp[4]], [2, vp[5]]]);
    qs.push({ p: pool[0][0], v: pool[0][1] }, { p: pool[1][0], v: pool[1][1] });
    const offs = shuffle([0x108, 0x2a4, 0x408, 0x7f0, 0xabc, 0x13c, 0x5e0]);
    offs[1] = offs[0];
    const fields = [], lines = [];
    qs.forEach((x, i) => {
      const off = offs[i], va = x.v * 4096 + off;
      const pfn = lookup(x.p === 1 ? t1 : t2, x.v);
      const ans = pfn === null ? 'fault' : hx(pfn * 4096 + off);
      fields.push({ label: `P${x.p} accesses VA ${hx(va)}`, ans, kind: 'text' });
      lines.push(`P${x.p} VA ${hx(va)}: VPN=${x.v}, offset=${hx(off)} -> ` + (pfn === null ? `no mapping in P${x.p}'s table -> MMU raises a fault, memory is not touched` : `PFN ${hx(pfn)} -> PA = ${ans}`));
    });
    const rows = [0, 1, 2, 3, 4, 5].map(v => [String(v), v in t1 ? hx(t1[v]) : '-', v in t2 ? hx(t2[v]) : '-']);
    return {
      kind: 'sim',
      q: 'Two processes run on the same machine. The OS has set up one translation table per process (page = 4 KB, the MMU keeps the low 12 bits and replaces the upper bits via the table; "-" means unmapped). Give the physical address each access reaches, or "fault".',
      state: { table: { head: ['VPN', 'P1 table (PFN)', 'P2 table (PFN)'], rows } },
      fields,
      steps: 'Per access: split VA into VPN and 12-bit offset -> the MMU looks in the table of the CURRENT process -> mapped: PA = PFN, offset kept; unmapped: fault to the kernel handler.\n' + lines.join('\n') + '\nNote that the same VA in P1 and P2 goes to different physical addresses (virtual addresses are private).',
    };
  };

  /* malloc/free heap evolution + dangling pointers */
  QZ.gens.heapSim = () => {
    const sz = () => pick([8, 16, 24, 32, 48, 64]);
    const sA = sz(); let sB = sz(); while (sB === sA) sB = sz();
    const tail = pick([
      { ops: ['free(p)'], },
      { ops: ['free(p)', 'p = NULL'], },
      { ops: ['free(p)', 'free(q)'], },
      { ops: ['free(q)', 'q = NULL'], },
      { ops: ['free(p)', 'free(q)', 'q = NULL'], },
    ]);
    const ops = [`p = malloc(${sA})`, `q = malloc(${sB})`, ...tail.ops];
    const st = { p: { live: false, ptr: false }, q: { live: false, ptr: false } };
    const alive = { p: 0, q: 0 }, log = [];
    ops.forEach(op => {
      let m;
      if ((m = op.match(/^(\w) = malloc\((\d+)\)/))) { st[m[1]] = { live: true, ptr: true }; alive[m[1]] = +m[2]; }
      else if ((m = op.match(/^free\((\w)\)/))) { st[m[1]].live = false; alive[m[1]] = 0; }
      else if ((m = op.match(/^(\w) = NULL/))) { st[m[1]].ptr = false; }
      const dang = k => (st[k].ptr && !st[k].live) ? 'dangling' : (!st[k].ptr ? 'NULL' : 'valid');
      log.push(`after "${op};": heap allocated = ${alive.p + alive.q} B, p ${dang('p')}, q ${dang('q')}`);
    });
    const dang = k => st[k].ptr && !st[k].live;
    const safe = k => st[k].ptr && st[k].live;
    const yn = b => (b ? 'yes|y' : 'no|n');
    return {
      kind: 'sim',
      q: 'Execute the statements in order, assuming every malloc succeeds. Two pointers p and q are local variables on the stack. Fill in the state after the last statement.',
      state: { code: ops.map(o => o + ';').join('\n') },
      fields: [
        { label: 'Bytes still allocated on the heap', ans: alive.p + alive.q, unit: 'B' },
        { label: 'Is p a dangling pointer? (yes/no)', ans: yn(dang('p')), kind: 'text' },
        { label: 'Is q a dangling pointer? (yes/no)', ans: yn(dang('q')), kind: 'text' },
        { label: 'Is dereferencing q safe? (yes/no)', ans: yn(safe('q')), kind: 'text' },
      ],
      steps: 'Track (a) which blocks are still allocated and (b) what each pointer VARIABLE holds. free() releases the block but does NOT change the pointer variable, so the pointer keeps the old address (dangling = non-NULL pointer to a freed block). Assigning NULL removes the dangling address.\n' + log.join('\n'),
    };
  };

  /* lazy allocation: reserve -> first touch -> page fault -> physical page */
  QZ.gens.lazySim = () => {
    const n = ri(4, 8), kb = 4;
    const mode = pick(['malloc', 'mmap']);
    const k = ri(3, 6);
    let touches;
    do { touches = Array.from({ length: k + 2 }, () => ri(0, n - 1)); } while (new Set(touches).size >= n || new Set(touches).size === touches.length);
    const seen = new Set(), log = [];
    let faults = 0;
    touches.forEach(t => {
      if (!seen.has(t)) { seen.add(t); faults++; log.push(`touch page ${t}: no physical page yet -> page fault #${faults} -> kernel allocates a zero-filled physical page and maps it (resident = ${seen.size})`); }
      else log.push(`touch page ${t}: already mapped -> no fault`);
    });
    const call = mode === 'malloc' ? `malloc(${n * kb} * 1024)  /* libc may serve a large request with an anonymous mmap */` : `mmap(NULL, ${n * kb} * 1024, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0)`;
    return {
      kind: 'sim',
      q: `A process (4 KB pages, lazy allocation, physical memory initially unused by this region) reserves a region and then touches pages (first byte of each) in the given order. Fill in the results.`,
      state: { code: `p = ${call};\n/* region = ${n} virtual pages (indices 0..${n - 1}) */\ntouch order: ${touches.join(', ')}` },
      fields: [
        { label: 'Physical pages allocated right after the reserve call', ans: 0 },
        { label: 'Page faults during the touches', ans: faults },
        { label: 'Physical memory used by the region at the end', ans: faults * kb, unit: 'KB' },
        { label: 'Virtual pages never backed by a physical page', ans: n - seen.size },
      ],
      steps: 'Lazy allocation: the call only reserves virtual addresses (0 physical pages). Each FIRST touch of a page triggers a page fault, and the kernel then allocates a physical page; repeated touches hit an existing mapping.\n' + log.join('\n') + `\nfaults = distinct pages touched = ${faults}; memory = ${faults} x ${kb} KB = ${faults * kb} KB; never-touched = ${n} - ${seen.size} = ${n - seen.size}.`,
    };
  };

  /* address space layout: which region does each object live in */
  QZ.gens.layoutSim = () => {
    const R = [
      { r: 'text', al: 'text|.text|code|code segment', rank: 0, objs: ['the machine code of function main()', 'the compiled instructions of a function you wrote', 'the program code loaded by exec (read-only, executable)'] },
      { r: 'rodata', al: 'rodata|.rodata|read-only data|read only data', rank: 1, objs: ['the string literal "hello" (constant)', 'a global `const int K = 7;`', 'a constant lookup table in read-only data'] },
      { r: 'data', al: 'data|.data|initialized data', rank: 2, objs: ['a global `int g = 5;`', 'a global `int tab[4] = {1,2,3,4};`', 'a static variable initialized to a nonzero value'] },
      { r: 'bss', al: 'bss|.bss|uninitialized data', rank: 3, objs: ['a global `int big[100000];` with no initializer', 'a global `long counter;` with no initializer', 'a static array with no initializer (zero-filled at start)'] },
      { r: 'heap', al: 'heap', rank: 4, objs: ['the block returned by malloc(64)', 'memory that a call to calloc(10, 8) returns (small request)', 'a block that free() later releases'] },
      { r: 'mmap', al: 'mmap|mmap area|mapping|memory mapping', rank: 5, objs: ['a file mapped with mmap(NULL, len, PROT_READ, MAP_PRIVATE, fd, 0)', 'a region from mmap(..., MAP_ANONYMOUS, -1, 0)', 'a shared file mapping created by mmap with MAP_SHARED'] },
      { r: 'stack', al: 'stack|user stack', rank: 6, objs: ['a local variable `int x;` inside a function', 'the return-address slot of the current call', 'a local array `char buf[16];` inside a function'] },
    ];
    const chosen = shuffle(R).slice(0, 5);
    const items = chosen.map(c => ({ c, o: pick(c.objs) }));
    const low = items.slice().sort((a, b) => a.c.rank - b.c.rank)[0];
    const fields = items.map((x, i) => ({ label: `(${i + 1}) ${cap(x.o)}`, ans: x.c.al, kind: 'text' }));
    fields.push({ label: 'Which of the five lives at the LOWEST virtual address?', ans: low.c.al, kind: 'text' });
    return {
      kind: 'sim',
      q: 'Use the standard Lecture 4 address-space layout (address 0 at the top, increasing downward). Name the region where each object lives: text, rodata, data, bss, heap, mmap, or stack. Then say which of the five has the lowest address. (The mmap area sits in the free gap between heap and stack, as in the Lecture 4 mmap figure. Within one segment, use the order listed in the figure: .init, .text, .rodata; .data, .bss.)',
      state: { text: 'Layout, from address 0 at the top going downward: unused | read-only segment (.init .text .rodata) | read/write segment (.data .bss) | heap (grows toward higher addresses, ends at brk) | free gap | user stack (grows toward lower addresses) | kernel memory (not accessible from user code).' },
      fields,
      steps: items.map((x, i) => `(${i + 1}) -> ${x.c.r}`).join('\n') + `\nLowest address = ${low.c.r} (order: text < rodata < data < bss < heap < mmap < stack). Static area (code, data) is fixed by exec; heap and stack are dynamic. Initialized globals go to .data, uninitialized ones to .bss (zero-filled at start).`,
    };
  };

  /* sbrk/brk semantics: return value is the PREVIOUS break */
  QZ.gens.sbrkTrace = () => {
    const b0 = 0x4000 + ri(0, 30) * 0x1000;
    const i1 = pick([0x1000, 0x2000, 0x3000]), i2 = pick([0x1000, 0x2000, 0x4000]);
    const r1 = b0, r2 = b0 + i1, r3 = b0 + i1 + i2;
    return {
      kind: 'sim',
      q: 'Model libc\'s internal use of sbrk (programmers never call it directly, p.15). The program break (the end of the heap) is initially ' + hx(b0) + '. The following calls run in order (all succeed). Give the value each call returns (hex) and the total heap growth.',
      state: { code: `sbrk(${hx(i1)});\nsbrk(${hx(i2)});\nsbrk(0);` },
      fields: [
        { label: 'Return value of the 1st sbrk', ans: hx(r1), kind: 'text' },
        { label: 'Return value of the 2nd sbrk', ans: hx(r2), kind: 'text' },
        { label: 'Return value of sbrk(0)', ans: hx(r3), kind: 'text' },
        { label: 'Total heap growth in bytes (decimal)', ans: i1 + i2, unit: 'B' },
      ],
      steps: `sbrk(inc) moves the break by inc and returns the PREVIOUS break.\n1st: previous = ${hx(b0)}, new break = ${hx(r2)}.\n2nd: previous = ${hx(r2)}, new break = ${hx(r3)}.\nsbrk(0): moves nothing, returns the current break ${hx(r3)}.\nGrowth = ${i1} + ${i2} = ${i1 + i2} B. (Programmers should not call brk/sbrk directly; malloc manages the break together with its own free list.)`,
    };
  };

  /* libc cost: why 1000 mallocs do not mean 1000 syscalls */
  QZ.gens.libcCost = () => {
    const n = ri(4, 20) * 50, s = pick([16, 24, 32, 48, 64]), c = pick([4096, 8192, 16384]);
    const total = n * s, calls = Math.ceil(total / c);
    return {
      kind: 'sim',
      q: `A program calls malloc(${s}) ${n} times in a row and never frees. The heap starts empty. Model libc as follows: whenever its heap is exhausted it calls brk once to extend the heap by ${c} bytes, then hands out ${s}-byte pieces from it (ignore bookkeeping overhead). Compare with a hypothetical design where every malloc is its own system call.`,
      state: { text: 'libc malloc/free = user-level library that subdivides the heap (fine-grained); brk/sbrk/mmap = system calls (coarse-grained, each costs a mode switch).' },
      fields: [
        { label: 'Total bytes requested', ans: total, unit: 'B' },
        { label: 'brk system calls issued by libc', ans: calls },
        { label: 'System calls if every malloc were a syscall', ans: n },
      ],
      steps: `Total = ${n} x ${s} = ${total} B. libc extends by ${c} B each time: ceil(${total} / ${c}) = ${calls} brk calls. A syscall-per-malloc design would need ${n}. So libc cuts mode switches by about ${(n / calls).toFixed(0)}x because most mallocs are served inside the already-obtained heap with no kernel entry.`,
    };
  };

  /* mmap file-range + array indexing arithmetic */
  QZ.gens.mmapMap = () => {
    const off = ri(0, 6) * 4096, len = ri(1, 4) * 4096, i = ri(1, len / 4096 * 100);
    const n = ri(3, 9), es = pick([4, 8]), base = ri(2, 30) * 256, k = ri(1, n - 1);
    return {
      kind: 'sim',
      q: 'Both snippets run successfully. Answer for the mmap file mapping, then for the malloc array (decimal numbers).',
      state: { code: `char *p = mmap(NULL, ${len}, PROT_READ, MAP_SHARED, fd, ${off});   /* file is large enough */\n\nint${es === 8 ? '64_t' : ''} *pi = malloc(sizeof(*pi) * ${n});   /* sizeof(*pi) = ${es}, returns address ${base} */` },
      fields: [
        { label: 'First file offset NOT covered by the mapping', ans: off + len },
        { label: 'Last file offset covered by the mapping', ans: off + len - 1 },
        { label: `File offset of the byte p[${i}]`, ans: off + i },
        { label: `Address of pi[${k}]`, ans: base + k * es },
      ],
      steps: `mmap covers file bytes [offset, offset+length) = [${off}, ${off + len}), so the first uncovered offset is ${off + len} and the last covered one is ${off + len - 1}. p[n] is file byte offset + n = ${off} + ${i} = ${off + i}. pi[k] is at base + k*sizeof = ${base} + ${k}*${es} = ${base + k * es} (the block spans ${base}..${base + n * es - 1}).`,
    };
  };

  Object.assign(QZ.GEN_LABEL, {
    xlate4: 'per-process run-time translation', heapSim: 'malloc/free heap + dangling', lazySim: 'lazy allocation page faults',
    layoutSim: 'address space layout regions', sbrkTrace: 'sbrk / brk break trace', libcCost: 'libc vs syscall cost', mmapMap: 'mmap range + array address',
  });

  QZ.add([
    G(4, 'per-process translation', 'xlate4'),
    G(4, 'malloc/free', 'heapSim'),
    G(4, 'lazy allocation', 'lazySim'),
    G(4, 'address space', 'layoutSim'),
    G(4, 'brk/sbrk', 'sbrkTrace'),
    G(4, 'libc', 'libcCost'),
    G(4, 'mmap', 'mmapMap'),

    /* ================= ORDER ================= */
    O(4, 'translation flow', 'Put the steps of a LEGAL memory access in the correct order (run-time address translation).', [
      'The process executes a load/store that uses a virtual address',
      'The MMU checks whether the virtual address is legal',
      'The MMU translates the virtual address into a physical address using the information the OS prepared',
      'Memory is accessed at the physical address and the data returns to the process',
    ], { mode: 'recall', distract: ['The kernel intercepts the load/store and translates it in software', 'The fault handler runs and decides what to do'], ref: 'L4 p.5', lvl: 2,
      why: 'The access first leaves the process as a virtual address; the MMU (hardware) checks legality and translates on every access; only then does memory see a physical address. The OS only prepared the tables beforehand (hw/sw split), it is not on the legal fast path.' }),
    O(4, 'translation flow', 'Put the steps of an ILLEGAL memory access in the correct order.', [
      'The process executes a load/store with a virtual address',
      'The MMU finds that the address is not legal',
      'The MMU does not access memory and raises a fault',
      'Control transfers to the fault handler in the kernel',
    ], { mode: 'recall', distract: ['The MMU produces a physical address anyway and the data is returned', 'The libc library corrects the address'], ref: 'L4 p.5', lvl: 2,
      why: 'Illegal address: the memory is never touched. The hardware turns the event into a fault (exception) and hands control to the kernel, which decides (e.g., terminate the process).' }),
    O(4, 'lazy allocation', 'Put the lazy-allocation chain in order, from the allocation request to the first successful use.', [
      'The process calls malloc/mmap for a large region',
      'The kernel only reserves the virtual address range (no physical page yet)',
      'The process touches an address in the region for the first time',
      'The MMU finds no mapping and raises a page fault',
      'The kernel allocates a physical page (zero-filled for anonymous memory) and maps it',
      'The access completes using the newly mapped page',
    ], { mode: 'recall', distract: ['The kernel allocates all physical pages for the whole region at the call', 'The process is killed because the page was not resident'], ref: 'L4 p.8', lvl: 2,
      why: 'Lazy (on-demand) allocation: reserving virtual space is cheap; physical memory is committed only when a page is first touched, through a page fault. That is why the virtual space may be far larger than physical memory.' }),
    O(4, 'malloc/free', 'Order the states of the heap snapshots for this code: `int *pi;` then `pi = malloc(sizeof(int)*4);` then `free(pi);` then a later `*pi`.', [
      'pi is a stack variable; the heap holds nothing yet',
      'After malloc: 4 ints (16 bytes) are allocated on the heap and pi points to the first one',
      'After free: the 16 bytes are marked freed, but pi still holds the old address (dangling pointer)',
      'Dereferencing pi now is invalid (use after free)',
    ], { ref: 'L4 p.13', lvl: 2,
      why: 'free() changes the heap, not the pointer variable. Between free and the next assignment, pi is a dangling pointer, so *pi is invalid. Setting pi = NULL by convention removes the dangling address.' }),
    O(4, 'address space', 'Order the regions of the Lecture 4 address-space figure from the top (address 0, lowest) to the bottom (highest address).', [
      'unused',
      'read-only segment (.init, .text, .rodata)',
      'read/write segment (.data, .bss)',
      'run-time heap (managed by malloc, ends at brk)',
      'free gap',
      'user stack',
      'kernel memory (not accessible from user code)',
    ], { ref: 'L4 p.7', lvl: 2,
      why: 'Static area (code and data) first, fixed by exec; then the heap which grows toward higher addresses; the stack sits just above kernel memory near the bottom of the figure and grows toward lower addresses, so the free gap lies between heap and stack; kernel memory is mapped but inaccessible from user mode.' }),
    O(4, 'COW', 'Order what happens when a parent forks and then writes to a private page that is still shared with the child.', [
      'fork creates the child with the same address-space layout; private pages are shared at first',
      'The parent writes to a shared private page',
      'The kernel makes a copy of that page for the writer',
      'The parent modifies its own copy while the child still sees the old contents',
    ], { mode: 'recall', distract: ['The child is killed because the page is read-only', 'The whole address space is copied at fork time'], ref: 'L4 p.19', lvl: 2,
      why: 'Private mappings use copy-on-write: share until someone writes, then copy only that page. The modification stays invisible to the other process, and no copy is paid for pages nobody writes (this is how fork is made cheap).' }),

    O(4, 'malloc/brk', 'Put in order what happens when a process calls malloc and the heap has no free chunk large enough.', [
      'The process calls malloc',
      'libc finds no free chunk that fits in the current heap',
      'libc calls brk/sbrk (or mmap) to ask the kernel for more memory',
      'The kernel moves the break and extends the heap',
      'libc carves a chunk out of the new area and returns its pointer',
    ], { mode: 'recall', distract: ['The kernel records the chunk that malloc hands out', 'The MMU allocates the new heap memory'], ref: 'L4 p.11, p.15', lvl: 2,
      why: 'malloc is a user-level library routine. The OS is coarse-grained (break or mappings); chunk bookkeeping inside the heap is libc work, and the kernel is entered only when the heap must grow.' }),
    O(4, 'realloc', 'Put the safe way to grow a block with realloc in order.', [
      'tmp = realloc(p, newsize)',
      'Check whether tmp is NULL',
      'If NULL: p still points to the valid old block, so handle the error',
      'Only if not NULL: p = tmp',
    ], { mode: 'recall', distract: ['p = realloc(p, newsize) directly', 'free(p) before calling realloc'], ref: 'L4 p.14', lvl: 2,
      why: 'On failure realloc returns NULL but leaves the old block valid. Assigning the result directly to p would overwrite the only pointer and leak the block, so a temporary is used.' }),
    O(4, 'goals', 'Order the design chain for virtual memory: from the problem to the mechanism that addresses it.', [
      'Several processes must be resident in memory at once (utilization)',
      'This raises protection, transparency and efficiency requirements',
      'The OS inserts a level of indirection: a mapping table between virtual and physical addresses',
      'The MMU hardware translates every access and checks its legality',
      'The OS prepares the mapping information and handles faults',
    ], { ref: 'L4 p.4-6', lvl: 2,
      why: 'Top-down flow: goal (utilization with protection) -> design idea (indirection) -> mechanism (translation on every access) -> hw/sw split (MMU does the fast path, OS sets up and handles faults).' }),

    /* ================= MATCH ================= */
    X(4, 'hw/sw split', 'Match each party with its role in address translation (hw/sw split).', [
      ['MMU (hardware)', 'Translates every access at run time and checks legality'],
      ['OS (software)', 'Prepares the information the MMU uses to translate'],
      ['Kernel fault handler', 'Runs when the MMU reports an illegal access'],
      ['Process', 'Issues loads and stores using virtual addresses only'],
    ], { ref: 'L4 p.5', lvl: 2, why: 'The fast path (translate and check on every access) is hardware; the OS only sets up beforehand and handles the exceptional case.' }),
    X(4, 'libc vs syscall', 'Match each function with its level and role.', [
      ['malloc', 'Library routine that subdivides the heap, rarely entering the kernel'],
      ['calloc', 'Library routine that allocates and zeroes a block'],
      ['free', 'Library routine that releases a block, usually without a kernel call'],
      ['sbrk', 'System call that moves the program break'],
      ['mmap', 'System call that creates a mapping'],
    ], { ref: 'L4 p.11, p.15', lvl: 1, why: 'malloc/calloc/realloc/free are libc (user-level, fine-grained); brk/sbrk/mmap are system calls (coarse-grained, each costs a mode switch).' }),
    X(4, 'mmap', 'Match each mmap argument (in call order) with its role.', [
      ['1st argument: ptr / addr', 'Start address hint (NULL: the kernel chooses)'],
      ['2nd argument: length', 'Length of the mapping'],
      ['3rd argument: prot', 'Protection such as PROT_READ / PROT_WRITE'],
      ['4th argument: flags', 'MAP_PRIVATE, MAP_SHARED, MAP_ANONYMOUS'],
      ['5th argument: fd', 'File descriptor of the backing file'],
      ['6th argument: offset', 'Start position inside the file'],
    ], { ref: 'L4 p.16', lvl: 2, why: 'mmap(ptr, length, prot, flags, fd, offset). fd and offset are used for file mapping; the first argument is only a hint.' }),
    X(4, 'malloc/brk', 'Match each memory function with what it does.', [
      ['malloc', 'Allocates a block on the heap; returns NULL on failure'],
      ['calloc', 'Allocates and zeroes the memory'],
      ['realloc', 'Changes the size of an existing block'],
      ['free', 'Releases a malloc block; the pointer variable keeps its old value'],
      ['brk', 'Sets the program break to a given address'],
      ['sbrk', 'Moves the break by an increment and returns the previous break'],
    ], { ref: 'L4 p.12-15', lvl: 2, why: 'malloc/calloc/realloc/free are libc functions managing the heap; brk/sbrk are system calls that move the end of the heap.' }),
    X(4, 'mapping types', 'Match each mapping type with its typical use.', [
      ['Private file mapping', 'Loading program code and initialized data (writes use COW)'],
      ['Private anonymous mapping', 'Heap, stack, large malloc requests'],
      ['Shared file mapping', 'Reading and writing a file as memory, visible to all mappers and written back to the file'],
      ['Shared anonymous mapping', 'Shared memory between parent and child'],
    ], { ref: 'L4 p.18-19', lvl: 2, why: 'File vs anonymous = is there a backing file; shared vs private = are modifications visible to others (private uses copy-on-write).' }),
    X(4, 'goals', 'Match each virtual-memory goal or mechanism with what it means.', [
      ['Protection', 'A process can fail without affecting other processes'],
      ['Transparency', 'A large, contiguous space; processes unaware that memory is shared'],
      ['Efficiency (space)', 'Minimize fragmentation caused by variable-sized requests'],
      ['Efficiency (time)', 'Hardware support so translation is fast'],
      ['Level of indirection', 'A mapping table between virtual and physical addresses'],
    ], { ref: 'L4 p.3, p.6', lvl: 2, why: 'The goals (protection, transparency, efficiency) are achieved by the indirection mechanism; fragmentation (space) is what later pushes designs from base&bounds to segmentation to paging.' }),
    X(4, 'address space', 'Match each region with the kind of mapping/backing it has.', [
      ['.text (code)', 'Read-only, loaded from the executable file by exec'],
      ['.data', 'Initialized globals, read/write'],
      ['.bss', 'Uninitialized globals, zero-filled at start'],
      ['heap', 'Dynamic area managed by malloc, ends at brk'],
      ['stack', 'Dynamic area for local variables, grows toward lower addresses'],
    ], { ref: 'L4 p.7', lvl: 2, why: 'Code and data are static (set by exec); heap and stack are dynamic and grow or shrink at run time.' }),

    /* ================= extra MCQ for MEDIUM rationale gaps ================= */
    M(4, 'hw translation', 'Why is address translation done by hardware (the MMU) rather than by OS software? Select all that apply.', [
      'It happens on every memory access, so entering the kernel each time would be far too slow',
      'The MMU can check legality and translate in the same access',
      'The OS still prepares the tables and handles faults when the hardware reports them',
      'The OS can never read the translation tables because they belong to the MMU',
    ], 'abc', 'Every load/store/instruction fetch needs translation, so it must be fast: hardware does it, the OS sets up the information and handles faults (hw/sw split). The OS does set the tables, so d is false.', { ref: 'L4 p.5', lvl: 2 }),
    M(4, 'zeroing', 'malloc does not zero memory, yet the OS zeroes pages it gives to a process. Select all correct statements.', [
      'malloc skips zeroing because zeroing costs time and callers usually overwrite the memory anyway',
      'The OS must zero pages because a page may still hold data of another process, which would otherwise leak',
      'Because malloc does not zero, the OS may skip zeroing',
      'calloc exists for callers that need zeroed memory',
    ], 'abd', 'Two levels: inside one process leftover data is the process own business (performance wins, use calloc); across processes it would be a security leak, so the OS always zeroes. Zeroing in malloc would not replace the OS duty.', { ref: 'L4 p.14, p.18', lvl: 2 }),
    M(4, 'translation', 'In the example 0x30408 translated to 0x92408, which statements are correct? Select all that apply.', [
      'The low part (408) stays the same',
      'The upper part of the address is replaced by the mapping',
      'Physical address always equals virtual address when the address is legal',
      'The MMU hardware, not the OS, performs the translation on each access',
    ], 'abd', 'Translation changes the upper bits and keeps the low offset (the reason is page-based mapping in Lecture 6). PA = VA is false; the MMU in hardware does it.', { ref: 'L4 p.5', lvl: 2 }),
    M(4, 'fork and COW', 'A parent forks a child. Both have a private anonymous page that is initially shared. Then the parent writes to it. Select all correct statements.', [
      'The child keeps seeing the old contents',
      'A physical copy of that page is made when the write happens',
      'The kernel copies every page of the parent at the moment of fork',
      'If the page had been a SHARED mapping, the child would see the parent write',
    ], 'abd', 'Private mappings use copy-on-write: copy only on the first write, only that page. With a shared mapping modifications are visible to all mappers, so the child would see them.', { ref: 'L4 p.19', lvl: 2 }),
    M(4, 'libc vs syscall', 'A program calls malloc 1000 times with small sizes. Which statements are correct? Select all that apply.', [
      'malloc is a library function, not a system call',
      'libc asks the OS for memory (brk/mmap) only when its heap is exhausted',
      'There will be about 1000 mode switches into the kernel because every malloc is a system call',
      'The library subdivides large chunks received from the OS',
    ], 'abd', 'System calls cost a mode switch. libc takes big chunks from the OS (coarse-grained) and serves small requests itself (fine-grained).', { ref: 'L4 p.11', lvl: 2 }),
  ]);
})();
