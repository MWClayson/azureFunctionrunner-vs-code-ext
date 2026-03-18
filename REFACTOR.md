# Process Management & Debugging — Implementation Specification

## The Problem Being Solved

The current extension manages Azure Function processes by creating VS Code terminal instances and running `func start` in each. This approach has three specific failures:

1. **Terminal processes report as exited when they are still running.** The VS Code Terminal API is a UI layer over a PTY (pseudo-terminal). When the PTY host recycles, the terminal session ends, or VS Code rearranges its internal processes, the terminal fires a "closed" event even though the underlying `func` process is still alive. The extension interprets this as the function stopping, but the process and port remain occupied.

2. **PIDs are lost or wrong.** The Terminal API does not expose the PID of the process running inside the terminal. `vscode.Terminal.processId` returns a `Thenable<number | undefined>` that resolves to the **shell** PID (e.g. `/bin/zsh` or `powershell.exe`), not the `func` or `dotnet` process. On Windows, the shell PID has no parent-child relationship with the actual function host process that you need for debugger attachment.

3. **There is no way to parse terminal output programmatically.** The Terminal API does not provide an `onData` or `stdout` event. You cannot watch for "Host started" or endpoint URLs. The only way to read terminal content is via the clipboard, which is not viable for automated status detection.

**The fix:** Replace the Terminal API with `child_process.spawn()`. This gives the extension direct ownership of the process object, including a real PID, stdout/stderr streams, and deterministic lifecycle events (`exit`, `error`, `close`).

---

## Process Spawning

### How to spawn a function host

```typescript
import { spawn, ChildProcess, execSync } from 'child_process';

const args: string[] = ['start'];

// Add port if configured in local.settings.json
if (port) {
  args.push('--port', String(port));
}

// If the developer builds externally (dotnet watch, manual build),
// pass --no-build to skip func's internal dotnet build for faster startup.
if (skipBuild) {
  args.push('--no-build');
}

const child: ChildProcess = spawn('func', args, {
  cwd: functionAppDirectory,   // Absolute path to the directory containing host.json
  shell: true,                 // REQUIRED — see "Why shell: true" below
  env: { ...process.env },     // Inherit the developer's env (PATH, DOTNET_ROOT, etc.)
  stdio: ['pipe', 'pipe', 'pipe'],  // Capture stdout, stderr, and allow stdin
});
```

### Why `shell: true` is required

On Windows, the Azure Functions Core Tools are installed as `func.cmd` — a batch file wrapper, not a native binary. Node.js `spawn()` without `shell: true` looks for a binary named `func` or `func.exe` and fails to find it. With `shell: true`, the command is executed through `cmd.exe` (Windows) or `/bin/sh` (macOS), which correctly resolves `.cmd` files.

**Trade-off:** `shell: true` means `child.pid` is the PID of the shell process (`cmd.exe` or `/bin/sh`), not `func` itself. The actual `func` process (and the `dotnet` worker beneath it) are children of this shell. This matters for two things:

1. **Killing the process** — you must kill the entire process tree, not just the shell PID. See "How to stop a function host" below.
2. **Debugger attachment** — you need the `dotnet` worker PID, which is a grandchild of `child.pid`. See "Getting the PID for debugger attachment" below.

### What `child` gives you that Terminal did not

| Capability | Terminal API | child_process.spawn() |
|---|---|---|
| Real PID of spawned process | ❌ Shell PID only, via async Thenable | ✅ `child.pid` (shell PID, but deterministic and immediate) |
| stdout stream | ❌ Not exposed | ✅ `child.stdout` — readable stream |
| stderr stream | ❌ Not exposed | ✅ `child.stderr` — readable stream |
| Exit event with code | ❌ Terminal "closed" event, unreliable | ✅ `child.on('exit', (code, signal) => ...)` |
| Spawn failure detection | ❌ Silent failure | ✅ `child.on('error', (err) => ...)` |
| Send signals (SIGTERM) | ❌ Not possible | ✅ `child.kill('SIGTERM')` |
| Process still alive check | ❌ Not possible | ✅ `child.killed` property + `child.exitCode` |

### Handling spawn failures

`spawn()` can fail in two ways. You must handle both:

**1. The `error` event — `func` is not found on PATH or cannot be executed:**

```typescript
child.on('error', (err: NodeJS.ErrnoException) => {
  // err.code will be 'ENOENT' if func is not on PATH
  // This fires INSTEAD of 'exit' — the process never started.
  
  if (err.code === 'ENOENT') {
    // func is not installed or not on PATH
    managedFunction.status = 'errored';
    managedFunction.lastError = 'Azure Functions Core Tools (func) not found on PATH. Install from https://github.com/Azure/azure-functions-core-tools';
  } else {
    managedFunction.status = 'errored';
    managedFunction.lastError = `Failed to start: ${err.message}`;
  }

  managedFunction.process = null;
  managedFunction.pid = null;
  fireStatusChanged(managedFunction);
});
```

