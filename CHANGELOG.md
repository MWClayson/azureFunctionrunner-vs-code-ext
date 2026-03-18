# Changelog

All notable changes to the Azure Function Runner extension will be documented in this file.

## [0.4.0] - 2026-03-17

### Added - Phase 1: Core Infrastructure (REFACTOR.md Implementation)
- **Enhanced Type System**:
  - Renamed `FunctionStatus.Error` → `FunctionStatus.Errored` for consistency with specification
  - Added `FunctionEndpoint` interface for HTTP endpoint tracking
  - Enhanced `FunctionProject` interface with new fields:
    - `process: ChildProcess | null` - Direct process reference
    - `pid: number | null` - Shell process PID for tree killing
    - `outputChannel: vscode.OutputChannel | null` - Dedicated log channel
    - `startedAt: Date | undefined` - Timestamp when function reached 'running'
    - `lastError: string | undefined` - Error description for 'errored' status
    - `endpoints: FunctionEndpoint[]` - Discovered HTTP endpoints
  - Removed deprecated `terminalId` field (Terminal API being replaced)

- **Output Parser Utility** (`src/utils/outputParser.ts`):
  - Pure function for parsing `func start` output
  - Readiness detection patterns (Host started, Worker initialized, etc.)
  - Fatal error detection patterns (port in use, build failed, etc.)
  - HTTP endpoint extraction with regex parsing
  - Returns structured `ParseResult` with all detected information
  - Testable in isolation, no side effects

- **Process Killer Utility** (`src/utils/processKiller.ts`):
  - Platform-specific process tree termination
  - **Windows**: Uses `taskkill /F /T /PID` to kill entire tree
  - **Unix/macOS**: Uses negative PID to kill process group
  - Graceful SIGTERM followed by SIGKILL after 5 seconds
  - Handles orphaned processes from `shell: true` spawn
  - Prevents port locks and DLL file locks

### Changed
- Type system now supports direct process management via `child_process.spawn()`
- Foundation laid for replacing Terminal API with spawn-based approach
- Status model aligned with REFACTOR.md state machine specification

### Technical Details
This phase establishes the foundation for the complete refactor:
- **Problem**: Terminal API unreliable (false exit events, no PID access, no output parsing)
- **Solution**: Direct `child_process.spawn()` with proper lifecycle management
- **Next**: Phase 2 will rewrite ProcessManager to use these new utilities


### Added - Phase 2: Process Management Rewrite (REFACTOR.md Implementation)
- **Complete ProcessManager Rewrite** (`src/services/processManager.ts`):
  - Replaced Terminal API with `child_process.spawn()` for direct process control
  - Implements full REFACTOR.md specification for process lifecycle
  - **Spawn-based Process Management**:
    - Uses `spawn('func', ['start'], { shell: true })` for cross-platform compatibility
    - Handles spawn failures (ENOENT for missing func CLI, undefined PID)
    - Captures stdout/stderr streams for parsing and logging
    - Direct access to process PID for reliable tracking
  
  - **Status State Machine**:
    - Strict state transitions: stopped → starting → running → stopping → stopped
    - `starting` + exit → `errored` (startup failure)
    - `running` + non-zero exit → `errored` (crash)
    - `stopping` + exit → `stopped` (clean shutdown)
    - `errored` status always includes `lastError` message
  
  - **stdout/stderr Parsing**:
    - Real-time parsing using `outputParser` utility
    - Detects readiness patterns (Host started, Worker initialized)
    - Detects fatal errors (port in use, build failed)
    - Extracts HTTP endpoints with methods and URLs
    - Transitions to 'running' when readiness detected
    - Transitions to 'errored' when fatal error detected
  
  - **OutputChannel Integration**:
    - Creates dedicated `vscode.OutputChannel` per function
    - Writes all stdout/stderr to channel
    - Adds `[Extension]` prefixed status messages
    - Clears channel on fresh start
    - Preserves logs across restarts
  
  - **Process Tree Killing**:
    - Uses `killProcessTree()` utility for proper cleanup
    - Kills shell + func + dotnet worker processes
    - Prevents orphaned processes and port locks
    - 10-second timeout with forced cleanup
  
  - **Event System**:
    - `onDidChangeStatus` - Fired on every status transition
    - `onDidDiscoverEndpoints` - Fired when endpoints found
    - `onDidWriteLog` - Fired for every log chunk
    - UI layer subscribes to events for reactive updates

