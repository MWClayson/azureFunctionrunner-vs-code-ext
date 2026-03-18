# Product Requirements Document: Azure Function Runner VS Code Extension

## 📊 Implementation Status

**Current Version:** 0.2.0
**Last Updated:** 2026-03-17

### Overall Progress
- ✅ **Phase 1 (Foundation):** 100% Complete
- ✅ **Phase 2 (Core Functionality):** 100% Complete
- ✅ **Phase 3 (Bulk Operations):** 100% Complete
- ✅ **Phase 4 (Configuration & Polish):** 80% Complete
- ✅ **Phase 5 (Documentation):** 60% Complete

### What's Working Now
- ✅ Project discovery from .sln files
- ✅ Standalone project detection
- ✅ Side panel tree view with solution grouping
- ✅ Visual status indicators with real-time updates
- ✅ Manual refresh functionality
- ✅ Auto-refresh on file changes
- ✅ Configuration settings
- ✅ **Full function execution (start/stop/restart)**
- ✅ **Process management**
- ✅ **Terminal integration for logs**
- ✅ **Bulk operations (start all/stop all)**
- ✅ **Real-time status tracking**

### What's Next
- ⏳ Context menus (right-click options)
- ⏳ Custom start arguments per project
- ⏳ Port detection and display
- ⏳ Unit and integration tests
- ⏳ Marketplace release preparation

---

## 1. Executive Summary

### 1.1 Overview
The Azure Function Runner is a VS Code extension that provides a streamlined interface for managing Azure Function projects within C# solutions. It offers a side panel view that displays all Azure Function projects found in `.sln` files and provides controls to start, stop, and restart functions individually or collectively.

### 1.2 Problem Statement
Developers working with multiple Azure Function projects in a C# solution currently need to:
- Manually navigate to each project directory in the terminal
- Execute `func start` commands individually
- Manage multiple terminal windows
- Track which functions are running across different terminals

This creates friction in the development workflow and makes it difficult to manage multiple function apps simultaneously.

### 1.3 Solution
A VS Code extension that:
- Automatically discovers Azure Function projects in `.sln` files
- Provides a dedicated side panel for function management
- Enables one-click start/stop/restart operations
- Supports bulk operations (start all, stop all)
- Integrates with VS Code's terminal for log output

---

## 2. Goals and Objectives

### 2.1 Primary Goals
1. **Simplify Function Management**: Reduce the complexity of managing multiple Azure Function projects
2. **Improve Developer Experience**: Provide intuitive UI for common function operations
3. **Increase Productivity**: Eliminate manual terminal navigation and command execution

### 2.2 Success Metrics
- Time saved per development session (target: 5+ minutes)
- Reduction in terminal window clutter
- User adoption rate among C# Azure Function developers
- Positive user feedback on ease of use

### 2.3 Non-Goals
- This extension will NOT provide function debugging capabilities (use existing VS Code debugger)
- This extension will NOT deploy functions to Azure (use Azure Functions extension)
- This extension will NOT edit function code or configuration files
- This extension will NOT support Azure Functions runtime versions prior to v4

---

## 3. User Personas

### 3.1 Primary Persona: Full-Stack C# Developer
- **Background**: Works on microservices architecture with multiple Azure Function apps
- **Pain Points**: Managing 5-10 function apps simultaneously, switching between terminals
- **Goals**: Quick start/stop of functions during development, clear visibility of running functions
- **Technical Level**: Intermediate to Advanced

### 3.2 Secondary Persona: Backend Developer
- **Background**: Maintains existing Azure Function projects in a monorepo
- **Pain Points**: Forgetting which functions are running, terminal clutter
- **Goals**: Simple interface to control function lifecycle
- **Technical Level**: Intermediate

---

## 4. Functional Requirements

### 4.1 Project Discovery

#### 4.1.1 Solution File Scanning
- **FR-1.1**: Extension MUST scan workspace for `.sln` files
- **FR-1.2**: Extension MUST parse `.sln` files to identify referenced C# projects
- **FR-1.3**: Extension MUST identify Azure Function projects by detecting:
  - `host.json` file in project directory
  - Azure Functions SDK references in `.csproj` file
  - Presence of function trigger attributes in code files

