# Testing Guide - Phase 3: PID-Based Process Tracking

## What Was Fixed

### Problem
The sidebar incorrectly showed functions as "Stopped" even though they were still running. This happened after 30-60 seconds without any user interaction.

### Root Cause
VS Code's `onDidCloseTerminal` event was firing spuriously (not just when terminals actually closed), causing the extension to incorrectly mark running functions as stopped.

### Solution
Implemented a **Hybrid PID Tracking System** that:
1. Tracks the actual function process PID (not just the terminal shell)
2. Verifies the process is actually dead before updating status
3. Uses polling (every 3 seconds) as a safety net
4. Handles both user-initiated closures and unexpected crashes

## How to Test

### Prerequisites
- VS Code with the extension installed
- A C# Azure Function project in a solution file
- Azure Functions Core Tools installed (`func` command available)

### Test Scenarios

#### 1. Basic Start/Stop
**Expected Behavior:**
- ✅ Function starts and status shows "Running"
- ✅ Terminal opens with function output
- ✅ Status remains "Running" indefinitely (no false "Stopped")
- ✅ Clicking "Stop" terminates the function and updates status to "Stopped"

**Steps:**
1. Open the Azure Function Runner sidebar
2. Click "Start" on a function
3. Wait 2-3 minutes (previously would show "Stopped" after 30-60 seconds)
4. Verify status still shows "Running"
5. Click "Stop"
6. Verify status changes to "Stopped"

#### 2. User Closes Terminal Manually
**Expected Behavior:**
- ✅ Status updates to "Stopped" when user closes the terminal
- ✅ Extension detects the closure and updates UI

**Steps:**
1. Start a function
2. Manually close the terminal (click X on terminal tab)
3. Verify status in sidebar updates to "Stopped"

#### 3. Process Crashes
**Expected Behavior:**
- ✅ Extension detects when the function process dies
- ✅ Status updates to "Stopped"
- ✅ User receives notification about unexpected stop

**Steps:**
1. Start a function
2. Kill the process manually (find PID in terminal, run `kill <PID>`)
3. Wait up to 3 seconds (polling interval)
4. Verify status updates to "Stopped"
5. Verify notification appears

#### 4. Multiple Functions
**Expected Behavior:**
- ✅ Each function tracked independently
- ✅ Starting/stopping one doesn't affect others
- ✅ All statuses remain accurate

**Steps:**
1. Start multiple functions
2. Wait 2-3 minutes
3. Verify all show "Running"
4. Stop one function
5. Verify only that one shows "Stopped"

#### 5. Start All / Stop All
**Expected Behavior:**
- ✅ Bulk operations work correctly
- ✅ All statuses update properly
- ✅ Progress indicator shows during operation

**Steps:**
1. Click "Start All Functions"
2. Verify all functions start and show "Running"
3. Wait 2-3 minutes
4. Verify all still show "Running"
5. Click "Stop All Functions"
6. Verify all show "Stopped"

### Debugging

#### Check Console Logs
Open VS Code Developer Tools (Help > Toggle Developer Tools) and check console for:
- `Terminal PID for <name>: <pid>`
- `Function process for <name>: PID <pid> (<process_name>)`
- `Terminal close event for <name> but process still running (PID: <pid>)` (spurious events)
- `Function process <pid> for <name> has stopped` (actual termination)

#### Check Output Panel
View > Output > Select "Azure Function Runner" to see extension logs

## Technical Details

### What Changed

#### New Files
- **`src/utils/processUtils.ts`**: Cross-platform process utilities
  - `isProcessRunning()`: Check if PID exists
  - `findChildProcesses()`: Find child processes of a parent
  - `findFunctionProcess()`: Locate the actual func/dotnet process
  - `getProcessName()`: Get process name for debugging

#### Modified Files
- **`src/services/functionManager.ts`**:
  - Added `terminalPid` and `functionPid` to `RunningFunctionInfo`
  - Added `statusCheckInterval` for polling
  - New `startProcessMonitoring()`: Discovers PID and starts polling
  - New `stopProcessMonitoring()`: Cleans up polling interval
  - New `checkProcessStatus()`: Polls process status every 3 seconds
  - Updated `handleTerminalClosed()`: Verifies PID before updating status
  - Updated `startFunction()`: Initiates process monitoring
  - Updated `stopFunction()`: Stops monitoring before disposal
  - Updated `dispose()`: Cleans up all monitoring intervals

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   FunctionManager                        │
├─────────────────────────────────────────────────────────┤
│  1. Start function in terminal                          │
│  2. Wait 1 second for terminal to initialize            │
│  3. Get terminal shell PID                              │
│  4. Find child process (func/dotnet) PID                │
│  5. Start polling (every 3 seconds)                     │
│  6. On terminal close: verify PID is dead               │
│  7. On polling: check if PID still exists               │
│  8. Update status only when process actually stops      │
└─────────────────────────────────────────────────────────┘
```

### Process Hierarchy
```
Terminal Shell (bash/zsh/cmd) - PID: 12345
  └─ func start - PID: 12346
       └─ dotnet - PID: 12347 ← We track this!
```

### Cross-Platform Support
- **macOS/Linux**: Uses `pgrep -P <parent_pid>` to find children
- **Windows**: Uses `wmic process where (ParentProcessId=<pid>) get ProcessId`
- **Process check**: Uses `process.kill(pid, 0)` (signal 0 = check existence)

## Known Limitations

1. **1-second delay**: There's a 1-second wait after starting to allow terminal initialization
2. **3-second polling**: Status updates from polling have up to 3-second delay
3. **PID discovery**: If PID can't be found initially, it retries on next poll
4. **Terminal events**: Still listened to for immediate detection, but verified with PID

## Future Enhancements

### Debugger Support (Planned)
The PID tracking foundation enables future debugger attachment:
```typescript
vscode.debug.startDebugging(workspace, {
  type: 'coreclr',
  request: 'attach',
  processId: functionPid
});
```

This will allow "Start with Debugging" functionality while keeping terminals visible for logs.

## Troubleshooting

### Status still shows "Stopped" incorrectly
1. Check console logs for PID discovery messages
2. Verify `func` command is in PATH
3. Check if process is actually running: `ps aux | grep func` (macOS/Linux) or Task Manager (Windows)
4. Look for error messages in Output panel

### PID not discovered
- Terminal might need more time to initialize (increase delay in `startProcessMonitoring`)
- `func` command might not be spawning child processes as expected
- Check console logs for "Could not find function process" messages

### Polling not working
- Check if `statusCheckInterval` is being set
- Verify `checkProcessStatus()` is being called (add console.log)
- Ensure intervals are cleaned up properly on stop

## Success Criteria

✅ Functions remain "Running" indefinitely when active  
✅ Status updates to "Stopped" when user closes terminal  
✅ Status updates to "Stopped" when process crashes  
✅ No false "Stopped" status for running functions  
✅ Bulk operations work correctly  
✅ Extension compiles without errors  
✅ No memory leaks or performance issues  

## Version
Phase 3 - v0.3.0 - 2026-03-17