- **Project Registration System**:
  - `registerProject()` - Initialize project with OutputChannel
  - Projects tracked in Map for O(1) lookup
  - OutputChannels created at registration, not at start time

### Changed
- ProcessManager no longer uses Terminal API or process polling
- All process lifecycle managed through spawn events (error, exit, stdout, stderr)
- Status updates are event-driven, not poll-based
- Process cleanup is deterministic and reliable

### Fixed
- **Critical**: Eliminated false "Stopped" status from Terminal API issues
- **Critical**: Process tree now properly killed (no more orphaned processes)
- **Critical**: Port locks and DLL locks now released on stop
- **Critical**: Real PID tracking enables proper process management
- Startup failures now correctly detected and reported
- Fatal errors during startup properly transition to 'errored' status
- Process crashes detected and reported with exit codes

### Technical Details
**Why spawn() over Terminal API:**
- Terminal API: No stdout access, unreliable exit events, wrong PIDs
- spawn(): Direct stdout/stderr streams, reliable exit events, real PIDs
- Enables readiness detection, error parsing, and proper cleanup

**Process Tree Structure:**
```
shell (child.pid)
  └── func / node.exe
        └── dotnet.exe (worker)
```
- `child.pid` is shell PID (due to `shell: true`)
- `killProcessTree()` kills entire tree, not just shell
- Prevents orphaned func/dotnet processes

## [0.3.0] - 2026-03-17


### Added - Phase 3: Function Manager Simplification (REFACTOR.md Implementation)
- **Simplified FunctionManager** (`src/services/functionManager.ts`):
  - Complete rewrite to delegate all process management to ProcessManager
  - Removed all terminal-related code and dependencies
  - Removed process polling and PID discovery logic (no longer needed)
  - Removed `handleTerminalClosed()` method (Terminal API no longer used)
  - Now acts as a thin orchestration layer over ProcessManager
  - Forwards ProcessManager events to subscribers
  - Provides user-friendly notifications for start/stop/restart operations

- **Project Registration**:
  - `registerProject()` method delegates to ProcessManager
  - Projects automatically get OutputChannel created
  - No more manual terminal creation or management

- **Simplified Lifecycle Methods**:
  - `startFunction()` - Calls ProcessManager.startProcess()
  - `stopFunction()` - Calls ProcessManager.stopProcess()
  - `restartFunction()` - Stop then start with 1s delay
  - All methods provide user feedback via notifications

- **Bulk Operations**:
  - `startAllFunctions()` - Progress indicator, sequential starts
  - `stopAllFunctions()` - Progress indicator, parallel stops
  - Filters projects by running state automatically

### Changed
- FunctionManager is now ~230 lines (down from ~530 lines)
- No longer manages terminals, PIDs, or process monitoring
- All process lifecycle delegated to ProcessManager
- Status queries delegate to ProcessManager
- Disposal simplified - ProcessManager handles all cleanup

### Removed
- Terminal creation and management code
- Process monitoring intervals and polling
- PID discovery and tracking logic
- `handleTerminalClosed()` event handler
- `startProcessMonitoring()` and `stopProcessMonitoring()` methods
- `checkProcessStatus()` polling method
- All `processUtils` imports (no longer needed)

### Fixed
- TreeView now correctly handles `FunctionStatus.Errored` (was `Error`)
- Status icons properly display for all states
- Error status shows red error icon with proper theme color

### Added - Phase 4: UI and Commands (REFACTOR.md Implementation)
- **New Commands**:
  - `azureFunctionRunner.showLogs` - Opens OutputChannel for a function
    - Available for all functions (stopped or running)
    - Preserves editor focus when opening
    - Shows icon in context menu
  
  - `azureFunctionRunner.attachDebugger` - Attach debugger to running function
    - Only available when function is running
    - Opens VS Code process picker
    - Uses `coreclr` debug configuration
    - Automatically selects workspace folder
  
  - `azureFunctionRunner.startAndDebug` - One-click start and debug
    - Only available when function is stopped
    - Starts function if not running
    - Waits for 'running' status (60s timeout)
    - 2-second delay for .NET worker initialization
    - Opens process picker automatically
    - Provides clear error messages on timeout