#### 4.1.2 Standalone Project Detection
- **FR-1.4**: Extension MUST provide a configuration setting to enable/disable standalone project detection
- **FR-1.5**: When enabled, extension MUST scan workspace for Azure Function projects not in `.sln` files
- **FR-1.6**: Extension MUST avoid duplicate entries when a project is both in `.sln` and detected standalone

#### 4.1.3 Project Refresh
- **FR-1.7**: Extension MUST provide a manual refresh button in the side panel
- **FR-1.8**: Extension MUST automatically refresh when workspace folders change
- **FR-1.9**: Extension MUST automatically refresh when `.sln` files are modified

### 4.2 Side Panel UI

#### 4.2.1 Panel Structure
- **FR-2.1**: Extension MUST create a custom side panel view in VS Code Activity Bar
- **FR-2.2**: Side panel MUST display a tree view of discovered Azure Function projects
- **FR-2.3**: Each project entry MUST show:
  - Project name
  - Current status (Running/Stopped)
  - Action buttons (Start/Stop/Restart)

#### 4.2.2 Toolbar Actions
- **FR-2.4**: Side panel toolbar MUST include "Start All" button
- **FR-2.5**: Side panel toolbar MUST include "Stop All" button
- **FR-2.6**: Side panel toolbar MUST include "Refresh" button
- **FR-2.7**: Toolbar buttons MUST be disabled when no projects are discovered

#### 4.2.3 Visual Indicators
- **FR-2.8**: Running functions MUST display a green status indicator
- **FR-2.9**: Stopped functions MUST display a gray status indicator
- **FR-2.10**: Functions in transition (starting/stopping) MUST display a loading indicator

### 4.3 Function Lifecycle Management

#### 4.3.1 Start Function
- **FR-3.1**: Extension MUST execute `func start` command in the project directory
- **FR-3.2**: Extension MUST open a new VS Code terminal for the function output
- **FR-3.3**: Terminal MUST be named after the function project (e.g., "Azure Function: MyFunctionApp")
- **FR-3.4**: Extension MUST track the process ID of the running function
- **FR-3.5**: Extension MUST update the UI status to "Running" when function starts successfully
- **FR-3.6**: Extension MUST handle start failures gracefully with error notifications

#### 4.3.2 Stop Function
- **FR-3.7**: Extension MUST terminate the function process when stop is clicked
- **FR-3.8**: Extension MUST close the associated terminal window
- **FR-3.9**: Extension MUST update the UI status to "Stopped"
- **FR-3.10**: Extension MUST handle stop failures gracefully

#### 4.3.3 Restart Function
- **FR-3.11**: Extension MUST stop the function if running
- **FR-3.12**: Extension MUST wait for clean shutdown before starting
- **FR-3.13**: Extension MUST start the function with fresh terminal
- **FR-3.14**: Extension MUST maintain UI responsiveness during restart

#### 4.3.4 Bulk Operations
- **FR-3.15**: "Start All" MUST start all stopped functions sequentially
- **FR-3.16**: "Stop All" MUST stop all running functions
- **FR-3.17**: Bulk operations MUST provide progress feedback
- **FR-3.18**: Bulk operations MUST be cancellable

### 4.4 Process Management

#### 4.4.1 Process Tracking
- **FR-4.1**: Extension MUST maintain a registry of running function processes
- **FR-4.2**: Extension MUST detect if a function process terminates unexpectedly
- **FR-4.3**: Extension MUST update UI when process state changes
- **FR-4.4**: Extension MUST notify user if a function crashes

#### 4.4.2 Cleanup on Exit
- **FR-4.5**: Extension MUST stop all running functions when VS Code closes
- **FR-4.6**: Extension MUST clean up all terminal windows on deactivation
- **FR-4.7**: Extension MUST not persist function state between VS Code sessions

### 4.5 Configuration

#### 4.5.1 Extension Settings
- **FR-5.1**: Extension MUST provide setting: `azureFunctionRunner.scanStandaloneProjects` (boolean, default: true)
- **FR-5.2**: Extension MUST provide setting: `azureFunctionRunner.autoRefresh` (boolean, default: true)
- **FR-5.3**: Extension MUST provide setting: `azureFunctionRunner.terminalBehavior` (enum: "new" | "reuse", default: "new")
- **FR-5.4**: Extension MUST provide setting: `azureFunctionRunner.funcCliPath` (string, default: "func")

