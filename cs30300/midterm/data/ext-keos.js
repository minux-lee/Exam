/* KeOS quiz: write / complete code (self-graded against a rubric) + short trace items.
   Answers are pseudocode-level on purpose: no lab solution code is published here. */
(function () {
  const { S, O, SIM, TF, M } = QZ.mk;
  const K = (lec, topic, q, model, keys, o = {}) => S(lec, topic, q, model, keys, Object.assign({ kcode: true, lab: true }, o));
  const fence = s => '```\n' + s + '\n```';

  QZ.add([
    /* ---------------- Project 1: System call / file descriptors ---------------- */
    K(2, 'abi', 'KeOS project 1. Complete `SyscallAbi::from_registers(regs: &mut Registers) -> SyscallAbi` and `set_return_value(self, r: Result<usize, KernelError>)`. Which register holds the syscall number, which hold the arguments, and what is written back on success and on error?',
      'Pseudocode:\n' + fence(`sysno = rax\narg1..arg6 = rdi, rsi, rdx, r10, r8, r9   # r10, not rcx\nset_return_value: rax = value if Ok, rax = error code if Err`),
      ['sysno from rax', 'arguments from rdi, rsi, rdx, r10, r8, r9 in order (4th is r10)', 'result is written to rax', 'Err is converted to an error number written to rax (same register)'],
      { ref: 'L2 · KeOS-01', lvl: 1 }),

    K(2, 'fd', 'KeOS project 1. Implement `FileStruct::install_file(&mut self, file: File) -> Result<FileDescriptor, KernelError>`. Spec: the table holds at most 1024 open files; a new file gets the smallest unused descriptor number. Write the pseudocode (or Rust).',
      'Pseudocode:\n' + fence(`if table.len() >= 1024: return Err(TooManyOpenFile)\nfd = smallest integer not already a key in table\ntable.insert(fd, file)\nreturn Ok(fd)`),
      ['Checks the 1024-file limit first and returns TooManyOpenFile', 'Chooses the smallest unused fd number (0,1,2 are already stdio)', 'Inserts the file into the per-process table', 'Returns the new fd'],
      { ref: 'L3 · KeOS-01', lvl: 1 }),

    K(2, 'fd', 'KeOS project 1. Implement the `read` syscall handler `FileStruct::read(&mut self, abi) -> Result<usize, KernelError>` for a **regular file** (fd = arg1, user buffer = arg2, count = arg3). List every check and every state update, in order.',
      'Pseudocode:\n' + fence(`file = table.get(fd) or Err(BadFileDescriptor)\nif file is write-only: Err(InvalidArgument)\nmatch file.kind:\n  RegularFile{f, pos}:\n     tmp = kernel buffer of size count\n     n = f.read(pos, tmp)\n     copy tmp[..n] into the user buffer   # validated user pointer API\n     pos += n\n     return n\n  Directory: Err(IsDirectory)`),
      ['Looks up fd and returns BadFileDescriptor if absent', 'Rejects a write-only descriptor', 'Reads into a kernel buffer, then copies to the user buffer through the checked user-pointer API (never a raw dereference)', 'Advances the file position by the number of bytes actually read', 'Returns the byte count; directory gives IsDirectory'],
      { ref: 'L2 · KeOS-01', lvl: 2 }),

    K(2, 'fd', 'KeOS project 1. Implement `FileStruct::seek` (fd = arg1, offset = arg2 as signed, whence = arg3 with 0 = SET, 1 = CUR, 2 = END). What are the error cases and what is returned?',
      'Pseudocode:\n' + fence(`file = lookup fd (else BadFileDescriptor); must be a RegularFile (else InvalidArgument)\nbase = 0 | pos | file.size()   for whence 0 | 1 | 2   (other -> InvalidArgument)\nnew = base + offset\nif new < 0: Err(InvalidArgument)\npos = new\nreturn new`),
      ['Only regular files are seekable', 'Base chosen from whence: 0, current position, or file size', 'Negative resulting position is an error', 'Updates the stored position and returns the new position'],
      { ref: 'L2 · KeOS-01', lvl: 2 }),

    K(2, 'pipe', 'KeOS project 1. Implement `pipe(int pipefd[2])`: create a channel, install both ends, and report the two descriptors to user space. What must happen if copying the result to the user array fails, and why?',
      'Pseudocode:\n' + fence(`(tx, rx) = new channel\nrfd = install(Read-only,  Rx(rx))      # pipefd[0]\nwfd = install(Write-only, Tx(tx))      # pipefd[1]\nput [rfd, wfd] into the user array (checked pointer)\n  on failure: remove rfd and wfd from the table, return the error\nreturn 0`),
      ['Creates one channel and installs a read end and a write end as two fds', 'pipefd[0] is the read end, pipefd[1] the write end', 'Writes both fd numbers to user memory with a checked pointer', 'On a failed copy it removes both installed fds (otherwise they leak)', 'Returns 0 on success'],
      { ref: 'L3 · KeOS-01', lvl: 2 }),

    K(2, 'newsyscall', 'New syscall (not in the lab): `dup(oldfd)` duplicates an open descriptor and returns the **smallest unused** fd that refers to the same file. Using the project-1 structures (per-process table `fd -> File`, `install_file`), how would you implement it? State the checks, how to treat the file position, and what to return. (Hint: `File` may not be `Clone`; think about what dup semantically shares.)',
      'Pseudocode:\n' + fence(`old = table.get(oldfd) or Err(BadFileDescriptor)\nnew_file = another handle to the SAME open file object\n           (shared offset and mode; for Rx/Tx, a clone of the channel end)\nnewfd = install_file(new_file)     # applies the 1024 limit and smallest-free-fd rule\nreturn newfd`),
      ['Validates oldfd and returns BadFileDescriptor otherwise', 'Reuses install_file so the 1024 limit and smallest-free-fd rule apply', 'The new fd refers to the same open file (shares offset in POSIX semantics), not an independent reopen', 'Returns the new fd number; errors from install_file propagate'],
      { ref: 'L3 · KeOS-01 (generalization)', lvl: 3, hard: true }),

    K(2, 'newsyscall', 'New syscall (not in the lab): `fsize(fd)` returns the size in bytes of the regular file behind `fd`. List, in order, every step the kernel must do from the `syscall` instruction to the user seeing the result.',
      'Pseudocode:\n' + fence(`user: rax = SYS_FSIZE, rdi = fd; syscall            # mode switch, registers saved\nkernel: abi = from_registers(regs)\n        dispatch on abi.sysno -> fsize handler\n        file = table.get(abi.arg1) or Err(BadFileDescriptor)\n        if not RegularFile: Err(InvalidArgument)\n        Ok(file.size())\n        set_return_value(result)                  # rax = size or error\nreturn to user (iret/sysret); user reads rax`),
      ['Syscall number in rax, argument in rdi, trap/mode switch to kernel', 'Decode registers into the ABI struct and dispatch on the number', 'Lookup fd, reject missing fd and non-regular files with the right errors', 'Result (or error) written to rax and control returned to user mode', 'No user pointer is involved, so no user-memory validation is needed here'],
      { ref: 'L2 · KeOS-01 (generalization)', lvl: 2 }),

    /* ---------------- Project 2: Memory management ---------------- */
    SIM(7, 'ptindex', 'KeOS project 2, `PtIndices::from_va`. Fill in the shift amounts for the four 9-bit page-table indices of an x86-64 virtual address.',
      { code: `pml4ei = (va >> A) & 0x1FF\npdptei = (va >> B) & 0x1FF\npdei   = (va >> C) & 0x1FF\nptei   = (va >> D) & 0x1FF` },
      [{ label: 'A', ans: 39 }, { label: 'B', ans: 30 }, { label: 'C', ans: 21 }, { label: 'D', ans: 12 }],
      { steps: '12 offset bits are the lowest.\nEach level takes 9 bits: PT = 12..20, PD = 21..29, PDPT = 30..38, PML4 = 39..47.\nThe check `va & 0xFFF == 0` (page aligned) is done before this.', lab: true, ref: 'L7 · KeOS-02', lvl: 1 }),

    K(7, 'pagetable', 'KeOS project 2, `PageTable::map(va, pa, perm)`. Write the pseudocode: what is checked, how `Permission` maps to PTE flags, how missing intermediate tables are handled, and when the call fails.',
      'Pseudocode:\n' + fence(`idx = indices(va)             # Unaligned if va is not page aligned\nif perm lacks READ: Err(InvalidPermission)\nflags = P | (RW if WRITE) | (US if USER) | (XD if NOT EXECUTABLE)\nfor each of PML4, PDPT, PD entries on the path:\n    if entry empty: allocate a zeroed page as the next-level table,\n                    set pa, flags = P|RW|US   # permissive; leaf decides\nleaf = PT[idx.pt]\nif leaf.P: Err(Duplicated)\nleaf.pa = pa; leaf.flags = flags`),
      ['Alignment and READ permission validated first', 'Translates Permission to PTE bits, including XD set when the page is NOT executable', 'Allocates a zeroed page for each missing intermediate table on the walk', 'Intermediate entries are permissive; the leaf PTE carries the real permission', 'Returns Duplicated if the leaf is already present'],
      { ref: 'L7 · KeOS-02', lvl: 2 }),

    K(7, 'pagetable', 'KeOS project 2, `PageTable::unmap(va)` and `PageTable::clear()`. What does each do, in what order does `clear` free things, and why must `unmap` care about the TLB and `clear` skip some PML4 entries?',
      'Pseudocode:\n' + fence(`unmap(va): pte = walk_mut(va) or NotExist\n           pa = pte.clear()\n           invalidate TLB entry for va\n           return the Page for pa\nclear():   for pml4 index < KBASE (user half only):\n             for each present PDPT -> PD -> PT:\n                free leaf pages first, then PT page, PD page, PDPT page\n             clear the PML4 entry`),
      ['unmap clears the PTE and returns ownership of the physical page', 'TLB entry must be invalidated because the cached translation would be stale', 'clear frees bottom-up: data pages, then PT, PD, PDPT pages', 'Only user-half PML4 entries are cleared; kernel mappings are shared and must stay', 'Not freeing the table pages would leak memory'],
      { ref: 'L7 · KeOS-02', lvl: 2 }),

    K(4, 'mmap', 'KeOS project 2, `EagerPager::mmap(addr, size, prot, file, offset)`. Write the pseudocode, including argument validation, how the file-backed and anonymous cases differ, and what must happen if allocation fails halfway.',
      'Pseudocode:\n' + fence(`validate: addr != 0, addr and offset page aligned, size > 0,\n          range inside user space, no overlap with an existing mapping,\n          file offset < file size (if file-backed)\nsize = round up to page\nfor each page in [addr, addr+size):\n    page = file-backed ? read file block (zero-fill past EOF) : zeroed page\n    page_table.map(va, page, prot)\n    on failure: unmap every page mapped so far, return Err\nrecord (addr -> size, perm) in the mapping table\nreturn addr`),
      ['Validates alignment, range in user space, and overlap with existing mappings', 'Rounds size up to a whole number of pages', 'Eager: allocates and maps every page immediately; file-backed pages are filled from the file with the tail zeroed, anonymous pages are zero pages', 'Rolls back already-mapped pages on a mid-way failure', 'Records the mapping so munmap and access_ok can find it'],
      { ref: 'L4 · KeOS-02', lvl: 3, hard: true }),

    K(4, 'mmap', 'KeOS project 2, `access_ok(range, is_write)` and `munmap(addr)`. Explain how each uses the pager\'s mapping table and what exactly is checked. Why must `access_ok` check every page of the range, not just the start and end?',
      'Pseudocode:\n' + fence(`access_ok(range, is_write):\n   for each page overlapping [start, end):\n       m = mapping containing that page, else return false\n       if not m.perm.READ or (is_write and not m.perm.WRITE): return false\n   return true\nmunmap(addr):\n   m = mappings.remove(addr) or Err(InvalidArgument)   # must be a start address\n   unmap every page of m`),
      ['access_ok walks all pages overlapping the range', 'A page with no mapping, or insufficient permission (READ, WRITE if writing), fails it', 'A hole in the middle of the range would be missed by checking only the ends', 'munmap requires the start address of an existing mapping and unmaps all its pages', 'access_ok is what validates user pointers passed to syscalls'],
      { ref: 'L4 · KeOS-02', lvl: 2 }),

    K(5, 'elf', 'KeOS project 2, ELF loader. For each `PT_LOAD` program header (`p_vaddr`, `p_offset`, `p_filesz`, `p_memsz`, `p_flags`) describe how you load it. Where does `.bss` come from, and how is `p_flags` turned into page permissions?',
      'Pseudocode:\n' + fence(`perm = USER | (READ if PF_R) | (WRITE if PF_W) | (EXEC if PF_X)\nif filesz > memsz: error\nbase = page_down(vaddr)\nmmap anonymous (zeroed) region [base, vaddr - base + memsz) with perm\ncopy filesz bytes from file at p_offset to vaddr, page by page\n(the remaining memsz - filesz bytes stay zero = .bss)`),
      ['Permission is built from the ELF flags R/W/X plus USER', 'filesz > memsz is rejected', 'The segment is mapped from the page-aligned base including the leading offset within the page', 'Only filesz bytes are copied from the file; the rest of memsz stays zero, which is .bss', 'Copy proceeds page by page through the kernel view of user pages'],
      { ref: 'L4 · KeOS-02', lvl: 3, hard: true }),

    K(4, 'argv', 'KeOS project 2, building the initial user stack for `main(argc, argv)`. Describe the sequence of pushes, the final layout from high to low addresses, and which registers get which values.',
      'Pseudocode:\n' + fence(`push each argument string (stack grows down); remember its address\nalign sp to 8 bytes\npush NULL                         # argv[argc]\npush the string addresses in reverse order   # so argv[0] is lowest\nargv = sp                         # points at argv[0]\npush a fake return address / NULL\nrsp = sp; rdi = argc; rsi = argv`),
      ['Strings pushed first (highest addresses)', 'sp aligned to 8 before pointers are pushed', 'NULL terminator pushed so argv[argc] == NULL', 'Pointers pushed in reverse order so argv[0] ends up at the lowest address', 'rdi = argc, rsi = argv, rsp set to the final stack pointer'],
      { ref: 'L4 · KeOS-02', lvl: 3, hard: true }),

    /* ---------------- ordering ---------------- */
    O(2, 'syscallflow', 'KeOS project 1. Put the steps of handling `read(fd, buf, n)` on a regular file in the correct order.',
      ['User executes the syscall instruction with number in rax and arguments in registers', 'Kernel decodes registers into the ABI struct', 'Handler dispatches on the syscall number', 'Handler looks up fd in the process file table', 'Handler checks the open mode and file kind', 'Handler reads from the file at the current position into a kernel buffer', 'Handler copies the data to the user buffer with a checked user pointer', 'Handler advances the file position', 'Result is placed in rax and the kernel returns to user mode'],
      { mode: 'order', lab: true, why: 'Validate before touching state: lookup and mode check come before reading, and the user pointer is only touched through the checked copy.' }),

    O(7, 'pagetable', 'KeOS project 2. Order what `PageTable::map(va, pa, perm)` does for a fresh address whose upper-level tables do not exist yet.',
      ['Check that va is page aligned and perm includes READ', 'Compute the four 9-bit indices from va', 'Allocate and install a PDPT page under the PML4 entry', 'Allocate and install a PD page under the PDPT entry', 'Allocate and install a PT page under the PD entry', 'Check the leaf PTE is not already present', 'Write the physical address and flags into the leaf PTE'],
      { mode: 'order', lab: true, why: 'Walk top-down, creating each missing level; the leaf is only written after the duplicate check.' }),

    /* ---------------- concept checks on the same code ---------------- */
    M(2, 'fd', 'KeOS project 1. Which are correct about the `pipe` handler?', ['The read end is installed with a read-only mode', 'If writing the fd pair to user memory fails, the installed fds should be removed', 'The kernel may write directly through the raw user pointer without validation', 'pipefd[0] is the write end'], 'ab', 'Read end = pipefd[0] (read-only). Failure after installing must roll back to avoid leaking descriptors. User pointers always go through the checked API.', { lab: true, ref: 'KeOS-01', lvl: 2 }),

    M(7, 'pagetable', 'KeOS project 2. Which are correct about `PageTable::map` / `clear`?', ['Intermediate entries are made permissive; the leaf PTE carries the effective permission', 'XD is set when the page is NOT executable', 'clear() also frees the kernel-half PML4 mappings', 'Mapping an already-present leaf returns an error'], 'abd', 'Kernel-half mappings are shared and are not cleared. Duplicated is returned for a present leaf.', { lab: true, ref: 'KeOS-02', lvl: 2 }),
  ]);
})();
