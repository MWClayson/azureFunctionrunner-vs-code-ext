import * as vscode from 'vscode';
import { FunctionTreeProvider, FunctionTreeItem } from './views/functionTreeProvider';
import { ProjectDiscoveryService } from './services/projectDiscovery';
import { FunctionManager } from './services/functionManager';
import { FunctionProject, FunctionStatus } from './models/types';

let treeProvider: FunctionTreeProvider;
let discoveryService: ProjectDiscoveryService;
let functionManager: FunctionManager;
let refreshTimeout: NodeJS.Timeout | undefined;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
    // Suppress the MaxListenersExceededWarning from TypeScript language service
    // This is a known issue in VS Code extension development
    process.setMaxListeners(20);
    
    console.log('Azure Function Runner extension is now active');

    // Initialize services
    discoveryService = new ProjectDiscoveryService();
    functionManager = new FunctionManager();
    treeProvider = new FunctionTreeProvider();

    // Listen for status changes and update tree view
    functionManager.onStatusChange((event) => {
        treeProvider.updateProjectStatus(event.project.id, event.project.status);
    });

    // Register tree view
    const treeView = vscode.window.createTreeView('azureFunctionRunner.functionsView', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });

    context.subscriptions.push(treeView);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('azureFunctionRunner.refresh', async () => {
            await refreshProjects();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('azureFunctionRunner.startFunction', async (item: FunctionTreeItem) => {
            if (item && item.project) {
                await startFunction(item.project);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('azureFunctionRunner.stopFunction', async (item: FunctionTreeItem) => {
            if (item && item.project) {
                await stopFunction(item.project);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('azureFunctionRunner.restartFunction', async (item: FunctionTreeItem) => {
            if (item && item.project) {
                await restartFunction(item.project);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('azureFunctionRunner.startAll', async () => {
            await startAllFunctions();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('azureFunctionRunner.stopAll', async () => {
            await stopAllFunctions();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('azureFunctionRunner.showLogs', async (item: FunctionTreeItem) => {
            if (item && item.project) {
                await showLogs(item.project);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('azureFunctionRunner.attachDebugger', async (item: FunctionTreeItem) => {
            if (item && item.project) {
                await attachDebugger(item.project);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('azureFunctionRunner.startAndDebug', async (item: FunctionTreeItem) => {
            if (item && item.project) {
                await startAndDebug(item.project);
            }
        })
    );

    // Watch for workspace changes
    const config = vscode.workspace.getConfiguration('azureFunctionRunner');
    const autoRefresh = config.get<boolean>('autoRefresh', true);

    if (autoRefresh) {
        // Create a debounced refresh handler to avoid multiple rapid refreshes
        const debouncedRefresh = () => {
            if (refreshTimeout) {
                clearTimeout(refreshTimeout);
            }
            refreshTimeout = setTimeout(() => {
                refreshProjects();
            }, 500); // Wait 500ms after last change before refreshing
        };

        // Watch for solution file changes
        const slnWatcher = vscode.workspace.createFileSystemWatcher('**/*.sln');
        const slnDisposable = vscode.Disposable.from(
            slnWatcher.onDidCreate(debouncedRefresh),
            slnWatcher.onDidChange(debouncedRefresh),
            slnWatcher.onDidDelete(debouncedRefresh),
            slnWatcher
        );
        context.subscriptions.push(slnDisposable);

        // Watch for host.json changes (Azure Function projects)
        const hostJsonWatcher = vscode.workspace.createFileSystemWatcher('**/host.json');
        const hostJsonDisposable = vscode.Disposable.from(
            hostJsonWatcher.onDidCreate(debouncedRefresh),
            hostJsonWatcher.onDidDelete(debouncedRefresh),
            hostJsonWatcher
        );
        context.subscriptions.push(hostJsonDisposable);
    }

    // Initial project discovery
    await refreshProjects();

    // Show welcome message
    vscode.window.showInformationMessage('Azure Function Runner is ready!');
}

/**
 * Extension deactivation
 */
export async function deactivate() {
    console.log('Azure Function Runner extension is deactivating');
    
    // Clear any pending refresh timeout
    if (refreshTimeout) {
        clearTimeout(refreshTimeout);
    }
    
    // Stop all running functions and cleanup
    if (functionManager) {
        await functionManager.dispose();
    }
}

/**
 * Refresh the list of projects
 */
async function refreshProjects(): Promise<void> {
    try {
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: 'Discovering Azure Function projects...',
                cancellable: false
            },
            async () => {
                const projects = await discoveryService.discoverProjects();
                
                // Register all projects with the function manager
                for (const project of projects) {
                    functionManager.registerProject(project);
                }
                
                treeProvider.updateProjects(projects);

                if (projects.length === 0) {
                    vscode.window.showInformationMessage(
                        'No Azure Function projects found in workspace'
                    );
                } else {
                    console.log(`Discovered ${projects.length} Azure Function project(s)`);
                }
            }
        );
    } catch (error) {
        console.error('Error refreshing projects:', error);
        vscode.window.showErrorMessage('Failed to discover Azure Function projects');
    }
}

/**
 * Start a function project
 */
async function startFunction(project: FunctionProject): Promise<void> {
    await functionManager.startFunction(project);
}

/**
 * Stop a function project
 */
async function stopFunction(project: FunctionProject): Promise<void> {
    await functionManager.stopFunction(project);
}

/**
 * Restart a function project
 */
async function restartFunction(project: FunctionProject): Promise<void> {
    await functionManager.restartFunction(project);
}

/**
 * Start all function projects
 */
async function startAllFunctions(): Promise<void> {
    const projects = treeProvider.getProjects();
    await functionManager.startAllFunctions(projects);
}

/**
 * Stop all function projects
 */
async function stopAllFunctions(): Promise<void> {
    const projects = treeProvider.getProjects();
    await functionManager.stopAllFunctions(projects);
}

/**
 * Show logs for a function project
 */
async function showLogs(project: FunctionProject): Promise<void> {
    if (project.outputChannel) {
        // true = preserveFocus: the OutputChannel panel opens but the editor retains focus
        project.outputChannel.show(true);
    } else {
        vscode.window.showWarningMessage(`No logs available for ${project.name}`);
    }
}

/**
 * Attach debugger to a running function (automatically using PID)
 */
async function attachDebugger(project: FunctionProject): Promise<void> {
    if (project.status !== FunctionStatus.Running) {
        vscode.window.showWarningMessage(
            `Cannot attach debugger: "${project.name}" is not running.`
        );
        return;
    }

    // Check if we have a PID
    if (!project.pid) {
        vscode.window.showWarningMessage(
            `Cannot attach debugger: Process ID not available for "${project.name}".`
        );
        return;
    }

    // Get the workspace folder for this function
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
        vscode.Uri.file(project.path)
    );

    // Start debugging with specific process ID
    const success = await vscode.debug.startDebugging(workspaceFolder ?? undefined, {
        type: 'coreclr',
        request: 'attach',
        name: `Debug: ${project.name}`,
        processId: String(project.pid),
    });

    if (success) {
        vscode.window.showInformationMessage(
            `Debugger attached to ${project.name} (PID: ${project.pid})`
        );
    } else {
        vscode.window.showErrorMessage(
            `Failed to attach debugger to ${project.name}. The process may have exited or the debugger may not support this process type.`
        );
    }
}

/**
 * Attach debugger to a running function automatically (alias for attachDebugger)
 */
async function attachDebuggerAuto(project: FunctionProject): Promise<void> {
    // Both commands now use automatic PID-based attachment
    await attachDebugger(project);
}

/**
 * Start a function and attach debugger (one-click flow)
 */
async function startAndDebug(project: FunctionProject): Promise<void> {
    // 1. Start the function if not already running
    if (project.status !== FunctionStatus.Running) {
        const started = await functionManager.startFunction(project);
        if (!started) {
            return;
        }

        // 2. Wait for it to reach 'running' status
        const ready = await waitForStatus(project, FunctionStatus.Running, 60000);
        if (!ready) {
            vscode.window.showErrorMessage(
                `Timed out waiting for "${project.name}" to start. Check the output log.`
            );
            return;
        }

        // 3. Small delay to let the .NET worker fully initialize
        await sleep(2000);
    }

    // 4. Auto-attach to the specific process
    await attachDebuggerAuto(project);
}

/**
 * Wait for a project to reach a specific status, with timeout
 */
function waitForStatus(
    project: FunctionProject,
    targetStatus: FunctionStatus,
    timeoutMs: number
): Promise<boolean> {
    return new Promise((resolve) => {
        // Already there?
        if (project.status === targetStatus) {
            resolve(true);
            return;
        }

        // Failed states = resolve false immediately
        const failStates: FunctionStatus[] = [FunctionStatus.Errored, FunctionStatus.Stopped];
        if (failStates.includes(project.status)) {
            resolve(false);
            return;
        }

        const timer = setTimeout(() => {
            subscription.dispose();
            resolve(false);
        }, timeoutMs);

        const subscription = functionManager.onStatusChange((event) => {
            if (event.project.id !== project.id) return;

            if (event.project.status === targetStatus) {
                clearTimeout(timer);
                subscription.dispose();
                resolve(true);
            } else if (failStates.includes(event.project.status)) {
                clearTimeout(timer);
                subscription.dispose();
                resolve(false);
            }
        });
    });
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Made with Bob