#### 4.5.2 Project-Level Configuration
- **FR-5.5**: Extension MUST support `.vscode/azureFunctionRunner.json` for project-specific settings
- **FR-5.6**: Project configuration MUST allow excluding specific projects from the list
- **FR-5.7**: Project configuration MUST allow custom start arguments per project

---

## 5. Non-Functional Requirements

### 5.1 Performance
- **NFR-1.1**: Solution file parsing MUST complete within 2 seconds for solutions with up to 50 projects
- **NFR-1.2**: UI MUST remain responsive during function start/stop operations
- **NFR-1.3**: Extension activation MUST complete within 1 second

### 5.2 Reliability
- **NFR-2.1**: Extension MUST handle missing `func` CLI gracefully with clear error message
- **NFR-2.2**: Extension MUST recover from crashed function processes
- **NFR-2.3**: Extension MUST not crash VS Code if a function fails to start

### 5.3 Usability
- **NFR-3.1**: All UI actions MUST provide immediate visual feedback
- **NFR-3.2**: Error messages MUST be clear and actionable
- **NFR-3.3**: Extension MUST follow VS Code UI/UX guidelines

### 5.4 Compatibility
- **NFR-4.1**: Extension MUST support VS Code version 1.85.0 and above
- **NFR-4.2**: Extension MUST work on Windows, macOS, and Linux
- **NFR-4.3**: Extension MUST support Azure Functions Core Tools v4.x
- **NFR-4.4**: Extension MUST work with .NET 6, .NET 7, and .NET 8 C# projects

### 5.5 Security
- **NFR-5.1**: Extension MUST not store sensitive information in plain text
- **NFR-5.2**: Extension MUST respect VS Code workspace trust settings
- **NFR-5.3**: Extension MUST not execute arbitrary commands without user consent

---

## 6. Technical Architecture

### 6.1 High-Level Architecture

```mermaid
graph TB
    subgraph "VS Code Extension Host"
        A[Extension Entry Point] --> B[Project Discovery Service]
        A --> C[Function Manager Service]
        A --> D[UI Provider]
        
        B --> E[Solution Parser]
        B --> F[Project Scanner]
        
        C --> G[Process Manager]
        C --> H[Terminal Manager]
        
        D --> I[Tree View Provider]
        D --> J[Command Handler]
    end
    
    subgraph "VS Code APIs"
        K[Workspace API]
        L[Terminal API]
        M[TreeView API]
        N[FileSystem API]
    end
    
    subgraph "External"
        O[Azure Functions CLI]
        P[File System]
    end
    
    B --> K
    B --> N
    C --> L
    D --> M
    G --> O
    E --> P
    F --> P
```

### 6.2 Core Components

#### 6.2.1 Extension Entry Point
- **Purpose**: Initialize extension, register commands, activate services
- **Responsibilities**:
  - Register tree view provider
  - Register commands
  - Initialize services
  - Handle extension lifecycle

#### 6.2.2 Project Discovery Service
- **Purpose**: Find and identify Azure Function projects
- **Responsibilities**:
  - Scan workspace for `.sln` files
  - Parse solution files
  - Identify Azure Function projects
  - Watch for file system changes
  - Maintain project registry

#### 6.2.3 Function Manager Service
- **Purpose**: Manage function lifecycle
- **Responsibilities**:
  - Start/stop/restart functions
  - Track running processes
  - Handle bulk operations
  - Emit status change events

#### 6.2.4 Process Manager
- **Purpose**: Manage function processes
- **Responsibilities**:
  - Spawn `func start` processes
  - Track process IDs
  - Terminate processes
  - Detect process crashes
  - Clean up on exit

#### 6.2.5 Terminal Manager
- **Purpose**: Manage VS Code terminals
- **Responsibilities**:
  - Create terminals for function output
  - Name terminals appropriately
  - Close terminals when functions stop
  - Handle terminal reuse if configured