**2. `child.pid` is `undefined` — spawn failed silently:**

```typescript
if (child.pid === undefined) {
  // This can happen if the OS refused to create the process
  // (e.g. too many open file descriptors, permissions error).
  // The 'error' event will fire shortly, but guard here too.
  managedFunction.status = 'errored';
  managedFunction.lastError = 'Failed to spawn process — pid is undefined';
  managedFunction.process = null;
  fireStatusChanged(managedFunction);
  return;
}
```

---

## Status Management

### The status type

```typescript
type FunctionStatus =
  | 'stopped'    // Not running. Initial state, or cleanly exited.
  | 'starting'   // func start has been spawned but is not yet ready to accept requests.
  | 'running'    // Host has reported readiness — endpoints are live.
  | 'stopping'   // Extension has sent a kill signal, waiting for exit.
  | 'errored';   // Process exited with non-zero code, or spawn failed, or a fatal error was detected in stdout.
```

### State machine

```
                                   stdout readiness
  ┌─────────┐   spawn()   ┌──────────┐   detected    ┌─────────┐
  │ stopped │ ──────────▶  │ starting │ ────────────▶  │ running │
  └─────────┘              └──────────┘                └─────────┘
       ▲                        │                           │
       │                   exit event                    kill()
       │                   (non-zero)                       │
       │                        │                           ▼
       │                        ▼                      ┌──────────┐
       │                   ┌─────────┐                 │ stopping │
       │                   │ errored │                 └──────────┘
       │                   └─────────┘                      │
       │                        │                      exit event
       │                        │                           │
       └────────────────────────┴───────────────────────────┘
                        start() / restart()
```

### Rules (enforced in code)

1. **Only one component may write status.** The process manager class owns all transitions. UI components (TreeView, status bar) read status; they never set it.
2. **Every status transition fires an event.** Subscribers (TreeView, status bar) refresh when they receive it.
3. **The `errored` status always has a `lastError` string.** This is shown in the TreeView tooltip and OutputChannel. Never set `errored` without also setting `lastError`.
4. **`stopping` is an intermediate state.** It exists so the UI can show "Stopping..." while waiting for the process to actually exit. Never skip it — always set `stopping` before sending a kill signal.
5. **A function in `starting` state that receives an exit event transitions to `errored`, not `stopped`.** If the process exits before reaching `running`, something went wrong (build failure, port conflict, config error). `stopped` is reserved for clean, intentional shutdowns.

### How status transitions happen in practice

**stopped → starting:**
Called when the developer clicks Start. The process manager calls `spawn()`, sets `status = 'starting'`, stores `child` and `child.pid`, and fires the status event.

**starting → running:**
Driven by stdout parsing. The process manager watches `child.stdout` for readiness signals (see "Detecting readiness from stdout" below). When detected, sets `status = 'running'`, records `startedAt = new Date()`, and fires the event.

**starting → errored:**
Two triggers:
- The `exit` event fires with a non-zero code before readiness was detected.
- A fatal error pattern is matched in stdout (e.g. "address already in use").

**running → stopping:**
Called when the developer clicks Stop. The process manager sets `status = 'stopping'`, fires the event, then sends the kill signal.

**stopping → stopped:**
The `exit` event fires after the kill signal. The process manager sets `status = 'stopped'`, clears `process` and `pid` to `null`, clears `endpoints`, and fires the event.

**running → errored:**
The `exit` event fires unexpectedly (the process crashed). Set `lastError` to include the exit code and signal.

### Wiring up the exit event

```typescript
child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
  const wasRunning = managedFunction.status === 'running';
  const wasStopping = managedFunction.status === 'stopping';
  const wasStarting = managedFunction.status === 'starting';

  // Clean up process references regardless of how we got here
  managedFunction.process = null;
  managedFunction.pid = null;
  managedFunction.endpoints = [];

  if (wasStopping) {
    // We initiated the kill — this is a clean shutdown
    managedFunction.status = 'stopped';
    managedFunction.lastError = undefined;
  } else if (wasStarting) {
    // Process died during startup — always an error
    managedFunction.status = 'errored';
    managedFunction.lastError = buildExitErrorMessage(code, signal, 'Function failed to start');
  } else if (wasRunning && code !== 0) {
    // Process crashed while running
    managedFunction.status = 'errored';
    managedFunction.lastError = buildExitErrorMessage(code, signal, 'Function crashed');
  } else {
    // Running process exited with code 0 (unusual but not an error)
    managedFunction.status = 'stopped';
    managedFunction.lastError = undefined;
  }

  fireStatusChanged(managedFunction);

  // Log the exit to the function's OutputChannel
  managedFunction.outputChannel.appendLine(
    `\n[Extension] Process exited — code: ${code}, signal: ${signal}`
  );
});

function buildExitErrorMessage(
  code: number | null,
  signal: NodeJS.Signals | null,
  prefix: string
): string {
  const parts = [prefix];
  if (code !== null) parts.push(`exit code ${code}`);
  if (signal) parts.push(`signal ${signal}`);
  return parts.join(' — ');
}
```

