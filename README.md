# Azure Function Runner

A VS Code extension that provides a streamlined interface for managing Azure Function projects within C# solutions.

## Features

- 🔍 **Automatic Discovery**: Automatically finds Azure Function projects in your workspace
- 📁 **Solution Integration**: Scans `.sln` files to discover function projects
- 🎯 **Side Panel View**: Dedicated panel showing all your function projects
- ▶️ **Full Function Control**: Start, stop, and restart functions with one click
- 🚀 **Bulk Operations**: Start or stop all functions at once with progress indicators
- 🔄 **Auto-Refresh**: Automatically updates when workspace changes
- 📋 **Dedicated Logs**: Each function has its own OutputChannel with full stdout/stderr capture
- 🔴 **Real-Time Status**: Live status updates with readiness detection from func output
- ⚡ **Robust Process Management**: Direct process control with proper cleanup and tree killing
- 🐛 **Debugger Integration**: One-click attach debugger or start & debug workflows
- 🎯 **Smart Readiness Detection**: Automatically detects when functions are ready to accept requests
- ⚠️ **Error Detection**: Catches startup failures (port conflicts, build errors) and reports clearly

## Requirements

- **VS Code**: Version 1.85.0 or higher
- **Azure Functions Core Tools**: v4.x ([Download here](https://docs.microsoft.com/azure/azure-functions/functions-run-local))
- **.NET SDK**: 6.0 or higher
- **Node.js**: 18.0 or higher (for development)

## Installation

### From Source (Development)

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to compile TypeScript
4. Press F5 to open a new VS Code window with the extension loaded

### From VSIX (Coming Soon)

The extension will be available on the VS Code Marketplace.

## Usage

### Getting Started

1. Open a workspace containing C# Azure Function projects
2. Click the Azure Function Runner icon in the Activity Bar (left sidebar)
3. The extension will automatically discover your function projects

### Managing Functions

#### Individual Functions

- **Start**: Click the play button (▶️) next to a stopped function
- **Stop**: Click the stop button (■) next to a running function
- **Restart**: Click the restart button (↻) next to any function
- **Show Logs**: Right-click any function and select "Show Logs" to view its OutputChannel
- **Attach Debugger**: Right-click a running function and select "Attach Debugger"
- **Start & Debug**: Right-click a stopped function and select "Start & Debug" for one-click debugging

#### Bulk Operations

- **Start All**: Click the "Start All" button in the toolbar
- **Stop All**: Click the "Stop All" button in the toolbar
- **Refresh**: Click the refresh button to re-scan for projects

### Project Organization

Functions are organized in the tree view:
- **Solution Groups**: Functions from `.sln` files are grouped by solution
- **Standalone Projects**: Functions not in a solution appear in a separate group

## Configuration

Access settings via `File > Preferences > Settings` and search for "Azure Function Runner":

### Available Settings

- **`azureFunctionRunner.scanStandaloneProjects`** (default: `true`)
  - Enable/disable scanning for standalone Azure Function projects

- **`azureFunctionRunner.autoRefresh`** (default: `true`)
  - Automatically refresh when workspace files change

- **`azureFunctionRunner.funcCliPath`** (default: `"func"`)
  - Path to the Azure Functions Core Tools CLI

## Project Structure

The extension expects Azure Function projects to have:
- A `host.json` file in the project root
- A `.csproj` file with Azure Functions SDK references
- Standard Azure Functions v4 structure

## Key Features Explained

### Dedicated Log Channels

Each function gets its own VS Code OutputChannel (like "Func: MyFunctionApp"). This shows:
- Extension status messages (prefixed with `[Extension]`)
- Full stdout and stderr from `func start`
- Detected HTTP endpoints with URLs
- Process exit information

**To view logs**: Right-click any function → "Show Logs"

### Smart Readiness Detection

The extension parses `func start` output in real-time to detect:
- ✅ **Readiness signals**: "Host started", "Worker process started and initialized"
- ❌ **Fatal errors**: "address already in use", "Build FAILED", port conflicts
- 🌐 **HTTP endpoints**: Automatically extracts function names, methods, and URLs

Status transitions automatically:
- `stopped` → `starting` → `running` (when ready)
- `starting` → `errored` (if startup fails)
- `running` → `errored` (if process crashes)

### Debugger Integration

**Attach Debugger** (for running functions):
- Opens VS Code's process picker
- Select the `dotnet` process running your function
- Debugger attaches to the .NET worker process

**Start & Debug** (one-click workflow):
1. Starts the function
2. Waits for "running" status (60s timeout)
3. Delays 2 seconds for .NET worker initialization
4. Opens process picker automatically

### Robust Process Management

Unlike terminal-based approaches, this extension:
- Uses `child_process.spawn()` for direct process control
- Captures real PIDs for reliable tracking
- Kills entire process tree (shell + func + dotnet worker)
- Prevents orphaned processes and port locks
- Detects crashes and reports exit codes

## Troubleshooting

### No Projects Found

- Ensure your workspace contains `.sln` files or Azure Function projects
- Check that `host.json` exists in your function project directories
- Verify Azure Functions SDK is referenced in `.csproj` files
- Try clicking the refresh button

### Functions Won't Start

- Ensure Azure Functions Core Tools v4 is installed
- Check that `func` command is available in your PATH
- Verify .NET SDK is installed
- **Check the function's OutputChannel** (right-click → Show Logs) for detailed error messages

### Port Already in Use

- The extension detects this automatically and shows "errored" status
- Check the OutputChannel for the specific port number
- Stop other processes using that port, or configure a different port in `local.settings.json`

### Function Shows "Stopped" But Port is Still Occupied

- This was a major issue in previous versions, now fixed
- The extension properly kills the entire process tree
- If you still see this, check for orphaned `func` or `dotnet` processes and kill them manually

### Debugger Won't Attach

- Ensure the function status shows "running" (green circle)
- Wait a few seconds after startup for the .NET worker to initialize
- Use "Start & Debug" instead of manual attach for more reliable workflow
- Check that you're selecting the correct `dotnet` process in the picker

### Extension Not Activating

- Check VS Code version (must be 1.85.0+)
- Look for errors in the Output panel (View > Output > Azure Function Runner)
- Try reloading VS Code window

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Run tests
npm test
```

### Project Structure

```
azure-function-runner/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── models/
│   │   └── types.ts              # Type definitions
│   ├── services/
│   │   ├── processManager.ts     # Process lifecycle management
│   │   ├── functionManager.ts    # High-level function orchestration
│   │   ├── solutionParser.ts     # Solution file parser
│   │   ├── projectDetector.ts    # Azure Function detector
│   │   └── projectDiscovery.ts   # Project discovery service
│   ├── utils/
│   │   ├── outputParser.ts       # Parse func start output
│   │   ├── processKiller.ts      # Platform-specific process tree killing
│   │   └── processUtils.ts       # Process utilities
│   └── views/
│       └── functionTreeProvider.ts # Tree view provider
├── resources/
│   └── icon.svg                  # Extension icon
├── package.json                  # Extension manifest
└── tsconfig.json                 # TypeScript config
```

## Roadmap

### Version 0.4.0 (Current - Major Refactor)
- ✅ Complete rewrite using `child_process.spawn()` instead of Terminal API
- ✅ Real-time stdout/stderr parsing for readiness detection
- ✅ Dedicated OutputChannel per function with full logs
- ✅ Robust process tree killing (no more orphaned processes)
- ✅ Smart error detection (port conflicts, build failures)
- ✅ HTTP endpoint extraction and display
- ✅ Debugger integration (attach and start & debug)
- ✅ Event-driven status updates

### Upcoming Features
- Automatic PID resolution for debugger (eliminate process picker)
- Custom start arguments per project
- Performance metrics and startup time tracking
- Function endpoint testing (send HTTP requests)
- Multi-workspace support
- Function templates and scaffolding

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT License - See LICENSE file for details

## Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/your-repo/azure-function-runner/issues) page.

## Acknowledgments

- Built with the VS Code Extension API
- Inspired by the need for better Azure Functions development workflow
- Thanks to the Azure Functions team for the excellent Core Tools

---

**Enjoy managing your Azure Functions!** ⚡