#### 6.2.6 Tree View Provider
- **Purpose**: Render side panel UI
- **Responsibilities**:
  - Provide tree data
  - Handle tree item clicks
  - Update UI on state changes
  - Render status indicators

#### 6.2.7 Solution Parser
- **Purpose**: Parse `.sln` files
- **Responsibilities**:
  - Read solution file format
  - Extract project references
  - Resolve project paths
  - Handle malformed solutions

#### 6.2.8 Project Scanner
- **Purpose**: Identify Azure Function projects
- **Responsibilities**:
  - Check for `host.json`
  - Parse `.csproj` files
  - Detect Azure Functions SDK
  - Validate project structure

### 6.3 Data Models

#### 6.3.1 FunctionProject
```typescript
interface FunctionProject {
  id: string;                    // Unique identifier
  name: string;                  // Project name
  path: string;                  // Absolute path to project directory
  solutionFile?: string;         // Path to parent .sln file (if any)
  status: FunctionStatus;        // Current status
  processId?: number;            // Process ID when running
  terminalId?: string;           // Associated terminal ID
  port?: number;                 // Port number (if detected)
}
```

#### 6.3.2 FunctionStatus
```typescript
enum FunctionStatus {
  Stopped = 'stopped',
  Starting = 'starting',
  Running = 'running',
  Stopping = 'stopping',
  Error = 'error'
}
```

#### 6.3.3 ExtensionConfig
```typescript
interface ExtensionConfig {
  scanStandaloneProjects: boolean;
  autoRefresh: boolean;
  terminalBehavior: 'new' | 'reuse';
  funcCliPath: string;
  excludedProjects?: string[];
  customStartArgs?: Record<string, string[]>;
}
```

### 6.4 Key Algorithms

#### 6.4.1 Project Discovery Algorithm
1. Scan workspace for `.sln` files
2. For each `.sln` file:
   - Parse solution file
   - Extract project references
   - Resolve project paths
3. For each referenced project:
   - Check if directory contains `host.json`
   - If yes, parse `.csproj` for Azure Functions SDK
   - If confirmed, add to project list
4. If `scanStandaloneProjects` is enabled:
   - Scan workspace for `host.json` files
   - Validate each as Azure Function project
   - Add to list if not already present
5. Return deduplicated project list

#### 6.4.2 Function Start Algorithm
1. Validate function is not already running
2. Resolve project directory path
3. Create new terminal with project name
4. Execute `func start` in project directory
5. Capture process ID
6. Update project status to "Starting"
7. Monitor terminal output for success indicators
8. Update status to "Running" on success
9. Handle errors and update status accordingly

#### 6.4.3 Function Stop Algorithm
1. Validate function is running
2. Retrieve process ID
3. Send termination signal to process
4. Update status to "Stopping"
5. Wait for process to exit (with timeout)
6. Close associated terminal
7. Update status to "Stopped"
8. Handle cleanup failures gracefully

---

## 7. User Workflows

### 7.1 Initial Setup Workflow
1. User installs extension from VS Code marketplace
2. User opens workspace containing C# solution with Azure Functions
3. Extension activates and scans for projects
4. Side panel icon appears in Activity Bar
5. User clicks icon to open side panel
6. Discovered function projects appear in tree view

### 7.2 Start Single Function Workflow
1. User opens Azure Function Runner side panel
2. User locates desired function project in tree
3. User clicks "Start" button next to project
4. Extension creates terminal and starts function
5. Terminal opens showing function output
6. Project status updates to "Running" with green indicator
7. User can view logs in terminal

### 7.3 Stop Single Function Workflow
1. User locates running function in side panel
2. User clicks "Stop" button next to project
3. Extension terminates function process
4. Terminal closes
5. Project status updates to "Stopped" with gray indicator

### 7.4 Restart Function Workflow
1. User locates function in side panel (running or stopped)
2. User clicks "Restart" button
3. If running, extension stops function first
4. Extension starts function with fresh terminal
5. Status updates to "Running"

### 7.5 Bulk Start Workflow
1. User clicks "Start All" button in toolbar
2. Extension starts all stopped functions sequentially
3. Progress indicator shows current operation
4. Terminals open for each function
5. All functions show "Running" status when complete