---

## Detecting Readiness from stdout

This is how the extension knows a function is actually ready to handle requests, replacing the unreliable guesswork of the terminal approach.

### What `func start` outputs (for .NET isolated)

When you run `func start` for a .NET isolated function, the stdout output follows this approximate sequence:

```
Azure Functions Core Tools
Core Tools Version: 4.x.x
...

Functions:

        ProcessOrder: [POST] http://localhost:7075/api/ProcessOrder

        GetOrderStatus: [GET] http://localhost:7075/api/GetOrderStatus

For detailed output, run func with --verbose flag.
...
[2024-01-15T10:30:00.000Z] Worker process started and initialized.
[2024-01-15T10:30:00.100Z] Host started successfully.
```

The key signals are:
1. **Endpoint lines** — these tell you which functions are available and their URLs.
2. **Readiness lines** — these tell you the host is fully initialised and ready.
3. **Fatal error lines** — these tell you something went wrong and the host will not start.

### Pattern definitions

```typescript
/**
 * Patterns that indicate the host is ready to accept requests.
 * ANY match = transition to 'running'.
 */
const READINESS_PATTERNS: RegExp[] = [
  /Host started/i,
  /Worker process started and initialized/i,
  /Job host started/i,
  /Hosting started/i,
];

/**
 * Pattern to extract HTTP endpoint definitions from func output.
 * Captures: [1] = function name, [2] = HTTP methods, [3] = URL
 *
 * Example match:
 *   "        ProcessOrder: [POST] http://localhost:7075/api/ProcessOrder"
 *   → name: "ProcessOrder", methods: "POST", url: "http://localhost:7075/api/ProcessOrder"
 */
const ENDPOINT_PATTERN: RegExp = /^\s+(\w+):\s+\[([^\]]+)\]\s+(https?:\/\/\S+)/gm;

/**
 * Patterns that indicate a fatal startup error.
 * ANY match while in 'starting' state = transition to 'errored'.
 * The matched line (or a relevant portion) becomes `lastError`.
 */
const FATAL_ERROR_PATTERNS: RegExp[] = [
  /address already in use/i,
  /EADDRINUSE/i,
  /A host error has occurred/i,
  /Unable to start host/i,
  /Port \d+ is unavailable/i,
  /Build FAILED/i,
  /error MSB\d+/i,
];
```

### The parsing function

This function is called every time a chunk of data arrives on `child.stdout`. It is pure (no side effects) and testable in isolation.

```typescript
interface FunctionEndpoint {
  name: string;
  methods: string[];
  url: string;
}

interface ParseResult {
  /** True if any readiness pattern matched */
  isReady: boolean;
  /** True if any fatal error pattern matched */
  isFatalError: boolean;
  /** The matched error text, for use as lastError */
  fatalErrorMessage: string | undefined;
  /** Any endpoints discovered in this chunk */
  discoveredEndpoints: FunctionEndpoint[];
}

function parseHostOutput(text: string): ParseResult {
  const result: ParseResult = {
    isReady: false,
    isFatalError: false,
    fatalErrorMessage: undefined,
    discoveredEndpoints: [],
  };

  // Check for readiness
  for (const pattern of READINESS_PATTERNS) {
    if (pattern.test(text)) {
      result.isReady = true;
      break;
    }
  }

  // Check for fatal errors
  for (const pattern of FATAL_ERROR_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      result.isFatalError = true;
      result.fatalErrorMessage = match[0];
      break;
    }
  }

  // Extract endpoints
  let endpointMatch: RegExpExecArray | null;
  // Reset lastIndex since we're reusing the regex
  ENDPOINT_PATTERN.lastIndex = 0;
  while ((endpointMatch = ENDPOINT_PATTERN.exec(text)) !== null) {
    result.discoveredEndpoints.push({
      name: endpointMatch[1],
      methods: endpointMatch[2].split(',').map(m => m.trim()),
      url: endpointMatch[3],
    });
  }

  return result;
}
```