- **Enhanced Extension Initialization**:
  - Projects now registered with ProcessManager on discovery
  - OutputChannels created immediately for all projects
  - Status change events properly forwarded to TreeView
  - Event subscription uses new event structure

- **Helper Functions**:
  - `waitForStatus()` - Waits for project to reach target status with timeout
  - `sleep()` - Simple delay helper for debugger initialization
  - Proper event subscription cleanup

### Changed
- Extension.ts updated to use new ProcessManager event structure
- Status change events now pass full project object
- Project registration happens during discovery phase
- Commands registered in package.json with proper icons and context

### Fixed
- TypeScript error with `startDebugging` null vs undefined
- Status change event handler updated for new event structure
- TreeView properly updates on all status transitions

### UI/UX Improvements
- **Context Menu Organization**:
  - Inline actions: Start/Stop/Restart (with icons)
  - Logs group: Show Logs
  - Debug group: Attach Debugger, Start & Debug
- **Command Availability**:
  - Start & Debug only shown for stopped functions
  - Attach Debugger only shown for running functions
  - Show Logs available for all functions

### Added - Phase 5: Cleanup and Documentation (REFACTOR.md Implementation Complete)
- **Documentation Updates**:
  - Comprehensive README.md updates with new features
  - Added "Key Features Explained" section covering:
    - Dedicated Log Channels usage
    - Smart Readiness Detection mechanics
    - Debugger Integration workflows
    - Robust Process Management benefits
  - Enhanced troubleshooting guide with common issues and solutions
  - Updated project structure documentation
  - Updated roadmap to reflect v0.4.0 completion

### Removed
- **Deprecated Files**:
  - `src/services/terminalManager.ts` - Completely removed (Terminal API no longer used)
  - All terminal-related code and dependencies eliminated

### Changed
- Version bumped to 0.4.0 in package.json
- README now accurately reflects spawn-based architecture
- Troubleshooting section expanded with OutputChannel-specific guidance

### Migration Notes
**Breaking Changes from v0.3.0:**
- Terminal API completely replaced with spawn-based process management
- `terminalId` field removed from FunctionProject interface
- `FunctionStatus.Error` renamed to `FunctionStatus.Errored`
- Event structure changed: status events now pass full project object

**Benefits of Migration:**
- ✅ No more false "stopped" status from Terminal API issues
- ✅ Real PIDs for reliable process tracking
- ✅ stdout/stderr parsing enables readiness detection
- ✅ Proper process tree killing prevents orphaned processes
- ✅ OutputChannels provide persistent, searchable logs
- ✅ Fatal errors detected and reported immediately
- ✅ Debugger integration with process picker

**What Stays the Same:**
- All user-facing commands work identically
- Project discovery unchanged
- TreeView UI unchanged (except better status accuracy)
- Configuration settings unchanged

- **Icons**:
  - Show Logs: `$(output)`
  - Attach Debugger: `$(debug-alt)`
  - Start & Debug: `$(debug)`


### Added - Phase 3: Robust Process Tracking
- **Hybrid PID Tracking System**: Reliable process status monitoring
  - Extracts actual function process PID (not just terminal shell PID)
  - Cross-platform process discovery (macOS/Linux via `pgrep`, Windows via `wmic`)
  - Dual tracking: event-based (immediate) + polling (safety net every 3 seconds)
  - Filters spurious `onDidCloseTerminal` events
  - Detects when user manually closes terminals
  - Detects unexpected process crashes
  
- **Process Utilities Module** (`src/utils/processUtils.ts`):
  - `isProcessRunning()`: Check if a PID is active
  - `findChildProcesses()`: Find child processes of a parent PID
  - `findFunctionProcess()`: Locate the actual func/dotnet process
  - `getProcessName()`: Get process name for debugging
  
- **Enhanced Status Accuracy**:
  - Status no longer incorrectly shows "Stopped" for running functions
  - Automatic detection of process termination
  - User notifications when functions stop unexpectedly
  - Foundation for future debugger attachment support

