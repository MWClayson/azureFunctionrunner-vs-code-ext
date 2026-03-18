# Solution Analysis: Terminal-Based Process Tracking with Debugger Support

## Problem Statement
Need to track Azure Function process status while:
1. Using VS Code terminals for visibility
2. Supporting future debugger attachment
3. Handling spurious `onDidCloseTerminal` events
4. Detecting when user manually closes terminals

## Process Hierarchy
```
Terminal Shell (bash/zsh/cmd)
  └─ func start
       └─ dotnet process (actual Azure Function)
```

## Recommended Solution: Hybrid Approach

### Architecture
```
┌─────────────────────────────────────────────────────────┐
│                   FunctionManager                        │
├─────────────────────────────────────────────────────────┤
│  1. Start function in terminal                          │
│  2. Parse terminal output for process info              │
│  3. Store PID + terminal reference                      │
│  4. Poll PID status (every 3 seconds)                   │
│  5. Listen to terminal close events (immediate)         │
│  6. Verify PID on terminal close                        │
└─────────────────────────────────────────────────────────┘
```

### Implementation Strategy

#### Phase 1: Enhanced Terminal Tracking
1. **Parse `func start` output** to extract process information
   - Azure Functions Core Tools outputs: `"Worker process started and initialized"`
   - Can parse for PID or use system commands after startup

2. **Use system commands to find child processes**
   ```typescript
   // macOS/Linux
   exec(`pgrep -P ${terminalPid}`)
   
   // Windows
   exec(`wmic process where (ParentProcessId=${terminalPid}) get ProcessId`)
   ```

3. **Implement dual tracking**
   - Event-based: `onDidCloseTerminal` for immediate detection
   - Polling-based: Check PID every 3 seconds as safety net
   - Verify PID before updating status

#### Phase 2: Debugger Support (Future)
1. **Start with debugging**
   ```typescript
   // Use VS Code Debug API
   vscode.debug.startDebugging(workspace, {
     type: 'coreclr',
     request: 'launch',
     name: 'Attach to Azure Function',
     processId: functionPid
   });
   ```

2. **Terminal remains visible** for logs while debugger is attached

### Data Structure
```typescript
interface RunningFunctionInfo {
    project: FunctionProject;
    terminal: vscode.Terminal;
    processId?: number;           // func/dotnet PID
    terminalPid?: number;         // shell PID
    statusCheckInterval?: NodeJS.Timeout;
}
```

### Status Detection Logic
```typescript
async function checkProcessStatus(pid: number): Promise<boolean> {
    try {
        // Cross-platform: process.kill(pid, 0) checks if process exists
        process.kill(pid, 0);
        return true; // Process is running
    } catch (e) {
        return false; // Process not found
    }
}

function handleTerminalClosed(terminal: vscode.Terminal): void {
    const info = findRunningFunction(terminal);
    if (!info) return;
    
    // Verify the actual function process is dead
    if (info.processId) {
        const isRunning = await checkProcessStatus(info.processId);
        if (isRunning) {
            // Spurious event, ignore
            return;
        }
    }
    
    // Process is actually dead, update status
    updateStatus(info.project.id, FunctionStatus.Stopped);
}
```

### Benefits
1. ✅ Terminals remain visible for user interaction
2. ✅ Accurate status tracking via PID
3. ✅ Handles spurious terminal events
4. ✅ Detects user-initiated terminal closures
5. ✅ Foundation for debugger attachment
6. ✅ Cross-platform compatible
7. ✅ No artificial delays

### Implementation Steps
1. Add PID extraction logic after `func start`
2. Implement `checkProcessStatus()` helper
3. Add polling interval (3 seconds)
4. Update `handleTerminalClosed()` with PID verification
5. Clean up intervals on stop/dispose
6. Add debug configuration generation
7. Implement "Start with Debugging" command

## Alternative Considered: terminal.exitStatus
- **Pros**: Simple, no polling needed
- **Cons**: 
  - Doesn't help with spurious events (exitStatus is undefined for both running and spurious events)
  - Can't distinguish between "still running" and "event fired incorrectly"
  - No foundation for debugger support

## Recommendation
Implement the **Hybrid Approach** with PID tracking. This provides:
- Robust status detection
- Foundation for debugger support
- Better user experience
- Cross-platform compatibility