### Wiring the parser to the process

```typescript
child.stdout.on('data', (data: Buffer) => {
  const text = data.toString();

  // 1. Always write to the OutputChannel (for log viewing)
  managedFunction.outputChannel.append(text);

  // 2. Always emit the log event (for any future subscribers)
  fireLogWritten({ id: managedFunction.id, text });

  // 3. Only parse for status if we're still starting
  //    (once running, we don't need to parse anymore — just log)
  if (managedFunction.status === 'starting') {
    const result = parseHostOutput(text);

    // Discover endpoints (accumulate — they may arrive across multiple chunks)
    if (result.discoveredEndpoints.length > 0) {
      for (const ep of result.discoveredEndpoints) {
        // Avoid duplicates
        if (!managedFunction.endpoints.find(e => e.name === ep.name)) {
          managedFunction.endpoints.push(ep);
        }
      }
      fireEndpointsDiscovered(managedFunction);
    }

    // Fatal error takes precedence over readiness
    if (result.isFatalError) {
      managedFunction.status = 'errored';
      managedFunction.lastError = result.fatalErrorMessage ?? 'Fatal error during startup';
      fireStatusChanged(managedFunction);
      // Don't kill the process here — let it exit on its own.
      // The exit handler will clean up process/pid references.
    } else if (result.isReady) {
      managedFunction.status = 'running';
      managedFunction.startedAt = new Date();
      fireStatusChanged(managedFunction);
    }
  }
});

// stderr also goes to the OutputChannel — func writes some normal output to stderr
child.stderr.on('data', (data: Buffer) => {
  const text = data.toString();
  managedFunction.outputChannel.append(text);
  fireLogWritten({ id: managedFunction.id, text });
});
```

### Edge case: readiness detected across chunk boundaries

Node.js streams deliver data in chunks of variable size. The string "Host started" could theoretically be split across two chunks: `"...Hos"` in one, `"t started..."` in the next. In practice this is extremely unlikely for short patterns, but if you want to be defensive:

```typescript
// Maintain a rolling buffer of the last N characters per function
const BUFFER_SIZE = 256;
let tailBuffer = '';

child.stdout.on('data', (data: Buffer) => {
  const text = data.toString();
  
  // Concatenate with tail of previous chunk for pattern matching
  const searchText = tailBuffer + text;
  const result = parseHostOutput(searchText);
  
  // Keep only the tail for next iteration
  tailBuffer = text.length > BUFFER_SIZE ? text.slice(-BUFFER_SIZE) : text;
  
  // ... rest of handling
});
```

For most real-world usage, this is unnecessary — `func start` outputs readiness on its own line and Node streams typically deliver complete lines. But the option is here if you see edge cases.

---

## Stopping a Function Host

### Why stopping is harder than it sounds

When you call `spawn('func', ['start'], { shell: true })`, the process tree looks like this:

**macOS:**
```
/bin/sh (child.pid)
  └── func (Azure Functions Core Tools — a Node.js process)
        └── dotnet (the .NET isolated worker running your function code)
```

**Windows:**
```
cmd.exe (child.pid)
  └── func.cmd → node.exe (Azure Functions Core Tools)
        └── dotnet.exe (the .NET isolated worker)
```

Calling `child.kill('SIGTERM')` only kills the shell (`/bin/sh` or `cmd.exe`). The `func` process and the `dotnet` worker become **orphaned** — they keep running, hold the port, and lock the DLL files. This is the root cause of the "port already in use" and "DLL locked" errors you've been seeing.

### The correct kill implementation

```typescript
async function stopFunction(managedFunction: ManagedFunction): Promise<void> {
  const child = managedFunction.process;
  if (!child) {
    // Already stopped — just ensure state is clean
    managedFunction.status = 'stopped';
    managedFunction.process = null;
    managedFunction.pid = null;
    managedFunction.endpoints = [];
    fireStatusChanged(managedFunction);
    return;
  }

  // 1. Transition to 'stopping' immediately so the UI updates
  managedFunction.status = 'stopping';
  fireStatusChanged(managedFunction);
  managedFunction.outputChannel.appendLine('\n[Extension] Stopping function host...');

  const pid = child.pid;

  // 2. Set up a promise that resolves when the process actually exits
  const exitPromise = new Promise<void>((resolve) => {
    child.once('exit', () => {
      managedFunction.status = 'stopped';
      managedFunction.process = null;
      managedFunction.pid = null;
      managedFunction.endpoints = [];
      managedFunction.lastError = undefined;
      fireStatusChanged(managedFunction);
      managedFunction.outputChannel.appendLine('[Extension] Function host stopped.');
      resolve();
    });
  });

  // 3. Kill the process tree (platform-specific)
  if (pid) {
    killProcessTree(pid);
  } else {
    // No PID — try killing the child directly
    try { child.kill('SIGKILL'); } catch { /* already dead */ }
  }

  // 4. Wait for exit, but don't wait forever
  const timeout = new Promise<void>((resolve) => {
    setTimeout(() => {
      // If the process hasn't exited after 10s, force cleanup
      if (managedFunction.process) {
        managedFunction.outputChannel.appendLine(
          '[Extension] WARNING: Process did not exit within 10s — forcing cleanup.'
        );
        managedFunction.status = 'stopped';
        managedFunction.process = null;
        managedFunction.pid = null;
        managedFunction.endpoints = [];
        fireStatusChanged(managedFunction);
      }
      resolve();
    }, 10000);
  });

  await Promise.race([exitPromise, timeout]);
}
```