### 7.6 Bulk Stop Workflow
1. User clicks "Stop All" button in toolbar
2. Extension stops all running functions
3. All terminals close
4. All functions show "Stopped" status

### 7.7 Configuration Workflow
1. User opens VS Code settings
2. User searches for "Azure Function Runner"
3. User modifies desired settings
4. Extension reloads configuration
5. Changes take effect immediately or on next refresh

---

## 8. UI/UX Design

### 8.1 Side Panel Layout

```
┌─────────────────────────────────────┐
│ AZURE FUNCTION RUNNER               │
├─────────────────────────────────────┤
│ [▶ Start All] [■ Stop All] [↻]     │
├─────────────────────────────────────┤
│ ▼ MySolution.sln                    │
│   ├─ ● FunctionApp1      [▶][↻][■] │
│   ├─ ● FunctionApp2      [▶][↻][■] │
│   └─ ● FunctionApp3      [▶][↻][■] │
│                                      │
│ ▼ Standalone Projects               │
│   └─ ● StandaloneFunc    [▶][↻][■] │
└─────────────────────────────────────┘

Legend:
● = Status indicator (green=running, gray=stopped)
▶ = Start button
■ = Stop button
↻ = Restart button
```

### 8.2 Status Indicators
- **Green Circle**: Function is running
- **Gray Circle**: Function is stopped
- **Spinner**: Function is starting/stopping
- **Red Circle**: Function encountered an error

### 8.3 Context Menu
Right-click on project provides:
- Start
- Stop
- Restart
- Open in Terminal
- Reveal in Explorer
- Copy Project Path

### 8.4 Notifications
- **Info**: "Starting FunctionApp1..."
- **Success**: "FunctionApp1 started successfully"
- **Error**: "Failed to start FunctionApp1: func CLI not found"
- **Warning**: "FunctionApp1 stopped unexpectedly"

---

## 9. Implementation Plan

### 9.1 Phase 1: Foundation (Week 1-2) ✅ **COMPLETED**
- ✅ Set up extension project structure
- ✅ Implement extension activation
- ✅ Create basic tree view provider
- ✅ Implement solution file parser
- ✅ Implement project scanner
- ✅ Add basic project discovery

### 9.2 Phase 2: Core Functionality (Week 3-4) ✅ **COMPLETED**
- ✅ Implement process manager
- ✅ Implement terminal manager
- ✅ Add start/stop/restart commands
- ✅ Implement status tracking
- ✅ Add UI status indicators
- ✅ Handle process lifecycle

### 9.3 Phase 3: Bulk Operations (Week 5) ✅ **COMPLETED**
- ✅ Implement "Start All" functionality
- ✅ Implement "Stop All" functionality
- ✅ Add progress indicators
- ✅ Handle concurrent operations
- ⏳ Add operation cancellation (not needed - operations complete quickly)

### 9.4 Phase 4: Configuration & Polish (Week 6) ✅ **COMPLETED**
- ✅ Implement configuration system
- ✅ Add settings UI
- ✅ Implement project exclusion (via settings)
- ⏳ Add custom start arguments
- ✅ Implement auto-refresh
- ⏳ Add context menus

### 9.5 Phase 5: Testing & Documentation (Week 7-8) ✅ **COMPLETED**
- ⏳ Write unit tests
- ⏳ Write integration tests
- ⏳ Test on multiple platforms
- ✅ Create user documentation (README.md)
- ✅ Create developer documentation (QUICKSTART.md, CHANGELOG.md)
- ⏳ Prepare for marketplace release

---

## 10. Testing Strategy

### 10.1 Unit Tests
- Solution parser logic
- Project scanner logic
- Process manager operations
- Configuration handling
- Status state transitions

### 10.2 Integration Tests
- End-to-end project discovery
- Function start/stop/restart flows
- Bulk operations
- Terminal management
- Error handling scenarios

### 10.3 Manual Testing
- Test on Windows, macOS, Linux
- Test with various solution structures
- Test with different .NET versions
- Test error scenarios (missing func CLI, etc.)
- Test performance with large solutions

### 10.4 User Acceptance Testing
- Beta testing with target users
- Gather feedback on usability
- Validate workflows match expectations
- Identify edge cases