### Changed
- `RunningFunctionInfo` interface now tracks both terminal PID and function PID
- `FunctionManager` implements polling-based status monitoring
- `handleTerminalClosed()` verifies process is actually dead before updating status
- Improved logging with PID information for debugging

### Fixed
- **Critical**: Fixed false "Stopped" status for running functions
  - Previous issue: `onDidCloseTerminal` event fired spuriously after 30-60 seconds
  - Solution: Verify actual process PID status before updating UI
  - Now correctly distinguishes between spurious events and actual process termination

## [0.2.0] - 2026-03-17

### Added - Phase 2: Core Functionality Complete
- **Process Manager**: Full process lifecycle management for Azure Functions
  - Spawn and track `func start` processes
  - Graceful shutdown with SIGTERM, force kill with SIGKILL
  - Process exit detection and handling
  - Cleanup on extension deactivation
  
- **Terminal Manager**: VS Code terminal integration
  - Create dedicated terminals for each function
  - Automatic terminal naming (e.g., "Azure Function: MyApp")
  - Terminal cleanup on function stop
  - Terminal close event handling
  
- **Function Manager**: High-level function lifecycle orchestration
  - Start/stop/restart individual functions
  - Bulk operations (start all/stop all) with progress indicators
  - Real-time status tracking and updates
  - Process output piping to terminals
  - Status change event system
  
- **Full Function Execution**: Start/stop/restart now actually work!
  - Functions execute `func start` in their project directory
  - Output streams to VS Code terminals
  - Status updates in real-time in the tree view
  - Error handling and user notifications

### Changed
- Extension now properly manages function processes
- Tree view updates automatically when function status changes
- Deactivation now stops all running functions cleanly

## [0.1.0] - 2026-03-17

### Added - MVP Release (Phase 1)
- Initial MVP implementation
- Automatic discovery of Azure Function projects from `.sln` files
- Standalone project detection (configurable via settings)
- Side panel tree view with project organization by solution
- Visual status indicators for function state
- Manual refresh functionality
- Auto-refresh on workspace file changes
- Configuration settings for customization
- Command structure for start/stop/restart operations (UI ready)

### Fixed
- **EventEmitter Memory Leak Warning**: Fixed "MaxListenersExceededWarning" by:
  - Implementing debounced refresh to prevent multiple rapid refreshes
  - Using `vscode.Disposable.from()` to properly combine event listeners
  - Adding 500ms debounce delay to batch file system changes
  - Properly cleaning up timeout on extension deactivation
  - Removed `workspaceContains:**/*.sln` activation event (was causing duplicate activations)
  - Increased max listeners limit to 20 to accommodate TypeScript language service
  
  This resolves the warning: "Possible EventEmitter memory leak detected. 11 flagsUpdated listeners added"
  
  **Note**: The "flagsUpdated" warning is related to TypeScript's language service in VS Code extension development and is now suppressed.

### Technical Details

#### File Watcher Optimization
The extension now uses a debounced refresh pattern:
- Multiple file changes within 500ms trigger only one refresh
- Event listeners are properly grouped using `Disposable.from()`
- Timeout is cleared on extension deactivation to prevent memory leaks

#### Architecture
- **Solution Parser**: Parses Visual Studio `.sln` files
- **Project Detector**: Identifies Azure Function projects via `host.json` and SDK references
- **Project Discovery**: Coordinates workspace scanning
- **Tree View Provider**: Renders organized project hierarchy
- **Extension Entry**: Manages lifecycle and commands

### Known Limitations
- Function start/stop/restart commands show placeholder messages (execution not yet implemented)
- No process management for running functions
- No terminal integration for function logs
- Status remains "Stopped" (no real-time status updates)
- Port detection not implemented

### Coming Soon
- Full function lifecycle management (start/stop/restart)
- Terminal integration for function output
- Real-time status updates
- Process tracking and management
- Bulk operations implementation
- Port number detection and display

## Development Notes

### Building
```bash
npm install
npm run compile
```

### Running
Press F5 in VS Code to launch Extension Development Host

### Testing
Open a workspace with C# Azure Function projects and verify:
- Projects are discovered and displayed
- Tree view shows proper organization
- Refresh works correctly
- No memory leak warnings in console