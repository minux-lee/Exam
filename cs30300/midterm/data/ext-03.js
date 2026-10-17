/* Lecture 3 extension: ORDER / MATCH / SIM items (fd tables, fork/exec/wait, shell loop, memory image) */
(function () {
  const { C, TF, M, N, O, X, SIM, G } = QZ.mk;
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[R(0, a.length - 1)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = R(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------------- fd table simulator (real simulation) ---------------- */
  const newTable = () => ({ 0: 'STDIN', 1: 'STDOUT', 2: 'STDERR' });
  const fdOpen = (t, name) => { let k = 0; while (k in t) k++; t[k] = name; return k; };
  const fmtT = t => '{' + Object.keys(t).map(Number).sort((a, b) => a - b).map(k => k + '→' + (t[k].length === 1 ? t[k] + '.txt' : t[k])).join(', ') + '}';
  const isStd = v => v === 'STDIN' || v === 'STDOUT' || v === 'STDERR';
  const STDALIAS = 'terminal|tty|console|screen|keyboard|stdin|stdout|stderr';
  const CLOSED = 'closed|none|not open|invalid|nothing';
  const destAns = v => v === undefined ? CLOSED : isStd(v) ? STDALIAS : v;
  const destName = v => v === undefined ? 'closed' : isStd(v) ? 'terminal' : v;

  /* 1. fd table trace across close/open/exec */
  QZ.gens.fdtrace = () => {
    for (;;) {
      const names = shuffle(['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt']);
      const n = R(3, 5), t = newTable(), ops = [], log = [];
      let ni = 0, last = -1, closes = 0, opens = 0;
      for (let i = 0; i < n; i++) {
        const keys = Object.keys(t).map(Number);
        if (i < n - 1 && keys.length && Math.random() < 0.5) {
          const k = pick(keys); delete t[k]; closes++;
          ops.push(`close(${k});`); log.push(`close(${k}) → ${fmtT(t)}`);
        } else {
          const nm = names[ni++], k = fdOpen(t, nm); last = k; opens++;
          ops.push(`fd = open("${nm}");   // returns ${'?'}`.replace('?', '…')); ops[ops.length - 1] = `fd = open("${nm}");`;
          log.push(`open("${nm}") returns ${k} (lowest free) → ${fmtT(t)}`);
        }
      }
      if (!closes || !opens || !/^fd =/.test(ops[ops.length - 1])) continue;
      ops.push('exec("wc", argv);');
      log.push(`exec keeps the fd table → ${fmtT(t)}`);
      const cnt = Object.keys(t).length;
      return {
        kind: 'sim',
        q: 'A shell child process has just been forked. Trace its fd table through the calls below. Every open() succeeds and always returns the lowest unused fd number.',
        state: { text: 'Initial fd table of the child: {0→STDIN, 1→STDOUT, 2→STDERR}', code: ops.join('\n') },
        fields: [
          { label: 'fd number returned by the LAST open()', ans: last },
          { label: 'After exec: what does fd 1 point to? (STDOUT / a file name / closed)', kind: 'text', ans: destAns(t[1]) },
          { label: 'After exec: what does fd 0 point to? (STDIN / a file name / closed)', kind: 'text', ans: destAns(t[0]) },
          { label: 'After exec: how many fds are open?', ans: cnt },
        ],
        steps: log.join('\n') + '\nRule: open() takes the smallest free number; exec replaces only the memory image, so the new program inherits this fd table.',
      };
    }
  };

  /* 2. shared file struct across fork vs separate fd tables */
  QZ.gens.forkshare = () => {
    for (;;) {
      const P = newTable(), offs = { a: 0 }; P[3] = 'a';
      const C = Object.assign({}, P);
      const tabs = { Parent: P, Child: C };
      const n = R(5, 6), evs = [], log = [];
      let closes = 0, writes = 0, nm = 0, lastOpen = null;
      const label = v => v === 'a' ? 'a.txt' : v;
      for (let i = 0; i < n; i++) {
        const who = pick(['Parent', 'Child']), t = tabs[who];
        if (i === n - 1) {
          const f = 'bcdefg'[nm++], k = fdOpen(t, f); offs[f] = 0; lastOpen = { who, k };
          evs.push([who, `open("${f}.txt")`]); log.push(`${who} open("${f}.txt") → fd ${k} in ${who}'s table only: ${fmtT(t)}`);
        } else if (t[3] === 'a' && Math.random() < 0.7) {
          const k = pick([10, 20, 30, 50]); offs.a += k; writes++;
          evs.push([who, `write(3, buf, ${k})`]); log.push(`${who} write(3, ${k}): shared file struct offset → ${offs.a}`);
        } else if (t[3] === 'a' && closes < 1) {
          delete t[3]; closes++;
          evs.push([who, 'close(3)']); log.push(`${who} close(3): only ${who}'s table loses fd 3, the file struct (offset ${offs.a}) stays → ${fmtT(t)}`);
        } else {
          const f = 'bcdefg'[nm++], k = fdOpen(t, f); offs[f] = 0;
          evs.push([who, `open("${f}.txt")`]); log.push(`${who} open("${f}.txt") → fd ${k}: ${fmtT(t)}`);
        }
      }
      if (closes !== 1 || writes < 2) continue;
      return {
        kind: 'sim',
        q: 'A parent opened "a.txt" (fd 3, offset 0) and then called fork(). From now on the events below happen in exactly this order. Each open() returns the lowest unused fd of the calling process.',
        state: { table: { head: ['#', 'Process', 'Call'], rows: evs.map((e, i) => [String(i + 1), e[0], e[1]]) } },
        fields: [
          { label: 'Offset of the a.txt file struct at the end (bytes)', ans: offs.a },
          { label: `fd number returned by the last open() (by the ${lastOpen.who})`, ans: lastOpen.k },
          { label: 'Can the Child still write(3, ...) to a.txt at the end? (yes/no)', kind: 'text', ans: C[3] === 'a' ? 'yes|y|true' : 'no|n|false' },
          { label: 'Can the Parent still write(3, ...) to a.txt at the end? (yes/no)', kind: 'text', ans: P[3] === 'a' ? 'yes|y|true' : 'no|n|false' },
        ],
        steps: 'After fork: the child has its OWN fd table (copy), but fd 3 in both tables points to the SAME file struct (one shared offset).\n' + log.join('\n') + `\nFinal tables: Parent ${fmtT(P)}, Child ${fmtT(C)}.`,
      };
    }
  };

  /* 3. shell loop (p.18): fork / exec / wait, failed exec, built-in cd */
  QZ.gens.shellrun = () => {
    const good = ['ls', 'pwd', 'date', 'echo'], bad = ['lss', 'foo', 'grpe', 'mkdirr'], cds = ['cd /tmp', 'cd /usr', 'cd /var'];
    for (;;) {
      const n = R(4, 6), cmds = [];
      for (let i = 0; i < n; i++) { const r = Math.random(); cmds.push(r < 0.45 ? pick(good) : r < 0.75 ? pick(bad) : pick(cds)); }
      let cwd = '/home', forks = 0, execOK = 0, nf = 0; const log = [];
      cmds.forEach(c => {
        if (c.startsWith('cd ')) { cwd = c.slice(3); log.push(`"${c}": built-in → no fork, the shell itself changes directory → cwd=${cwd}`); }
        else if (good.includes(c)) { forks++; execOK++; log.push(`"${c}": fork (child), execv succeeds and never returns, parent waitpid until it ends`); }
        else { forks++; nf++; log.push(`"${c}": fork (child), execv returns −1 → child prints "${c}: command not found" and exit(0); parent waitpid returns`); }
      });
      if (!nf || cmds.every(c => c.startsWith('cd')) || cmds.filter(c => c.startsWith('cd')).length === 0) continue;
      return {
        kind: 'sim',
        q: 'The simple shell below (cwd starts at /home) reads the following commands, one per prompt. A command is "valid" if its program exists (ls, pwd, date, echo); everything else makes execv fail.',
        state: {
          code: 'while (getcmd(cmdline, MAXLINE) >= 0) {\n  parsecmd(cmdline, argv);\n  if (!builtin_command(argv)) {      // cd is built-in\n    if ((pid = fork()) == 0) {\n      if (execv(argv[0], argv) < 0) {\n        printf("%s: command not found\\n", argv[0]);\n        exit(0);\n      }\n    }\n    waitpid(pid, &status, 0);\n  }\n}',
          text: 'Commands typed, in order: ' + cmds.map(c => '`' + c + '`').join('  '),
        },
        fields: [
          { label: 'Number of fork() calls', ans: forks },
          { label: 'Number of successful execv calls', ans: execOK },
          { label: 'Number of "command not found" lines printed', ans: nf },
          { label: 'Shell cwd after the last command', kind: 'text', ans: cwd },
        ],
        steps: log.join('\n') + `\nTotals: forks=${forks}, successful exec=${execOK}, not found=${nf}, cwd=${cwd}. A failed exec returns to the child (the old code still exists); a successful one never returns.`,
      };
    }
  };

  /* 4. multi-fork output: counting + valid interleavings */
  function buildEvents(ops) {
    const events = []; let nproc = 1;
    (function run(startIdx, pred, pname) {
      let last = pred;
      for (let i = startIdx; i < ops.length; i++) {
        if (ops[i] === 'f') { nproc++; run(i + 1, last, 'P' + nproc); }
        else { events.push({ label: ops[i], pred: last, proc: pname }); last = events.length - 1; }
      }
    })(0, null, 'P1');
    return events;
  }
  function validSeq(events, seq) {
    const n = events.length, seen = new Set();
    if (seq.length !== n) return false;
    const go = (mask, idx) => {
      if (idx === n) return true;
      if (seen.has(mask)) return false;
      seen.add(mask);
      for (let e = 0; e < n; e++) {
        if (mask & (1 << e)) continue;
        if (events[e].label !== seq[idx]) continue;
        if (events[e].pred !== null && !(mask & (1 << events[e].pred))) continue;
        if (go(mask | (1 << e), idx + 1)) return true;
      }
      return false;
    };
    return go(0, 0);
  }
  const randomTopo = events => {
    const n = events.length, done = new Set(), out = [];
    while (out.length < n) {
      const cand = events.map((e, i) => i).filter(i => !done.has(i) && (events[i].pred === null || done.has(events[i].pred)));
      const i = pick(cand); done.add(i); out.push(events[i].label);
    }
    return out.join('');
  };
  QZ.gens.forkcount = () => {
    for (;;) {
      const np = R(3, 4), letters = shuffle(['A', 'B', 'C', 'D', 'E']).slice(0, np);
      const ops = letters.slice(); // positions for 2 forks
      const p1 = R(0, np - 1), p2 = R(0, np - 1);
      const seq = []; letters.forEach((l, i) => { if (i === p1) seq.push('f'); if (i === p2) seq.push('f'); seq.push(l); });
      if (seq.filter(x => x === 'f').length !== 2) continue;
      const events = buildEvents(seq), nproc = 3 + 1 - 0; // placeholder replaced below
      const procs = 1 + (function cnt(s) { let c = 0; for (let i = 0; i < s.length; i++) if (s[i] === 'f') c += 1 + cnt(s.slice(i + 1)); return c; })(seq);
      if (events.length > 12) continue;
      const valid = randomTopo(events);
      const trySeqs = [];
      // candidate 1: always valid or invalid (random), candidate 2: the other kind
      const wantFirstValid = Math.random() < 0.5;
      let inv = null;
      for (let k = 0; k < 80 && !inv; k++) { const s = shuffle(valid.split('')).join(''); if (!validSeq(events, s.split(''))) inv = s; }
      if (!inv) continue;
      let v2 = randomTopo(events); if (v2 === valid && events.length > 4) v2 = randomTopo(events);
      const c1 = wantFirstValid ? valid : inv, c2 = wantFirstValid ? inv : v2;
      const chk = s => validSeq(events, s.split(''));
      const byProc = {}; events.forEach(e => { (byProc[e.proc] = byProc[e.proc] || []).push(e.label); });
      const code = seq.map(x => x === 'f' ? 'fork();' : `printf("${x}");`).join('\n');
      return {
        kind: 'sim',
        q: 'Assume every printf is flushed immediately and fork() always succeeds. The following code is run by one process.',
        state: { code, text: `Which of these outputs can occur?  (1) ${c1}   (2) ${c2}` },
        fields: [
          { label: 'Total number of processes (including the original)', ans: procs },
          { label: 'Total number of letters printed', ans: events.length },
          { label: 'Can output (1) occur? (yes/no)', kind: 'text', ans: chk(c1) ? 'yes|y|possible' : 'no|n|impossible' },
          { label: 'Can output (2) occur? (yes/no)', kind: 'text', ans: chk(c2) ? 'yes|y|possible' : 'no|n|impossible' },
        ],
        steps: `Each fork() doubles the processes that continue from that point, so ${procs} processes exist at the end.\nPrints per process (program order; a child only prints what comes AFTER its fork point): ` + Object.keys(byProc).map(p => `${p}: ${byProc[p].join('')}`).join(' | ') +
          `\nA valid output is any interleaving that keeps each process's own order and puts a child's prints after the prints its parent made before the fork. (1) ${c1} → ${chk(c1) ? 'valid' : 'violates an order'}; (2) ${c2} → ${chk(c2) ? 'valid' : 'violates an order'}.`,
      };
    }
  };

  /* 5. p.29 full-program trace: redirection with close(k)+open, including the buggy order */
  QZ.gens.redirsim = () => {
    const k = pick([0, 1, 2]), bugOrder = Math.random() < 0.35;
    const file = k === 0 ? 'in.txt' : 'out.txt', flags = k === 0 ? 'O_RDONLY' : 'O_CREAT|O_WRONLY|O_TRUNC';
    const parent = newTable(), t = newTable(), log = [];
    let ret;
    if (!bugOrder) { delete t[k]; log.push(`close(${k}) → ${fmtT(t)}`); ret = fdOpen(t, file); log.push(`open("${file}") returns ${ret} → ${fmtT(t)}`); }
    else { ret = fdOpen(t, file); log.push(`open("${file}") returns ${ret} (0,1,2 are all taken) → ${fmtT(t)}`); delete t[k]; log.push(`close(${k}) → ${fmtT(t)}  (too late: nothing was redirected, fd ${k} is just closed)`); }
    const body = bugOrder ? `open("${file}", ${flags}, S_IRWXU);\n    close(${k});` : `close(${k});\n    open("${file}", ${flags}, S_IRWXU);`;
    return {
      kind: 'sim',
      q: 'Trace this program (all calls succeed; "wc" exists). Answer for the process image running wc right after execvp, and for the parent.',
      state: { code: `int rc = fork();\nif (rc == 0) {          // child\n    ${body}\n    char *myargs[3] = {"wc", "p4.c", NULL};\n    execvp(myargs[0], myargs);\n} else {                // parent\n    wait(NULL);\n}` },
      fields: [
        { label: 'Value returned by open() in the child', ans: ret },
        { label: 'Where does wc\'s fd 0 point? (terminal / a file name / closed)', kind: 'text', ans: destAns(t[0]) },
        { label: 'Where does wc\'s fd 1 (standard output) point?', kind: 'text', ans: destAns(t[1]) },
        { label: 'Where does wc\'s fd 2 (standard error) point?', kind: 'text', ans: destAns(t[2]) },
        { label: 'Where does the PARENT\'s fd 1 point after wait() returns?', kind: 'text', ans: destAns(parent[1]) },
      ],
      steps: `Child fd table before the two calls: {0→STDIN, 1→STDOUT, 2→STDERR}\n` + log.join('\n') + `\nexecvp replaces the memory image but keeps the table: wc sees fd0=${destName(t[0])}, fd1=${destName(t[1])}, fd2=${destName(t[2])}.\nThe parent's fd table is a separate copy and was never modified: fd 1 still points to the terminal.`,
    };
  };
  QZ.GEN_LABEL.fdtrace = 'fd table trace (close/open/exec)';
  QZ.GEN_LABEL.forkshare = 'shared file struct after fork';
  QZ.GEN_LABEL.shellrun = 'shell fork/exec/wait loop';
  QZ.GEN_LABEL.forkcount = 'multi-fork output & interleavings';
  QZ.GEN_LABEL.redirsim = 'IO redirection program trace';

  QZ.add([
    G(3, 'redirect', 'fdtrace', { ref: 'L3 p.26-28', lab: true, lvl: 2 }),
    G(3, 'redirect', 'forkshare', { ref: 'L3 p.20,26', lab: true, lvl: 3 }),
    G(3, 'shell', 'shellrun', { ref: 'L3 p.18,21-22', lvl: 2 }),
    G(3, 'fork', 'forkcount', { ref: 'L3 p.19-20', lvl: 2 }),
    G(3, 'redirect', 'redirsim', { ref: 'L3 p.27-29', lab: true, lvl: 3 }),

    /* ---------- ORDER ---------- */
    O(3, 'redirect', 'The shell runs `wc w3.c > newfile.txt`. Reconstruct the sequence of calls (parent and child together).',
      ['Shell calls fork()', 'Child calls close(1)', 'Child calls open("newfile.txt"), which returns fd 1', 'Child calls exec("wc", ...)'],
      { mode: 'recall', distract: ['Child calls exec("wc", ...) before touching its fd table', 'Parent calls close(1) before fork()', 'Child calls close(0)'],
        why: 'The fd table must be changed in the child between fork and exec. open() returns the lowest free fd, so close(1) first makes open() return 1. exec keeps the fd table, so wc writes to the file. Changing it in the parent would redirect the shell itself. The parent\'s wait() can run anywhere after fork() and returns only after the child exits.', ref: 'L3 p.27', lab: true, lvl: 2 }),
    O(3, 'shell', 'Order the steps of one iteration of the simple shell loop for an external command such as `ls`.',
      ['getcmd(): read the command line', 'parsecmd(): split into argv', 'builtin_command(): check whether the shell must handle it itself', 'fork(): create the child', 'Child: execv(argv[0], argv) replaces the process image', 'Parent: waitpid() returns after the child has exited'],
      { mode: 'order', why: 'Read, parse, then decide built-in vs external. Only external commands fork. The child replaces itself with the program while the parent waits, and the next prompt appears only after waitpid returns.', ref: 'L3 p.18', lvl: 1 }),
    O(3, 'shell', 'The user types a non-existent command `foo`. Which steps happen, in order?',
      ['Shell reads and parses "foo"', 'builtin_command() says it is not built-in', 'Shell calls fork()', 'Child calls execv("foo", ...), which returns −1', 'Child prints "foo: command not found"', 'Child calls exit(0)', 'Parent\'s waitpid() returns and the shell prompts again'],
      { mode: 'recall', distract: ['Child keeps running the parent\'s loop and prompts for the next command', 'Parent calls execv("foo", ...) itself'],
        why: 'A failed exec RETURNS (the old code still exists), so the child must handle the error and exit; otherwise it would continue as a second shell. The parent was blocked in waitpid and resumes when the child exits.', ref: 'L3 p.18,22', lvl: 2 }),
    O(3, 'fork', 'List the actions of fork() in the order given on the lecture slide.',
      ['Create and initialize a new PCB', 'Create and initialize a new address space', 'Initialize the address space with a copy of the parent\'s contents', 'Make the kernel resources (e.g., open files) point to the parent\'s resources', 'Place the new PCB on the ready queue', 'Return the child\'s PID to the parent and 0 to the child'],
      { mode: 'recall', distract: ['Load the program "prog" into the address space', 'Remove the parent\'s PCB from the ready queue'],
        why: 'fork builds a new process (PCB, address space, copy), shares kernel resources such as open files, and only then makes it runnable. The two different return values tell the two copies apart.', ref: 'L3 p.20', lab: true, lvl: 2 }),
    O(3, 'exec', 'List the actions of exec(prog, args).',
      ['Load the program "prog" into the process\'s address space', 'Initialize the hardware context and the args for the new program', 'Place the PCB on the ready queue', 'Transfer control to the new program\'s entry point (the old code never resumes)'],
      { mode: 'recall', distract: ['Create a new PCB with a new PID', 'Copy the caller\'s address space'],
        why: 'exec keeps the same process (PCB, PID) and overwrites its memory image. No new process is created, and the old code is gone, so exec only returns on failure.', ref: 'L3 p.21', lab: true, lvl: 2 }),
    O(3, 'state', 'A new process computes, then reads a file from disk, then computes again. Order its states.',
      ['Ready (just created, on the ready queue)', 'Running (the scheduler picks it)', 'Blocked (it issued the disk read)', 'Ready (the disk read completed)', 'Running (the scheduler picks it again)'],
      { mode: 'order', why: 'A blocked process never goes directly back to Running; I/O completion makes it Ready and only the scheduler (policy) gives it the CPU.', ref: 'L3 p.10', lvl: 1 }),
    O(3, 'redirect', 'Why can `cat < input.txt` work without cat knowing about files? Order the reasoning chain.',
      ['fork() gives the child a copy of the shell\'s fd table', 'The child closes fd 0 (STDIN)', 'The child open()s input.txt, which gets the lowest free fd, 0', 'The child exec()s cat: the memory image changes, the fd table stays', 'cat read()s from fd 0 as usual and actually reads input.txt'],
      { mode: 'order', why: 'This works only because fork and exec are separate calls: the child can modify its fd table in between, and uniformity (stdin is just fd 0) lets cat stay unaware.', ref: 'L3 p.25,28', lab: true, lvl: 2 }),

    /* ---------- MATCH ---------- */
    X(3, 'process', 'Match each region of the process / Linux layout to its property.',
      [['Code and initialized data', 'Filled from the on-disk program by exec'], ['Heap', 'Created at run time via malloc and grows upward'], ['User stack', 'Created at run time and grows downward'], ['Kernel code and data', 'Mapped identically in every process'], ['Page tables, task/mm structs, kernel stack', 'Kernel structures that differ for each process']],
      { why: 'Code/data exist in the program file and are loaded by exec; heap and stack do not exist on disk and are created at run time. The kernel half has a shared part (code/data) and a per-process part (bookkeeping for that process).', ref: 'L3 p.3-5', lvl: 1 }),
    X(3, 'api', 'Match each call or situation to its result.',
      [['fork() in the parent', 'Returns the child\'s PID'], ['fork() in the child', 'Returns 0'], ['Successful exec()', 'Never returns; same PID, new memory image'], ['exec() of a missing file', 'Returns −1 and the old code continues'], ['wait() when the child already exited', 'Returns immediately'], ['open() right after close(0)', 'Returns fd 0']],
      { why: 'fork returns twice (different values). exec returns only on failure because success destroys the caller\'s code. wait does not block if a finished child is waiting to be collected. open picks the smallest free fd.', ref: 'L3 p.20-22,26', lvl: 2 }),
    X(3, 'redirect', 'Starting from the table {0→STDIN, 1→STDOUT, 2→STDERR}, match each call sequence to its effect.',
      [['close(0); open("in.txt");', 'Standard input now comes from the file'], ['close(1); open("out.txt");', 'Standard output now goes to the file'], ['close(2); open("err.txt");', 'Error messages now go to the file'], ['open("x.txt"); (nothing closed)', 'Returns 3, no redirection'], ['fork(); child: close(1); open("y.txt");', 'Only the child\'s fd table changes; the parent still writes to the terminal']],
      { why: 'The lowest-free-fd rule turns close(k)+open into a redirect of fd k. Without a close, open gets 3. After fork the tables are separate, so the parent is unaffected.', ref: 'L3 p.26-28', lab: true, lvl: 2 }),
    X(3, 'cpu', 'Match each term to its role in CPU virtualization.',
      [['Scheduler', 'Policy: decides who runs next'], ['Context switch', 'Mechanism: swaps CPU state between processes'], ['PCB', 'Holds the saved state of one process'], ['TLB flush', 'Needed because cached translations belong to the old address space'], ['Ready queue', 'Processes that are runnable but not chosen']],
      { why: 'Policy (what/when) is separated from mechanism (how). The switch is pure overhead; the saved registers live in the PCB, and the TLB must be flushed because translations belong to the old address space.', ref: 'L3 p.9-12', lvl: 2 }),

    X(3, 'state', 'Match each process state transition to its cause.',
      [['Ready → Running', 'The scheduler picks the process'], ['Running → Ready', 'Its time slice is exhausted'], ['Running → Blocked', 'It starts an I/O request and must wait'], ['Blocked → Ready', 'The I/O it waited for completes']],
      { why: 'Only the scheduler hands out the CPU, so I/O completion leads to Ready, never directly to Running. A time slice running out is a policy decision and keeps the process runnable.', ref: 'L3 p.10', lvl: 1 }),
    X(3, 'io', 'Match each UNIX I/O principle to its description.',
      [['Uniformity', 'Files, devices and pipes use the same open/close/read/write calls'], ['Open before use', 'A file must be opened first and open returns a file descriptor'], ['Byte-oriented', 'Data is a stream of bytes, not disk blocks'], ['Kernel-buffered', 'read/write go through buffers kept by the kernel'], ['Explicit close', 'The descriptor is released only when the program calls close']],
      { why: 'These five properties define the UNIX (POSIX) I/O model; uniformity is what lets a program such as cat read a file, a terminal or a pipe without change.', ref: 'L3 p.24', lvl: 1 }),

    /* ---------- MCQ / TF for remaining gaps ---------- */
    M(3, 'redirect', 'Why does UNIX provide fork() and exec() as two separate calls instead of one forkandexec()? Select all correct reasons.',
      ['The child can change its fd table between the two calls, which makes redirection possible', 'It makes pipes possible, because the shell can set up the child\'s descriptors first', 'The shell can change the child\'s settings without changing its own state', 'exec() cannot be implemented without a preceding fork() in the kernel', 'It makes the child run faster than the parent'],
      'abc', 'Between fork and exec the child still runs the shell\'s code and can safely rearrange its descriptors; exec then inherits them. Changes made in the child do not touch the shell\'s own state. There is no kernel dependency of exec on fork, and speed is not the reason.', { ref: 'L3 p.25', lvl: 2 }),
    M(3, 'cpu', 'Which statements about context switching are correct? Select all.',
      ['The scheduler decides which process runs next; the context switch performs the change', 'Its cost depends on hardware support (e.g., how registers and the TLB can be handled)', 'Switching to another process may require flushing or reloading the TLB, because the address space changes', 'It is useful work that speeds up each process', 'Switching directly from A to B bypasses the OS scheduler'],
      'abc', 'Policy vs mechanism: scheduler vs switch. The switch (saving/restoring registers, TLB, tables) is overhead and always goes through the OS.', { ref: 'L3 p.9,12', lvl: 2 }),
    M(3, 'fork', 'A parent opens a file (fd 3, offset 0) and calls fork(). The parent then writes 10 bytes and the child writes 20 bytes via fd 3. Which statements are correct?',
      ['The file struct and its offset are shared, so the offset ends at 30', 'The two processes have separate fd tables', 'If the child calls close(3), the parent\'s fd 3 is closed too', 'If the child calls close(3), the parent can still write via fd 3', 'Each process has its own offset, so both write at position 0'],
      'abd', 'fd tables are per process (copied at fork) but their entries point to the same file struct, so the offset is shared. Closing in one table does not affect the other.', { ref: 'L3 p.20,26', lab: true, lvl: 3 }),
  ]);
})();
