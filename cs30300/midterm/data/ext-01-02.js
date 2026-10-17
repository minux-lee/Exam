/* Lecture 1–2 extension: ORDER / MATCH / SIM items covering the study gaps (protection, I/O, interrupts, system calls, upcalls). */
(function (QZ) {
  'use strict';
  const { M, O, X, SIM, G } = QZ.mk;
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[R(0, a.length - 1)];
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = R(0, i); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const hx = n => '0x' + n.toString(16);

  /* =========================== generators (real simulation code) =========================== */

  /* 1. kernel / user stack contents of several processes (L2 p.12) */
  QZ.gens.kstackState = () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, R(4, 6));
    const n = names.length;
    let st;
    do {
      st = names.map(() => pick(['Ready', 'Blocked']));
      st[R(0, n - 1)] = 'Running';            // single CPU: exactly one Running process
    } while (!st.includes('Blocked') || !st.includes('Ready') || st.filter(s => s === 'Running').length !== 1);
    const frames = { Running: 0, Ready: 1, Blocked: 3 };           // Blocked: User CPU State + Syscall Handler + I/O Driver Top Half
    const cause = { Running: 'executing in user mode', Ready: 'preempted by a timer interrupt', Blocked: 'blocked inside a read() system call, waiting for the disk' };
    const total = st.reduce((s, x) => s + frames[x], 0);
    const withState = st.filter(x => x !== 'Running').length;
    const sysc = st.filter(x => x === 'Blocked').length;
    return {
      kind: 'sim',
      q: 'Single CPU. Each process has its own user stack and kernel stack (the interrupt stack is part of the kernel stack). The table shows what each process is doing. Count the frames.',
      state: { table: { head: ['Process', 'What it is doing'], rows: names.map((nm, i) => [nm, cause[st[i]]]) } },
      fields: [
        { label: 'Total number of frames on all kernel stacks (count User CPU State, Syscall Handler, I/O Driver Top Half each as one frame)', ans: total, kind: 'num' },
        { label: 'Number of processes whose kernel stack contains a saved User CPU State', ans: withState, kind: 'num' },
        { label: 'Number of processes whose user stack has a Syscall frame on top', ans: sysc, kind: 'num' },
      ],
      steps: names.map((nm, i) => `${nm}: ${st[i]} → kernel stack ${st[i] === 'Running' ? 'empty (0 frames)' : st[i] === 'Ready' ? 'User CPU State (1 frame)' : 'User CPU State + Syscall Handler + I/O Driver Top Half (3 frames)'}` + (st[i] === 'Blocked' ? '; user stack top = Syscall frame' : '')).join('\n') +
        `\ntotal frames = ${total}; processes with saved User CPU State = ${withState} (all that are not Running); Syscall on user stack = ${sysc}.`,
    };
  };

  /* 2. the read()-style system call path: stack pointer, step numbers (L2 p.17) */
  QZ.gens.syscallPath = () => {
    const calls = [['read', ['fd', 'buffer', 'nbytes']], ['write', ['fd', 'buffer', 'nbytes']], ['lseek', ['fd', 'offset', 'whence']], ['open', ['path', 'flags']], ['close', ['fd']], ['pipe', ['pipefd']]];
    const [name, args] = pick(calls);
    const k = args.length, w = pick([4, 8]), sp0 = R(256, 4000) * 16;
    const pushed = args.slice().reverse();
    const afterPush = sp0 - k * w;
    const tr = k + 3, total = k + 8;
    const rows = [];
    pushed.forEach((a, i) => rows.push([String(i + 1), `Push ${a}`, 'user program', `SP = ${sp0 - (i + 1) * w}`]));
    rows.push([String(k + 1), `Call ${name} (library procedure)`, 'user program → library', '']);
    rows.push([String(k + 2), 'Put syscall code in a register', 'library', '']);
    rows.push([String(k + 3), 'Trap to the kernel', 'library (trap instruction)', 'mode: user → kernel']);
    rows.push([String(k + 4), 'Dispatch on syscall number', 'kernel', '']);
    rows.push([String(k + 5), 'Syscall handler runs', 'kernel', '']);
    rows.push([String(k + 6), 'Return to user mode', 'kernel/hardware', 'mode: kernel → user']);
    rows.push([String(k + 7), 'Return to caller', 'library', '']);
    rows.push([String(k + 8), 'Increment SP', 'user program', '']);
    return {
      kind: 'sim',
      q: `A user program calls ${name}(${args.join(', ')}) following the textbook calling sequence: the arguments are pushed in reverse order (last argument first), each push takes ${w} bytes, and the stack grows downward. SP is ${sp0} before the first push. "Increment SP" at the end removes the pushed arguments again.`,
      state: { table: { head: ['Step', 'Action', 'Who', 'Note (SP / mode)'], rows: rows.map(r => [r[0], r[1], r[2], r[3] && r[0] > k ? r[3] : (r[0] <= k ? r[3] : '')]) } },
      fields: [
        { label: `SP after all arguments are pushed`, ans: afterPush, kind: 'num' },
        { label: 'Name of the argument that is pushed FIRST', ans: pushed[0], kind: 'text' },
        { label: 'Step number of the trap instruction', ans: tr, kind: 'num' },
        { label: 'SP after the final "Increment SP" step', ans: sp0, kind: 'num' },
        { label: 'Total number of steps in the whole sequence', ans: total, kind: 'num' },
      ],
      steps: `${k} argument(s) × ${w} B = ${k * w} B pushed: SP = ${sp0} − ${k * w} = ${afterPush}. Pushes happen in reverse order, so the first push is "${pushed[0]}" (the last parameter).\nSteps 1..${k} push, ${k + 1} call, ${k + 2} syscall code into register, ${k + 3} TRAP (user → kernel; this is the first moment kernel code runs), ${k + 4} dispatch, ${k + 5} handler, ${k + 6} back to user mode, ${k + 7} return to caller, ${k + 8} Increment SP → SP = ${afterPush} + ${k * w} = ${sp0}. Total = ${total}.`,
    };
  };

  /* 3. DMA disk read: actors and CPU involvement (L2 p.8–10) */
  QZ.gens.dmaRead = () => {
    const bytes = pick([4096, 8192, 16384, 32768]), rate = pick([128, 256, 512, 1024]);
    const t = [R(2, 10), R(5, 20), R(1, 5), R(4, 9) * 1000, R(50, 200), R(2, 10), R(5, 20), bytes / rate, R(1, 5)];
    const who = ['CPU → chipset', 'SATA controller ↔ disk', 'ack → CPU', 'disk', 'disk (internal buffer)', 'disk → SATA controller', 'SATA controller', 'SATA controller → main memory', 'SATA controller → CPU'];
    const act = ['send read command', 'queue command & ack', 'ack', 'perform disk read', 'buffer data', 'notify', 'DMA setup', 'DMA', 'interrupt'];
    const total = t.reduce((a, b) => a + b, 0);
    const busy = t[0] + t[2] + t[8];
    return {
      kind: 'sim',
      q: `A process reads one block of ${bytes} bytes from disk using DMA. The hardware needs the following time for each of the 9 steps (the DMA step moves ${bytes} bytes at ${rate} bytes per microsecond). The CPU works only in the steps where it issues the command, receives the ack, and handles the final interrupt; during every other step it can run another process.`,
      state: { table: { head: ['Step', 'Action', 'Actor', 'Time (µs)'], rows: t.map((x, i) => [String(i + 1), act[i], who[i], String(x)]) } },
      fields: [
        { label: 'Total latency from step 1 to step 9 (µs)', ans: total, kind: 'num' },
        { label: 'CPU time spent on this request, steps 1, 3 and 9 (µs)', ans: busy, kind: 'num' },
        { label: 'Time the CPU is free to run another process (µs)', ans: total - busy, kind: 'num' },
      ],
      steps: `DMA time = ${bytes} / ${rate} = ${bytes / rate} µs.\ntotal = ${t.join(' + ')} = ${total} µs.\nCPU busy = step 1 (${t[0]}) + step 3 (${t[2]}) + step 9 (${t[8]}) = ${busy} µs.\nfree = ${total} − ${busy} = ${total - busy} µs. Without DMA/interrupt (polling) the CPU would wait the whole ${total} µs.`,
    };
  };

  /* 4. illegal access: MMU legal check → physical address or fault → SIGSEGV (L1 p.31–32) */
  QZ.gens.mmuAccess = () => {
    const page = 0x1000;
    const slots = shuffle([0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90, 0xA0]);
    const vstarts = [0x10000, 0x30000, 0x50000].map(v => v + page * R(0, 3));
    const regs = vstarts.map((s, i) => ({ s, len: page * R(2, 4), pa: slots[i] * page * 2 }));
    const kernelVA = 0xC0000 + page * R(0, 15);
    const lab = ['code', 'heap', 'stack'];
    const legal = () => { const r = pick(regs); return r.s + R(0, r.len - 1); };
    const illegal = () => {
      const c = R(0, 2);
      if (c === 0) return kernelVA + R(0, page - 1);
      const r = pick(regs);
      return c === 1 ? r.s + r.len + R(0, 99) : r.s - R(1, 200);
    };
    let acc;
    do {
      acc = [0, 1, 2, 3].map(() => (Math.random() < 0.5 ? legal() : illegal()));
    } while (acc.filter(a => regs.some(r => a >= r.s && a < r.s + r.len)).length === 0 || acc.filter(a => !regs.some(r => a >= r.s && a < r.s + r.len)).length === 0);
    const op = acc.map(() => pick(['load', 'store']));
    const res = acc.map(a => { const r = regs.find(r => a >= r.s && a < r.s + r.len); return r ? hx(r.pa + (a - r.s)) : 'fault'; });
    const firstBad = res.findIndex(x => x === 'fault') + 1;
    return {
      kind: 'sim',
      q: 'The MMU translates every load/store using a table configured by the kernel (table below; any virtual address not covered is illegal, including kernel addresses). Treat each access on its own. Give the physical address, or "fault" if the MMU sends the access to the kernel\'s fault handler.',
      state: {
        table: { head: ['Region', 'Virtual start', 'Length', 'Physical start'], rows: regs.map((r, i) => [lab[i], hx(r.s), hx(r.len), hx(r.pa)]) },
        text: 'Accesses:\n' + acc.map((a, i) => `(${i + 1}) ${op[i]} ${hx(a)}`).join('\n'),
      },
      fields: [
        ...acc.map((a, i) => ({ label: `Access (${i + 1}) ${op[i]} ${hx(a)} → physical address or fault`, ans: res[i], kind: 'text' })),
        { label: 'If the process ran these accesses in order with no SIGSEGV handler, which access number first triggers SIGSEGV (and kills it)?', ans: firstBad, kind: 'num' },
      ],
      steps: acc.map((a, i) => {
        const r = regs.find(r => a >= r.s && a < r.s + r.len);
        return r ? `(${i + 1}) ${hx(a)} lies in ${lab[regs.indexOf(r)]} [${hx(r.s)}, ${hx(r.s + r.len)}) → legal → PA = ${hx(r.pa)} + (${hx(a)} − ${hx(r.s)}) = ${hx(r.pa + a - r.s)}`
          : `(${i + 1}) ${hx(a)} is in no mapped region${a >= 0xC0000 ? ' (kernel address)' : ''} → illegal → MMU raises a page fault → kernel fault handler checks it is a violation → kernel injects SIGSEGV`;
      }).join('\n') + `\nThe first fault is access ${firstBad}; with the default SIGSEGV action the process is killed there (core dumped), so later accesses never run.`,
    };
  };

  /* 5. virtual region scattered over physical memory by a kernel-configured table (L1 p.29–31) */
  QZ.gens.scatterMap = () => {
    const page = 0x1000, v0 = R(0x10, 0x40), n = 4;
    const contiguous = Math.random() < 0.3;
    let fr;
    if (contiguous) { const f = R(0x20, 0x80); fr = [f, f + 1, f + 2, f + 3]; }
    else do { fr = Array.from({ length: n }, () => R(0x10, 0xff)); } while (new Set(fr).size < n || fr.every((f, i) => i === 0 || f === fr[i - 1] + 1));
    const q = [];
    const mk = () => { const i = R(0, n - 1); return v0 * page + i * page + R(0, page - 1); };
    q.push(mk()); q.push(mk());
    q.push(pick([(v0 + n) * page + R(0, 99), (v0 - 1) * page + R(0, 99)]));
    const qs = shuffle(q);
    const pa = va => { const i = (va >> 12) - v0; return i >= 0 && i < n ? hx(fr[i] * page + (va & 0xfff)) : 'fault'; };
    return {
      kind: 'sim',
      q: `A process sees ${n} consecutive virtual pages (page size 4 KiB). The kernel has configured the table below; the hardware does the translation on every access. Pages outside the table are illegal.`,
      state: { table: { head: ['Virtual page number', 'Physical frame number'], rows: fr.map((f, i) => [hx(v0 + i), hx(f)]) } },
      fields: [
        ...qs.map(v => ({ label: `Physical address of virtual address ${hx(v)} (or "fault")`, ans: pa(v), kind: 'text' })),
        { label: 'Is the process\'s contiguous virtual region also contiguous in physical memory? (yes/no)', ans: contiguous ? 'yes' : 'no', kind: 'text' },
      ],
      steps: qs.map(v => { const i = (v >> 12) - v0; return i >= 0 && i < n ? `${hx(v)}: page ${hx(v >> 12)} → frame ${hx(fr[i])}, offset ${hx(v & 0xfff)} kept → ${pa(v)}` : `${hx(v)}: page ${hx(v >> 12)} is not in the table → illegal → fault`; }).join('\n') +
        `\nFrames ${fr.map(hx).join(', ')} ${contiguous ? 'are consecutive' : 'are scattered'}: the virtual view V1 is contiguous, the physical view V2 ${contiguous ? 'happens to be too' : 'is not'}. Hardware translates (fast); the kernel only configures the table (protection).`,
    };
  };

  /* 6. timer interrupt: kernel regains control (L1 p.34) */
  QZ.gens.timerTick = () => {
    const P = pick([2, 4, 5, 10]), h = pick([50, 100, 200]);
    let s; do { s = R(3, 40); } while (s % P === 0);
    const D = R(3, 9) * P + R(0, P - 1);
    const first = (Math.floor(s / P) + 1) * P;
    const cnt = Math.floor((s + D) / P) - Math.floor(s / P);
    return {
      kind: 'sim',
      q: `The kernel armed the timer at boot (time 0) so that it raises an interrupt every ${P} ms. A process starts at t = ${s} ms and then runs an infinite loop. Each timer interrupt suspends the process, saves its state, and runs the OS handler for ${h} µs before the process resumes. Interrupts happen at multiples of ${P} ms.`,
      state: {},
      fields: [
        { label: 'Time (ms) at which the kernel first regains control after the process starts', ans: first, kind: 'num' },
        { label: `Number of timer interrupts in the next ${D} ms (t in (${s}, ${s + D}])`, ans: cnt, kind: 'num' },
        { label: 'Total time spent in the OS handler during that window (µs)', ans: cnt * h, kind: 'num' },
      ],
      steps: `Interrupts occur at 0, ${P}, ${2 * P}, ... Next multiple of ${P} after ${s} = ${first} → the kernel regains control then even though the loop never returns (this is why the kill/reschedule decision is possible).\ncount = floor(${s + D}/${P}) − floor(${s}/${P}) = ${Math.floor((s + D) / P)} − ${Math.floor(s / P)} = ${cnt}.\nhandler time = ${cnt} × ${h} = ${cnt * h} µs.`,
    };
  };

  /* 7. signal delivery: PC/SP before, during (L2 p.20) */
  QZ.gens.signalFrame = () => {
    const pc = 0x400000 + 4 * R(0x10, 0x400), sp = 0x7fff0000 + 16 * R(0x10, 0x800), hpc = 0x401000 + 4 * R(0x10, 0x3ff), ss = 0x7f000000 + 0x100 * R(1, 0x400);
    return {
      kind: 'sim',
      q: 'A process executing `x = y + z;` at PC = ' + hx(pc) + ' with SP = ' + hx(sp) + ' (its user stack) receives a signal. The signal handler starts at ' + hx(hpc) + ' and the signal stack (in the process\'s user address space) is at ' + hx(ss) + '. The kernel delivers the signal with an upcall. Fill in the state while the handler runs.',
      state: { table: { head: ['Item', 'Value'], rows: [['PC at the interruption', hx(pc)], ['SP at the interruption', hx(sp)], ['Signal handler address', hx(hpc)], ['Signal stack address', hx(ss)]] } },
      fields: [
        { label: 'Program Counter while the handler runs', ans: hx(hpc), kind: 'text' },
        { label: 'Stack Pointer while the handler runs', ans: hx(ss), kind: 'text' },
        { label: 'PC value saved on the signal stack', ans: hx(pc), kind: 'text' },
        { label: 'SP value saved on the signal stack', ans: hx(sp), kind: 'text' },
      ],
      steps: `Upcall before: PC = ${hx(pc)} (x = y + z), SP = ${hx(sp)} (user program's stack).\nUpcall during: the kernel saved the interrupted registers, SP and PC on the Signal Stack, then set PC = handler (${hx(hpc)}) and SP = Signal Stack (${hx(ss)}).\nSaved PC = ${hx(pc)}, saved SP = ${hx(sp)}, so the interrupted code can be resumed from there (the slide shows only Before and During).`,
    };
  };

  QZ.GEN_LABEL = Object.assign(QZ.GEN_LABEL || {}, {
    kstackState: 'kernel/user stack contents per process state', syscallPath: 'read() syscall path trace', dmaRead: 'DMA disk read: CPU involvement',
    mmuAccess: 'MMU translation or fault → SIGSEGV', scatterMap: 'virtual region mapped to scattered frames', timerTick: 'timer interrupt timeline', signalFrame: 'signal delivery: PC/SP before and during',
  });

  /* =========================== bank =========================== */
  QZ.add([
    /* ---------- generated sims ---------- */
    G(2, 'process states', 'kstackState', { ref: 'L2 p.12', lvl: 2 }),
    G(2, 'system call path', 'syscallPath', { ref: 'L2 p.17', lvl: 2, lab: true }),
    G(2, 'DMA', 'dmaRead', { ref: 'L2 p.8-10', lvl: 2 }),
    G(1, 'memory protection', 'mmuAccess', { ref: 'L1 p.31-32', lvl: 2 }),
    G(1, 'memory protection', 'scatterMap', { ref: 'L1 p.29-31', lvl: 2 }),
    G(1, 'timer', 'timerTick', { ref: 'L1 p.34', lvl: 1 }),
    G(2, 'upcall', 'signalFrame', { ref: 'L2 p.20', lvl: 2 }),

    /* ---------- ORDER ---------- */
    O(2, 'system call path', 'Put the steps of `count = read(fd, buffer, nbytes);` in the order in which they happen.', [
      'User program pushes nbytes, then &buffer, then fd',
      'User program calls the library procedure read',
      'Library puts the syscall code for read in a register',
      'Library executes the trap instruction (user → kernel mode)',
      'Kernel dispatches on the syscall number to select a handler',
      'The syscall handler for read runs',
      'Control returns to the library in user mode',
      'Library returns to the caller',
      'Caller increments SP to remove the pushed arguments',
    ], { ref: 'L2 p.17', lvl: 2, lab: true, why: 'Arguments are pushed in reverse order (nbytes first), then the library procedure runs, names the syscall with a number in a register and traps. Only the trap moves into kernel mode; the kernel dispatches by number and runs the handler, then returns, and the caller finally pops its arguments.' }),
    O(2, 'system call path', 'Recall the kernel-side part of a system call. From the trap instruction until the user program continues, which steps happen, in order?', [
      'Trap instruction switches to kernel mode and saves the caller state',
      'Kernel dispatches using the syscall number',
      'Syscall handler executes (after verifying the parameters)',
      'Kernel restores the saved state and returns to user mode',
      'Library returns to the caller',
    ], { mode: 'recall', distract: ['Kernel copies the whole user program into kernel memory', 'The timer is disabled for the duration of the call', 'User program jumps directly to the kernel handler address'], ref: 'L2 p.15-17', lvl: 2, lab: true, why: 'The trap carries the syscall number; the kernel looks up the handler (dispatch), verifies the arguments (e.g., pointers), runs it, then restores state and drops back to user mode. A direct user jump into kernel code would defeat protection.' }),
    O(1, 'memory protection', 'A process executes `i = kernel_address; *i = 1;`. Recall what happens, in order, after the store is executed.', [
      'MMU checks the access and finds it illegal',
      'MMU raises a page fault (exception) to the kernel',
      'Kernel runs the page fault handler and investigates the violation',
      'Kernel concludes the access is illegal and injects SIGSEGV',
      'Process is killed (or its SIGSEGV signal handler runs)',
    ], { mode: 'recall', distract: ['The store is written to kernel memory and the kernel is notified later', 'Kernel copies the page to user memory and retries', 'The timer interrupt kills the process'], ref: 'L1 p.31-32', lvl: 2, why: 'Hardware (MMU) detects, the kernel decides. Assigning the kernel address to i (line 2) is allowed; only the store (line 3) is intercepted. The kernel, not the process, sends SIGSEGV.' }),
    O(1, 'memory protection', 'Order the steps that follow the illegal store `*i = 1` (kernel address), from the store until the process receives SIGSEGV.', [
      'Process issues the store to a kernel address',
      'MMU asks "Is address legal?" — No',
      'Access goes to the fault handler (page fault)',
      'Kernel investigates and finds a violation',
      'Kernel injects SIGSEGV into the process',
      'Process receives SIGSEGV (default action: terminate)',
    ], { ref: 'L1 p.31-32', lvl: 1, why: 'The first two steps are in hardware (MMU), from the third on the kernel runs. The kernel, not the MMU, creates the signal.' }),
    O(2, 'interrupt handling', 'Recall how the kernel handles an interrupt while a user process runs, from the interrupt to the continuation of the process.', [
      'Interrupt occurs while the process runs',
      'CPU state of the process is preserved on the interrupt stack (kernel memory)',
      'Control is dispatched to the interrupt handler (ISR), running with interrupts off',
      'Interrupt handler executes',
      'Saved state is restored and the kernel returns with iret',
    ], { mode: 'recall', distract: ['CPU state is pushed on the user stack of the process', 'The kernel jumps back to the process with a normal jump instruction', 'The kernel loads a new program into the process'], ref: 'L2 p.11-14', lvl: 2, why: 'The slide figure labels the three phases 1 Interrupt, 2 Dispatch to handler, 3 Return. The state must be saved in kernel memory (not on the user stack, which the user can modify); x86 does not allow a direct kernel→user jump, so iret restores state and lowers the privilege together.' }),
    O(2, 'interrupt handling', 'A disk interrupt arrives for the CPU in the middle of a user instruction. Put the events in order.', [
      'The device raises the interrupt, which the interrupt controller delivers to the CPU',
      'CPU saves the process state on the interrupt stack',
      'CPU dispatches to the interrupt handler',
      'Handler finishes',
      'iret restores the state and returns to the process',
    ], { ref: 'L2 p.9-14', lvl: 2, why: 'The device signal travels through the interrupt controller first (p.9 figure; the 3/4 numbering on that slide is unclear, so only the overall direction is tested); then the kernel-side sequence (save state, dispatch, return) of p.11 applies.' }),
    O(2, 'DMA', 'Order the nine steps of reading a block from disk on a real PC (SATA controller).', [
      'CPU sends the read command',
      'SATA controller queues the command at the disk and acks',
      'Ack reaches the CPU',
      'Disk performs the read',
      'Disk buffers the data',
      'Disk notifies the SATA controller',
      'SATA controller sets up the DMA',
      'DMA transfers the data into main memory',
      'SATA controller raises an interrupt to the CPU',
    ], { ref: 'L2 p.10', lvl: 2, why: 'CPU is involved only in steps 1 (command), 3 (ack) and 9 (interrupt). Steps 2–8 happen without the CPU, so it can run another process. The interrupt is last because the data must already be in memory.' }),
    O(2, 'DMA', 'Recall the main stages of a DMA disk read. Which stages occur, in order?', [
      'CPU gives the read command to the controller',
      'Disk reads the block into its buffer',
      'Controller sets up the DMA',
      'DMA moves the block into main memory without the CPU',
      'Controller interrupts the CPU to report completion',
    ], { mode: 'recall', distract: ['CPU copies each word from the controller buffer to memory', 'CPU polls the controller until the block arrives', 'Kernel sleeps until the next timer interrupt'], ref: 'L2 p.8-10', lvl: 2, why: 'DMA removes the word-by-word copy by the CPU; the interrupt (not polling) removes the busy waiting.' }),
    O(1, 'timer', 'Recall how the kernel can regain control from a process stuck in an infinite loop.', [
      'During boot the kernel starts the timer hardware',
      'Timer periodically raises an interrupt (every few ms)',
      'Running process is suspended and its state saved',
      'Pre-configured OS interrupt handler runs',
      'Kernel can kill the process or switch to another',
    ], { mode: 'recall', distract: ['The process voluntarily calls yield', 'Kernel scans each instruction of the process in a simulator', 'The user program programs the timer on its own'], ref: 'L1 p.34', lvl: 1, why: 'Arming the timer is a boot-time kernel action (privileged); every later interrupt hands control to the OS regardless of the process.' }),
    O(2, 'I/O hierarchy', 'A CPU reads from a disk. Put the components that a request passes through in order (CPU to disk).', [
      'CPU chip (bus interface)',
      'System bus',
      'I/O bridge',
      'I/O bus',
      'Disk controller',
      'Disk',
    ], { ref: 'L2 p.6', lvl: 1, why: 'The CPU never talks to a device directly: bus interface → system bus → I/O bridge → I/O bus → controller (registers and buffer) → device. The memory bus branches off at the I/O bridge to main memory.' }),
    O(2, 'upcall', 'Order the delivery of a signal to a user process.', [
      'Event occurs (e.g., invalid memory access, sleep time elapsed)',
      'Kernel saves the interrupted registers, SP and PC on the signal stack',
      'Kernel sets PC to the signal handler and SP to the signal stack',
      'Control returns to user mode and the handler runs',
      'After the handler the saved state is restored and the program continues',
    ], { ref: 'L2 p.18-20', lvl: 2, why: 'The upcall reuses the interrupt mechanism: the signal stack plays the role of the interrupt stack. The final restore step (sigreturn) is the note\'s inference; the slide only shows Before and During.' }),

    /* ---------- MATCH ---------- */
    X(2, 'process states', 'Match each item to what it holds on the kernel or user stack.', [
      ['Running (user mode)', 'Kernel stack is empty'],
      ['Ready to Run (preempted by a timer interrupt)', 'Only the User CPU State'],
      ['Waiting for I/O (blocked in a system call)', 'User CPU State + Syscall Handler + I/O Driver Top Half'],
      ['Interrupt stack', 'A part of the kernel stack (one per processor)'],
      ['Frame on top of the user stack of a process blocked in a syscall', 'Syscall'],
    ], { ref: 'L2 p.12', lvl: 2, why: 'A Running process has no kernel context. Preemption by a timer interrupt only needs the saved CPU state. A blocked syscall also keeps the nested kernel calls (handler, driver top half) because they must resume later. The interrupt stack is part of the kernel stack.' }),
    X(2, 'I/O hierarchy', 'Match each hardware component of the I/O subsystem to its role in the figure.', [
      ['System bus', 'Connects the CPU chip to the I/O bridge'],
      ['I/O bridge', 'Joins the system bus, the memory bus and the I/O bus'],
      ['Memory bus', 'Leads from the I/O bridge to main memory'],
      ['USB controller', 'Attaches mouse and keyboard'],
      ['Graphics adapter', 'Attaches the monitor'],
      ['Disk controller', 'Attaches the disk'],
    ], { ref: 'L2 p.6', lvl: 1, why: 'The CPU reaches every device through buses and a controller; the bridge is the junction.' }),
    X(2, 'system call path', 'Match each step of the read() call to the party that performs it.', [
      ['Push nbytes, &buffer and fd', 'User program (caller)'],
      ['Put the syscall code for read in a register', 'Library procedure read'],
      ['Switch to kernel mode and jump to the kernel', 'Trap instruction (hardware)'],
      ['Select the handler by syscall number', 'Kernel dispatch'],
      ['Increment SP after return', 'Caller, back in user mode'],
    ], { ref: 'L2 p.17', lvl: 2, lab: true, why: 'Only the trap crosses the user/kernel boundary; before it everything is user code, after dispatch everything is kernel code.' }),
    X(2, 'DMA', 'Match each component of the disk read to its job.', [
      ['CPU', 'Issues the command, receives the ack, handles the final interrupt'],
      ['SATA (disk) controller', 'Queues the command, sets up and performs the DMA, raises the interrupt'],
      ['Disk', 'Performs the read and buffers the data'],
      ['Main memory', 'Receives the block directly without CPU copying'],
    ], { ref: 'L2 p.8-10', lvl: 2, why: 'While controller and disk work, the CPU runs another task. That overlap is the point of DMA plus interrupts.' }),
    X(2, 'upcall', 'Match each signal-implementation element to the interrupt-handling element it mirrors.', [
      ['Signal handler', 'Interrupt vector / handler'],
      ['Signal stack', 'Interrupt stack'],
      ['Automatic save/restore of registers', 'CPU state saved and restored around the ISR'],
      ['Signal masking', 'Interrupt masking'],
    ], { ref: 'L2 p.19', lvl: 1, why: 'Upcalls reuse the interrupt design for user-level event delivery.' }),
    X(1, 'protection', 'Match each threat to the mechanism that stops it.', [
      ['App tries to shut down the machine', 'Privileged instruction'],
      ['App writes to a kernel address', 'Memory protection'],
      ['App loops forever', 'Timer interrupt'],
      ['App needs a privileged I/O operation', 'System call (trap)'],
    ], { ref: 'L1 p.18-25', lvl: 1, why: 'Each of the three protection requirements is covered by a separate mechanism; legal privileged work goes through the trap.' }),

    /* ---------- added in fix round 4 ---------- */
    X(1, 'hw/sw split', 'Match each task of the protection design to the party that performs it.', [
      ['Translate every load/store of a process', 'MMU (hardware)'],
      ['Raise periodic interrupts', 'Timer (hardware)'],
      ['Check privilege against the mode bit', 'CPU (hardware)'],
      ['Configure the translation table', 'Kernel software'],
      ['Inject SIGSEGV after finding a violation', 'Kernel page fault handler'],
      ['Choose the next process to run after an interrupt', 'Interrupt handler body (kernel software)'],
    ], { ref: 'L1 p.20-35 / L2 p.11', lvl: 2, why: 'Hardware does the fast checks and raises events (MMU, mode bit, timer). The kernel does configuration and decisions (table setup, SIGSEGV, scheduling).' }),
    X(1, 'privileged', 'Match each system call API to the platform it belongs to.', [
      ['Win32 API', 'Windows'],
      ['POSIX API', 'UNIX-like systems (Linux, Mac OS X)'],
      ['Java API', 'Java virtual machine'],
    ], { ref: 'L1 p.26', lvl: 1, why: 'A system call API is the programming interface to the OS services; each platform family has its own.' }),
    X(2, 'mode switch', 'Match each event to its kind.', [
      ['A disk finishes a read', 'Interrupt'],
      ['A program divides by zero', 'Exception'],
      ['A program calls write() and traps', 'System call'],
      ['The kernel notifies a process that its sleep time elapsed', 'Upcall (signal)'],
    ], { ref: 'L2 p.3,18', lvl: 1, why: 'External hardware events are interrupts; faults caused by the program\'s own instruction are exceptions; a deliberate trap is a system call; kernel to user notification is an upcall.' }),
    X(1, 'memory protection', 'Match each concept of address translation to its description.', [
      ['V1', 'The view of the address space of a process (virtual)'],
      ['V2', 'The view of the address space of the hardware (physical)'],
      ['Translating on every access', 'Done by the hardware (MMU)'],
      ['Setting up the translation table', 'Done by the kernel'],
    ], { ref: 'L1 p.29-31', lvl: 1, why: 'Virtual addresses separate V1 and V2. A process may freely use any address of V1; the hardware translates it fast, and only the kernel configures the table so protection holds.' }),

    /* ---------- fixed SIM ---------- */
    SIM(1, 'direct execution', 'Direct execution: the OS runs a program in the following 10 steps.', {
      table: { head: ['Step', 'Action', 'Actor'], rows: [['1', 'Create entry for process list', 'OS'], ['2', 'Allocate memory for program', 'OS'], ['3', 'Load program into memory', 'OS'], ['4', 'Set up stack with argc / argv', 'OS'], ['5', 'Clear registers', 'OS'], ['6', 'Execute call main()', 'OS'], ['7', 'Run main()', 'Program'], ['8', 'Execute return from main()', 'Program'], ['9', 'Free memory of process', 'OS'], ['10', 'Remove from process list', 'OS']] },
    }, [
      { label: 'How many of the 10 steps does the OS perform?', ans: 8, kind: 'num' },
      { label: 'Which steps does the program itself perform? (step numbers)', ans: '7,8|7-8|7 and 8|7 8', kind: 'text' },
      { label: 'Number of consecutive steps in which the OS has no say while the program runs', ans: 2, kind: 'num' },
    ], { ref: 'L1 p.11', lvl: 1, steps: 'Steps 7–8 (run main() and its return) are the program\'s; the other 8 steps are OS bookkeeping before and after. During 7–8 the OS only helps if the program calls it, so under direct execution the OS is "just a library" (no protection, no control).' }),
    SIM(2, 'process states', 'Process P runs in user mode. A timer interrupt preempts P and the scheduler runs Q. Q then calls read() and blocks, waiting for the disk.', {
      table: { head: ['Moment', 'Event'], rows: [['t1', 'P runs in user mode'], ['t2', 'Timer interrupt: P is preempted'], ['t3', 'Q runs in user mode'], ['t4', 'Q calls read() and blocks on the disk']] },
    }, [
      { label: 'Frames on P\'s kernel stack at t3 (User CPU State = 1 frame)', ans: 1, kind: 'num' },
      { label: 'Frames on Q\'s kernel stack at t4 (User CPU State, Syscall Handler, I/O Driver Top Half)', ans: 3, kind: 'num' },
      { label: 'Frame on top of Q\'s user stack at t4', ans: 'Syscall', kind: 'text' },
      { label: 'Frames on all kernel stacks at t4', ans: 4, kind: 'num' },
    ], { ref: 'L2 p.12', lvl: 2, steps: 'P: Running (kernel stack empty at t1) → preempted by a timer interrupt, so the CPU state is saved in P\'s kernel stack: 1 frame (Ready to Run).\nQ: runs with an empty kernel stack at t3; its read() syscall puts a Syscall frame on top of its user stack and pushes User CPU State, Syscall Handler, I/O Driver Top Half onto its kernel stack: 3 frames (Waiting for I/O).\nTotal at t4 = 1 + 3 = 4.' }),

    /* ---------- MCQ for reasoning gaps ---------- */
    M(2, 'interrupt masking', 'Which statements about interrupt masking are correct?', [
      'The handler runs with interrupts off so that a nested interrupt cannot corrupt the saved state',
      'If user code could execute CLI, it could block the timer interrupt and the kernel could no longer regain control',
      'On a multicore CPU, CLI disables interrupts on every core',
      'CLI is not privileged because it affects only the user\'s own process',
      'The kernel never disables interrupts itself',
    ], 'ab', 'a is the note\'s reasoning. b: the timer interrupt is the third protection mechanism, so an unprivileged CLI would break protection. c: CLI affects only the current CPU. d: the effect is on the CPU, not the process, so CLI must be privileged. e: the kernel does disable them, e.g., while choosing the next process.', { ref: 'L2 p.13', lvl: 2 }),
    M(2, 'returning from interrupt', 'Which statements about returning from an interrupt to user code on x86 are correct?', [
      'x86 does not allow a direct jump from kernel to user level',
      'iret restores the saved CPU state from the interrupt stack and returns to user code according to a CPU protocol',
      'iret reads the saved state from the user stack',
      'A user program can use iret to enter kernel mode',
      'The saved state is on the interrupt stack, which is part of the user stack',
    ], 'ab', 'The kernel must use iret. The state lives in kernel memory (interrupt stack = part of kernel stack), not in the user stack, and iret is the way back to user, not a way into the kernel (that is the trap/interrupt).', { ref: 'L2 p.14', lvl: 2 }),
    M(2, 'system call path', 'In the `read(fd, buffer, nbytes)` sequence, which event comes right after the library executes the trap instruction?', [
      'The mode changes to kernel (the trap takes effect)',
      'The library pushes nbytes',
      'The caller increments SP',
      'The syscall number is put in a register',
      'The kernel returns to the caller',
    ], 'a', 'Pushes and the register setup happen before the trap. After the trap, kernel mode begins, the kernel dispatches on the number, and runs the handler; SP is cleaned up at the very end.', { ref: 'L2 p.17', lvl: 1, lab: true }),
    M(1, 'memory protection', 'In the illegal access example `i = kernel_address; *i = 1;`, which statements are correct?', [
      'Assigning kernel_address to i is allowed; the fault happens at the store',
      'The MMU detects the illegal access and raises a page fault',
      'The kernel page fault handler sends SIGSEGV after it finds a violation',
      'The MMU itself kills the process',
      'The fault occurs when i is assigned',
    ], 'abc', 'Putting an address in a variable is an ordinary instruction; the MMU intercepts the access (3). The kernel handler decides and injects SIGSEGV. The MMU only raises the exception.', { ref: 'L1 p.32', lvl: 2 }),
  ]);
})((typeof window !== 'undefined' && window.QZ) || require('../assets/lib.js'));