### Platform-specific process tree kill

```typescript
function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    killProcessTreeWindows(pid);
  } else {
    killProcessTreeUnix(pid);
  }
}

/**
 * Windows: Use taskkill with /T (tree kill) and /F (force).
 *
 * This kills cmd.exe, func/node.exe, and dotnet.exe in one call.
 * Without /T, only cmd.exe is killed and the rest become orphans.
 */
function killProcessTreeWindows(pid: number): void {
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
  } catch {
    // Process may have already exited — this is not an error.
    // taskkill returns exit code 128 if the process doesn't exist.
  }
}

/**
 * macOS/Linux: Kill the process group, then force-kill after a timeout.
 *
 * When shell: true is used, the shell and its children share a process group.
 * Sending a signal to the negative PID targets the entire group.
 */
function killProcessTreeUnix(pid: number): void {
  // First attempt: kill the process group (negative PID)
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (err: any) {
    if (err.code === 'ESRCH') {
      // Process group doesn't exist — already dead
      return;
    }
    // Fallback: kill the individual process
    try {
      process.kill(pid, 'SIGTERM');
    } catch { /* already dead */ }
  }

  // Schedule a force-kill in case SIGTERM doesn't work
  // (e.g. the process is stuck or ignoring SIGTERM)
  setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch { /* already dead */ }
    }
  }, 5000);
}
```

### Verifying the port is free after stopping

After the exit event fires, the port should be free. But on Windows, there can be a brief delay (TIME_WAIT state). If the developer immediately restarts and gets "address already in use", the extension should detect this via the fatal error pattern and surface a clear message rather than silently failing.

---

## Log Viewing

### Architecture

Each function gets a dedicated `vscode.OutputChannel`. This is the same mechanism VS Code uses for extension logs, Git output, and task output — developers are already familiar with it.

```
┌──────────────────────────┐
│   child.stdout stream    │──────┐
└──────────────────────────┘      │
                                  ▼
┌──────────────────────────┐   ┌─────────────────────────────┐
│   child.stderr stream    │──▶│  vscode.OutputChannel       │
└──────────────────────────┘   │  "Func: OrdersApi"          │
                               │                             │
┌──────────────────────────┐   │  Contains:                  │
│  Extension status msgs   │──▶│  - [Extension] Starting...  │
│  "[Extension] ..."       │   │  - func start stdout        │
└──────────────────────────┘   │  - func start stderr        │
                               │  - [Extension] Host ready   │
                               │  - Runtime logs             │
                               │  - [Extension] Stopped      │
                               └─────────────────────────────┘
                                          │
                                          ▼
                               Developer clicks "Show Logs"
                               → outputChannel.show(true)
                                 (true = don't steal focus)
```

### Creating and managing OutputChannels

```typescript
// Create one OutputChannel per function, at registration time (not at start time).
// This means logs are available even before the function starts.
const outputChannel = vscode.window.createOutputChannel(`Func: ${displayName}`);

// Store it on the ManagedFunction so it persists across start/stop cycles.
managedFunction.outputChannel = outputChannel;
```

### What gets written and when

**On start (immediately after spawn):**
```typescript
outputChannel.clear();  // Fresh log for each start
outputChannel.appendLine(`[Extension] Starting ${displayName} on port ${port}...`);
outputChannel.appendLine(`[Extension] Command: func ${args.join(' ')}`);
outputChannel.appendLine(`[Extension] Working directory: ${cwd}`);
outputChannel.appendLine(`[Extension] PID: ${child.pid}`);
outputChannel.appendLine(''); // Blank line before func output
```

