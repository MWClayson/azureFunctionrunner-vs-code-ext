# Quick Start Guide - Azure Function Runner MVP

## What's Implemented (MVP)

The MVP includes:
- ✅ Automatic discovery of Azure Function projects from `.sln` files
- ✅ Standalone project detection (configurable)
- ✅ Side panel tree view with project organization
- ✅ Visual status indicators
- ✅ Refresh functionality
- ✅ Command structure for start/stop/restart (UI ready, execution pending)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Compile the Extension

```bash
npm run compile
```

### 3. Run the Extension

Press `F5` in VS Code to open a new Extension Development Host window with the extension loaded.

### 4. Test with Your Projects

1. Open a workspace containing:
   - C# solution files (`.sln`)
   - Azure Function projects with `host.json`
   - Projects referencing Azure Functions SDK

2. Click the Azure Function Runner icon in the Activity Bar (left sidebar)

3. Your function projects should appear in the tree view, organized by solution

## What You'll See

### Tree View Structure

```
AZURE FUNCTION RUNNER
├─ [▶ Start All] [■ Stop All] [↻ Refresh]
├─ MySolution.sln
│  ├─ ○ FunctionApp1 - Stopped
│  ├─ ○ FunctionApp2 - Stopped
│  └─ ○ FunctionApp3 - Stopped
└─ Standalone Projects
   └─ ○ StandaloneFunc - Stopped
```

### Status Indicators

- **○ Stopped** - Gray circle, function is not running
- **● Running** - Green circle, function is running (not yet implemented)
- **⟳ Starting...** - Spinner, function is starting (not yet implemented)
- **✗ Error** - Red circle, function encountered an error (not yet implemented)

## Testing the MVP

### Test Project Discovery

1. Create a test C# solution with Azure Function projects
2. Open the workspace in the Extension Development Host
3. Open the Azure Function Runner panel
4. Verify all function projects are discovered and displayed

### Test Refresh

1. Add a new Azure Function project to your solution
2. Click the Refresh button in the panel toolbar
3. Verify the new project appears

### Test Configuration

1. Open Settings (Cmd/Ctrl + ,)
2. Search for "Azure Function Runner"
3. Toggle "Scan Standalone Projects"
4. Click Refresh to see the effect

## What's NOT Yet Implemented

The following features are planned but not yet implemented:

- ❌ **Function Start/Stop/Restart**: Commands are registered but don't execute `func start` yet
- ❌ **Terminal Integration**: No terminal output for running functions
- ❌ **Process Management**: No tracking of running function processes
- ❌ **Status Updates**: Status remains "Stopped" (no real-time updates)
- ❌ **Port Detection**: Port numbers not detected or displayed

## Next Steps for Full Implementation

### Phase 1: Process Management (Priority)

Create `src/services/processManager.ts`:
- Spawn `func start` processes
- Track process IDs
- Handle process termination
- Detect crashes

### Phase 2: Terminal Integration

Create `src/services/terminalManager.ts`:
- Create VS Code terminals for function output
- Name terminals appropriately
- Close terminals when functions stop

### Phase 3: Status Management

Update `src/services/functionManager.ts`:
- Track function status in real-time
- Update tree view when status changes
- Handle errors and display in UI

### Phase 4: Bulk Operations

Implement in `src/extension.ts`:
- Sequential start/stop of multiple functions
- Progress indicators
- Error handling for bulk operations

## Troubleshooting

### Extension Won't Activate

- Check the Debug Console for errors
- Verify all TypeScript files compiled successfully
- Try reloading the Extension Development Host window

### No Projects Found

- Ensure your workspace has `.sln` files
- Verify Azure Function projects have `host.json`
- Check that `.csproj` files reference Azure Functions SDK
- Look at the Debug Console for parsing errors

### Changes Not Reflected

- Run `npm run compile` after making code changes
- Reload the Extension Development Host window (Cmd/Ctrl + R)

## Development Workflow

1. Make code changes in `src/`
2. Run `npm run compile` (or use `npm run watch` for auto-compile)
3. Reload Extension Development Host (Cmd/Ctrl + R)
4. Test your changes

## File Structure

```
azure-function-runner/
├── src/
│   ├── extension.ts                    # Main entry point
│   ├── models/
│   │   └── types.ts                    # Type definitions
│   ├── services/
│   │   ├── solutionParser.ts           # Parses .sln files
│   │   ├── projectDetector.ts          # Detects Azure Function projects
│   │   └── projectDiscovery.ts         # Coordinates discovery
│   └── views/
│       └── functionTreeProvider.ts     # Tree view UI
├── out/                                # Compiled JavaScript (generated)
├── resources/
│   └── icon.svg                        # Extension icon
├── package.json                        # Extension manifest
├── tsconfig.json                       # TypeScript config
└── README.md                           # User documentation
```

## Contributing to Full Implementation

If you want to implement the remaining features:

1. **Start with Process Manager**: This is the foundation for function execution
2. **Add Terminal Manager**: Integrate with VS Code terminals
3. **Update Extension Commands**: Wire up the start/stop/restart logic
4. **Test Thoroughly**: Test on Windows, macOS, and Linux

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Azure Functions Core Tools](https://docs.microsoft.com/azure/azure-functions/functions-run-local)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

---

**Current Status**: MVP Complete - Project Discovery & UI ✅
**Next Milestone**: Function Execution Implementation 🚧