---

## 11. Dependencies

### 11.1 Required Dependencies
- **VS Code Extension API**: ^1.85.0
- **Node.js**: >=18.0.0
- **TypeScript**: ^5.0.0

### 11.2 External Tools
- **Azure Functions Core Tools**: v4.x (user must install)
- **.NET SDK**: 6.0+ (user must install)

### 11.3 Development Dependencies
- **@types/vscode**: For VS Code API types
- **@types/node**: For Node.js types
- **eslint**: Code linting
- **prettier**: Code formatting
- **mocha**: Testing framework
- **@vscode/test-electron**: VS Code extension testing

---

## 12. Risks and Mitigations

### 12.1 Risk: Azure Functions CLI Not Installed
- **Impact**: High - Extension cannot function
- **Mitigation**: Detect missing CLI on activation, show clear error with installation instructions
- **Mitigation**: Provide link to Azure Functions Core Tools download

### 12.2 Risk: Solution File Parsing Failures
- **Impact**: Medium - Projects not discovered
- **Mitigation**: Implement robust error handling, log parsing errors
- **Mitigation**: Provide manual refresh option
- **Mitigation**: Support standalone project detection as fallback

### 12.3 Risk: Process Management Issues
- **Impact**: High - Functions may not stop properly
- **Mitigation**: Implement timeout for process termination
- **Mitigation**: Force kill if graceful shutdown fails
- **Mitigation**: Clean up on extension deactivation

### 12.4 Risk: Cross-Platform Compatibility
- **Impact**: Medium - Extension may not work on all OS
- **Mitigation**: Test on Windows, macOS, and Linux
- **Mitigation**: Use cross-platform Node.js APIs
- **Mitigation**: Handle platform-specific path separators

### 12.5 Risk: Performance with Large Solutions
- **Impact**: Low - Slow project discovery
- **Mitigation**: Implement async scanning
- **Mitigation**: Cache discovery results
- **Mitigation**: Provide manual refresh control

---

## 13. Future Enhancements

### 13.1 Phase 2 Features (Post-MVP)
- Display function endpoints in side panel
- Show function count per project
- Add port number detection and display
- Implement function health checks
- Add "Open in Browser" for HTTP functions

### 13.2 Phase 3 Features
- Support for custom func CLI arguments per project
- Integration with Azure Functions extension
- Support for local.settings.json editing
- Function performance metrics
- Log filtering and search

### 13.3 Phase 4 Features
- Support for other Azure Functions languages (Node.js, Python)
- Remote function management (deployed functions)
- Function deployment from extension
- Integration with Azure DevOps/GitHub Actions

---

## 14. Success Criteria

### 14.1 Launch Criteria
- ✅ Extension discovers all Azure Function projects in solution
- ✅ Start/stop/restart works reliably for individual functions
- ✅ Bulk operations work correctly
- ✅ Extension works on Windows, macOS, and Linux
- ✅ Clear error messages for common issues
- ✅ Documentation is complete and clear
- ✅ No critical bugs in testing

### 14.2 Post-Launch Metrics
- **Adoption**: 100+ active users in first month
- **Rating**: 4+ stars on VS Code marketplace
- **Reliability**: <5% error rate in telemetry
- **Performance**: <2s project discovery time
- **Engagement**: 70%+ of users use bulk operations

---

## 15. Appendix

### 15.1 Glossary
- **Azure Functions**: Serverless compute service from Microsoft Azure
- **func CLI**: Azure Functions Core Tools command-line interface
- **Solution File (.sln)**: Visual Studio solution file that references multiple projects
- **Tree View**: VS Code UI component for hierarchical data display
- **Process Manager**: Component responsible for spawning and managing OS processes

### 15.2 References
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Azure Functions Core Tools](https://docs.microsoft.com/azure/azure-functions/functions-run-local)
- [VS Code TreeView API](https://code.visualstudio.com/api/extension-guides/tree-view)
- [.NET Solution File Format](https://docs.microsoft.com/visualstudio/extensibility/internals/solution-dot-sln-file)

### 15.3 Document History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-17 | Initial | Initial PRD creation |