**During startup and runtime (continuous):**
```typescript
// stdout — this is where func start's output goes
child.stdout.on('data', (data: Buffer) => {
  outputChannel.append(data.toString());
  // Note: append(), not appendLine() — func's output already contains newlines
});

// stderr — func writes some normal operational messages to stderr
child.stderr.on('data', (data: Buffer) => {
  outputChannel.append(data.toString());
});
```

**On readiness detected:**
```typescript
outputChannel.appendLine('');
outputChannel.appendLine(`[Extension] Host ready — ${managedFunction.endpoints.length} endpoint(s) detected`);
for (const ep of managedFunction.endpoints) {
  outputChannel.appendLine(`[Extension]   ${ep.name}: [${ep.methods.join(', ')}] ${ep.url}`);
}
```

**On stop initiated:**
```typescript
outputChannel.appendLine('');
outputChannel.appendLine('[Extension] Stopping function host...');
```

**On exit:**
```typescript
outputChannel.appendLine(`[Extension] Process exited — code: ${code}, signal: ${signal}`);
if (managedFunction.status === 'errored') {
  outputChannel.appendLine(`[Extension] Error: ${managedFunction.lastError}`);
}
```

### Showing logs to the developer

The "Show Logs" command opens (or focuses) the OutputChannel for a specific function:

```typescript
function showLogs(managedFunction: ManagedFunction): void {
  // true = preserveFocus: the OutputChannel panel opens but the editor retains focus
  managedFunction.outputChannel.show(true);
}
```

This should be wirable to:
- A TreeView inline action button (an icon on each function row)
- A TreeView right-click context menu item
- A command palette entry (with a QuickPick to select which function)

### Log behaviour across start/stop cycles

- **On fresh start:** `outputChannel.clear()` is called, so the channel starts clean.
- **On restart:** The channel is **not** cleared. The developer can scroll up to see the previous run's output, with the new run's output appended below a clear separator:
  ```
  [Extension] Process exited — code: 0, signal: SIGTERM
  
  ────────────────────────────────────────
  
  [Extension] Starting OrdersApi on port 7075...
  ```
- **On extension deactivation:** `outputChannel.dispose()` is called for all channels.
- **When function is not running:** The OutputChannel still exists and still contains the last run's logs. The developer can view them at any time.

### OutputChannel lifecycle

```typescript
// Created when the function is first registered (e.g. during workspace scan)
// NOT when the function starts — otherwise there are no logs until first start.
const outputChannel = vscode.window.createOutputChannel(`Func: ${displayName}`);

// Reused across start/stop/restart cycles — never recreated.

// Disposed only when the extension deactivates:
context.subscriptions.push({
  dispose: () => {
    for (const fn of processManager.getAll()) {
      fn.outputChannel.dispose();
    }
  }
});
```

---

## Getting the PID for Debugger Attachment

### The problem

For .NET isolated functions, the debugger must attach to the **dotnet worker process**, not the func host. The process tree looks like:

```
shell (child.pid — this is what spawn() gives you)
  └── func / node.exe (the Functions host runtime)
        └── dotnet.exe MyFunctionApp.dll (THIS is what the debugger needs)
```

`child.pid` is the shell. The func host is its child. The dotnet worker is a grandchild. You need the grandchild's PID to attach `coreclr`.

### Approach: VS Code process picker

Rather than building cross-platform process tree walking (fragile, differs between .NET hosting model versions), the extension uses VS Code's built-in process picker. This is the same picker developers already use when they manually attach — the extension just automates the steps around it.

```typescript
async function attachDebugger(managedFunction: ManagedFunction): Promise<boolean> {
  if (managedFunction.status !== 'running') {
    vscode.window.showWarningMessage(
      `Cannot attach debugger: "${managedFunction.displayName}" is not running.`
    );
    return false;
  }

  // Get the workspace folder for this function (needed by startDebugging)
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(managedFunction.cwd)
  );

  return vscode.debug.startDebugging(workspaceFolder ?? null, {
    type: 'coreclr',
    request: 'attach',
    name: `Debug: ${managedFunction.displayName}`,
    processId: '${command:pickProcess}',
  });
}
```

When this runs, VS Code opens the process picker. The developer selects the `dotnet` process running their function app DLL. The debugger attaches. This typically takes two clicks: "Attach Debugger" in the tree, then the process in the picker.

### "Start & Debug" — one-click flow

This command starts the function, waits for it to be ready, then opens the process picker:

```typescript
async function startAndDebug(managedFunction: ManagedFunction): Promise<boolean> {
  // 1. Start the function (this sets status to 'starting')
  await startFunction(managedFunction);

  // 2. Wait for it to reach 'running' status
  const ready = await waitForStatus(managedFunction, 'running', 60000);
  if (!ready) {
    vscode.window.showErrorMessage(
      `Timed out waiting for "${managedFunction.displayName}" to start. Check the output log.`
    );
    return false;
  }

  // 3. Small delay to let the .NET worker fully initialise
  //    (the host reports ready slightly before the worker is debuggable)
  await sleep(2000);

  // 4. Open the process picker to attach
  return attachDebugger(managedFunction);
}

/**
 * Wait for a ManagedFunction to reach a specific status, with timeout.
 * Returns true if reached, false if timed out or an error/stop state was hit.
 */
function waitForStatus(
  managedFunction: ManagedFunction,
  targetStatus: FunctionStatus,
  timeoutMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    // Already there?
    if (managedFunction.status === targetStatus) {
      resolve(true);
      return;
    }

    // Failed states = resolve false immediately
    const failStates: FunctionStatus[] = ['errored', 'stopped'];
    if (failStates.includes(managedFunction.status)) {
      resolve(false);
      return;
    }

    const timer = setTimeout(() => {
      subscription.dispose();
      resolve(false);
    }, timeoutMs);

    const subscription = onDidChangeStatus((changed) => {
      if (changed.id !== managedFunction.id) return;

      if (changed.status === targetStatus) {
        clearTimeout(timer);
        subscription.dispose();
        resolve(true);
      } else if (failStates.includes(changed.status)) {
        clearTimeout(timer);
        subscription.dispose();
        resolve(false);
      }
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Why the 2-second delay before opening the picker

The func host reports "Worker process started and initialized" when the worker process starts, but the .NET runtime inside the worker needs a brief moment to finish JIT compilation and become debuggable. Without the delay, the process picker sometimes can't find the dotnet process, or attaching fails with "process is not running managed code." Two seconds is conservative — in practice 500ms-1s is usually enough, but the extra time costs nothing and avoids flaky failures.

### Future enhancement: automatic PID resolution

If the process picker becomes annoying (an extra click every time), this is where you'd add automatic PID discovery. The architecture supports it — you'd replace `'${command:pickProcess}'` with the resolved PID string:

```typescript
// Instead of:
processId: '${command:pickProcess}',

// You'd do:
const workerPid = await findDotnetWorkerPid(managedFunction);
if (workerPid) {
  config.processId = String(workerPid);
} else {
  // Fallback to picker
  config.processId = '${command:pickProcess}';
}
```

The `findDotnetWorkerPid` function would walk the process tree from `child.pid` down to the `dotnet` process. This is platform-specific:

- **macOS/Linux:** `pgrep -P <pid>` recursively, filtering for command lines containing the function app's DLL name.
- **Windows:** `wmic process where (ParentProcessId=<pid>) get ProcessId,CommandLine` or PowerShell `Get-CimInstance Win32_Process`.

This is not included in the current scope because the process picker works reliably today. Add it later if the extra click becomes a friction point.

---

## Putting It All Together — The ManagedFunction Interface

```typescript
import { ChildProcess } from 'child_process';
import * as vscode from 'vscode';

type FunctionStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'errored';

interface FunctionEndpoint {
  name: string;
  methods: string[];
  url: string;
}

interface ManagedFunction {
  /** Unique ID — the absolute path to the function app directory */
  id: string;

  /** Human-readable name, e.g. "OrdersApi" */
  displayName: string;

  /** The spawned ChildProcess. Null when not running. */
  process: ChildProcess | null;

  /**
   * OS-level PID of the shell process that owns func start.
   * This is the shell PID (due to shell: true), not the func or dotnet PID.
   * Used for process tree kill, not for debugger attachment.
   * Null when not running.
   */
  pid: number | null;

  /** Current lifecycle status — only the process manager writes this */
  status: FunctionStatus;

  /** HTTP port from local.settings.json */
  port: number;

  /** Absolute path to the function app directory (contains host.json) */
  cwd: string;

  /** Dedicated output channel for this function's logs */
  outputChannel: vscode.OutputChannel;

  /** When the function last reached 'running' status */
  startedAt: Date | undefined;

  /** Error description when status is 'errored'. Always set when errored, always undefined otherwise. */
  lastError: string | undefined;

  /** HTTP trigger endpoints discovered from func start output */
  endpoints: FunctionEndpoint[];
}
```

---

## Event System

The process manager exposes three EventEmitters that the UI layer subscribes to. This is the only communication channel between the process layer and the UI layer.

```typescript
import * as vscode from 'vscode';

// Fired whenever any function's status changes.
// The TreeView subscribes to this and calls treeDataProvider.refresh().
const _onDidChangeStatus = new vscode.EventEmitter<ManagedFunction>();
const onDidChangeStatus: vscode.Event<ManagedFunction> = _onDidChangeStatus.event;

function fireStatusChanged(fn: ManagedFunction): void {
  _onDidChangeStatus.fire(fn);
}

// Fired when new endpoints are discovered during startup.
// The TreeView subscribes to add endpoint child nodes.
const _onDidDiscoverEndpoints = new vscode.EventEmitter<ManagedFunction>();
const onDidDiscoverEndpoints: vscode.Event<ManagedFunction> = _onDidDiscoverEndpoints.event;

function fireEndpointsDiscovered(fn: ManagedFunction): void {
  _onDidDiscoverEndpoints.fire(fn);
}

// Fired for every chunk of log output.
// Currently consumed by the OutputChannel (written inline).
// Exposed as an event for future subscribers (e.g. Webview log panel).
const _onDidWriteLog = new vscode.EventEmitter<{ id: string; text: string }>();
const onDidWriteLog: vscode.Event<{ id: string; text: string }> = _onDidWriteLog.event;

function fireLogWritten(entry: { id: string; text: string }): void {
  _onDidWriteLog.fire(entry);
}
```

### How the TreeView uses these events

```typescript
// In the TreeDataProvider constructor:
processManager.onDidChangeStatus(() => {
  // Refresh the entire tree — simple and correct.
  // For 9+ functions this is imperceptible. If it became a performance
  // concern with 100+ functions, you'd refresh individual tree items instead.
  this._onDidChangeTreeData.fire();
});

processManager.onDidDiscoverEndpoints(() => {
  this._onDidChangeTreeData.fire();
});
```

---

## Disposal and Cleanup

When the extension deactivates (VS Code closing, extension being disabled), all running function processes must be killed. If they are not, they become orphans holding ports and DLL locks.

```typescript
// In activate():
context.subscriptions.push({
  dispose: () => {
    // Stop all running functions — don't await, just fire and forget.
    // VS Code is shutting down; we have limited time.
    for (const fn of processManager.getAll()) {
      if (fn.process && fn.pid) {
        killProcessTree(fn.pid);
      }
      fn.outputChannel.dispose();
    }

    // Dispose event emitters
    _onDidChangeStatus.dispose();
    _onDidDiscoverEndpoints.dispose();
    _onDidWriteLog.dispose();
  }
});
```

**Why fire-and-forget on deactivation:** VS Code gives extensions a short window to clean up during deactivation. If you `await stopFunction()` for each of 9+ functions sequentially, you may exceed the timeout and VS Code will force-kill the extension host — leaving the function processes alive anyway. Instead, send all the kill signals immediately and let the OS handle the actual termination.

---

## Testing the Output Parser

The parser is the most unit-testable part of this system. Here are the test cases:

```typescript
// Readiness detection
assert(parseHostOutput('Host started successfully.').isReady === true);
assert(parseHostOutput('Worker process started and initialized.').isReady === true);
assert(parseHostOutput('Still loading...').isReady === false);
assert(parseHostOutput('Azure Functions Core Tools...').isReady === false);

// Fatal error detection
assert(parseHostOutput('Error: address already in use :::7075').isFatalError === true);
assert(parseHostOutput('Build FAILED.').isFatalError === true);
assert(parseHostOutput('error MSB3027: some build error').isFatalError === true);
assert(parseHostOutput('Normal startup message').isFatalError === false);

// Endpoint extraction
const withEndpoints = `
Functions:

        ProcessOrder: [POST] http://localhost:7075/api/ProcessOrder

        GetOrderStatus: [GET] http://localhost:7075/api/GetOrderStatus
`;
const result = parseHostOutput(withEndpoints);
assert(result.discoveredEndpoints.length === 2);
assert(result.discoveredEndpoints[0].name === 'ProcessOrder');
assert(result.discoveredEndpoints[0].methods[0] === 'POST');
assert(result.discoveredEndpoints[0].url === 'http://localhost:7075/api/ProcessOrder');
assert(result.discoveredEndpoints[1].name === 'GetOrderStatus');
assert(result.discoveredEndpoints[1].methods[0] === 'GET');

// Edge case: endpoint with multiple methods
const multiMethod = '        MyFunc: [GET,POST,PUT] http://localhost:7071/api/MyFunc';
const multi = parseHostOutput(multiMethod);
assert(multi.discoveredEndpoints[0].methods.length === 3);

// Edge case: fatal error and readiness in same chunk (fatal wins)
const both = 'Host started\naddress already in use';
const bothResult = parseHostOutput(both);
assert(bothResult.isReady === true);
assert(bothResult.isFatalError === true);
// The caller checks isFatalError first — see the wiring code above
```