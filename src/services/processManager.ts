import { spawn, ChildProcess } from 'child_process';
import * as vscode from 'vscode';
import { FunctionProject, FunctionStatus } from '../models/types';
import { parseHostOutput } from '../utils/outputParser';
import { killProcessTree } from '../utils/processKiller';

/**
 * Event emitted when a function's status changes
 */
export interface StatusChangeEvent {
    project: FunctionProject;
}

/**
 * Event emitted when endpoints are discovered
 */
export interface EndpointsDiscoveredEvent {
    project: FunctionProject;
}

/**
 * Event emitted when log output is written
 */
export interface LogWrittenEvent {
    id: string;
    text: string;
}

/**
 * Service for managing Azure Function processes using child_process.spawn()
 * Replaces the unreliable Terminal API approach with direct process management.
 */
export class ProcessManager {
    private projects: Map<string, FunctionProject> = new Map();
    
    // Event emitters
    private _onDidChangeStatus = new vscode.EventEmitter<StatusChangeEvent>();
    private _onDidDiscoverEndpoints = new vscode.EventEmitter<EndpointsDiscoveredEvent>();
    private _onDidWriteLog = new vscode.EventEmitter<LogWrittenEvent>();
    
    // Public event subscriptions
    public readonly onDidChangeStatus: vscode.Event<StatusChangeEvent> = this._onDidChangeStatus.event;
    public readonly onDidDiscoverEndpoints: vscode.Event<EndpointsDiscoveredEvent> = this._onDidDiscoverEndpoints.event;
    public readonly onDidWriteLog: vscode.Event<LogWrittenEvent> = this._onDidWriteLog.event;

    /**
     * Register a function project for management
     * Creates the OutputChannel but does not start the process
     */
    public registerProject(project: FunctionProject): void {
        // Check if project is already registered
        const existingProject = this.projects.get(project.id);
        
        if (existingProject) {
            // Project already registered - reuse the OutputChannel and preserve running state
            project.outputChannel = existingProject.outputChannel;
            project.process = existingProject.process;
            project.pid = existingProject.pid;
            project.status = existingProject.status;
            project.startedAt = existingProject.startedAt;
            project.lastError = existingProject.lastError;
            project.endpoints = existingProject.endpoints;
        } else {
            // New project - create OutputChannel and initialize fields
            if (!project.outputChannel) {
                project.outputChannel = vscode.window.createOutputChannel(`Func: ${project.name}`);
            }
            
            // Initialize process-related fields
            project.process = null;
            project.pid = null;
            project.status = FunctionStatus.Stopped;
            project.startedAt = undefined;
            project.lastError = undefined;
            project.endpoints = [];
        }
        
        this.projects.set(project.id, project);
    }

    /**
     * Start a function process
     */
    public async startProcess(projectId: string): Promise<boolean> {
        const project = this.projects.get(projectId);
        if (!project) {
            throw new Error(`Project ${projectId} not registered`);
        }

        // Check if already running
        if (project.process) {
            vscode.window.showWarningMessage(`${project.name} is already running`);
            return false;
        }

        try {
            // Get func CLI path from configuration
            const config = vscode.workspace.getConfiguration('azureFunctionRunner');
            const funcCliPath = config.get<string>('funcCliPath', 'func');

            // Build command arguments
            const args: string[] = ['start'];
            
            // Add port if configured
            if (project.port) {
                args.push('--port', String(project.port));
            }

            // Clear output channel for fresh start
            project.outputChannel!.clear();
            project.outputChannel!.appendLine(`[Extension] Starting ${project.name}...`);
            project.outputChannel!.appendLine(`[Extension] Command: ${funcCliPath} ${args.join(' ')}`);
            project.outputChannel!.appendLine(`[Extension] Working directory: ${project.path}`);
            project.outputChannel!.appendLine('');

            // Spawn the process
            const child: ChildProcess = spawn(funcCliPath, args, {
                cwd: project.path,
                shell: true,  // Required for Windows .cmd files
                env: { ...process.env },
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            // Handle spawn failure - PID undefined
            if (child.pid === undefined) {
                project.status = FunctionStatus.Errored;
                project.lastError = 'Failed to spawn process — pid is undefined';
                project.process = null;
                project.outputChannel!.appendLine(`[Extension] Error: ${project.lastError}`);
                this.fireStatusChanged(project);
                return false;
            }

            // Store process information
            project.process = child;
            project.pid = child.pid;
            project.status = FunctionStatus.Starting;
            project.endpoints = [];
            
            project.outputChannel!.appendLine(`[Extension] PID: ${child.pid}`);
            
            this.fireStatusChanged(project);

            // Handle spawn error event (e.g., func not found)
            child.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'ENOENT') {
                    project.status = FunctionStatus.Errored;
                    project.lastError = 'Azure Functions Core Tools (func) not found on PATH. Install from https://github.com/Azure/azure-functions-core-tools';
                } else {
                    project.status = FunctionStatus.Errored;
                    project.lastError = `Failed to start: ${err.message}`;
                }

                project.process = null;
                project.pid = null;
                project.outputChannel!.appendLine(`[Extension] Error: ${project.lastError}`);
                this.fireStatusChanged(project);
            });

            // Handle stdout - parse for readiness and endpoints
            child.stdout?.on('data', (data: Buffer) => {
                const text = data.toString();
                
                // Always write to OutputChannel
                project.outputChannel!.append(text);
                
                // Always emit log event
                this.fireLogWritten({ id: project.id, text });
                
                // Only parse if still starting
                if (project.status === FunctionStatus.Starting) {
                    const result = parseHostOutput(text);
                    
                    // Discover endpoints
                    if (result.discoveredEndpoints.length > 0) {
                        for (const ep of result.discoveredEndpoints) {
                            // Avoid duplicates
                            if (!project.endpoints.find(e => e.name === ep.name)) {
                                project.endpoints.push(ep);
                            }
                        }
                        this.fireEndpointsDiscovered(project);
                    }
                    
                    // Fatal error takes precedence over readiness
                    if (result.isFatalError) {
                        project.status = FunctionStatus.Errored;
                        project.lastError = result.fatalErrorMessage ?? 'Fatal error during startup';
                        project.outputChannel!.appendLine('');
                        project.outputChannel!.appendLine(`[Extension] Error: ${project.lastError}`);
                        this.fireStatusChanged(project);
                        // Don't kill the process - let it exit on its own
                    } else if (result.isReady) {
                        project.status = FunctionStatus.Running;
                        project.startedAt = new Date();
                        project.outputChannel!.appendLine('');
                        project.outputChannel!.appendLine(`[Extension] Host ready — ${project.endpoints.length} endpoint(s) detected`);
                        for (const ep of project.endpoints) {
                            project.outputChannel!.appendLine(`[Extension]   ${ep.name}: [${ep.methods.join(', ')}] ${ep.url}`);
                        }
                        this.fireStatusChanged(project);
                    }
                }
            });

            // Handle stderr - func writes some normal output to stderr
            child.stderr?.on('data', (data: Buffer) => {
                const text = data.toString();
                project.outputChannel!.append(text);
                this.fireLogWritten({ id: project.id, text });
            });

            // Handle process exit
            child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
                const wasRunning = project.status === FunctionStatus.Running;
                const wasStopping = project.status === FunctionStatus.Stopping;
                const wasStarting = project.status === FunctionStatus.Starting;

                // Clean up process references
                project.process = null;
                project.pid = null;
                project.endpoints = [];

                if (wasStopping) {
                    // We initiated the kill — clean shutdown
                    project.status = FunctionStatus.Stopped;
                    project.lastError = undefined;
                    project.outputChannel!.appendLine(`[Extension] Process exited — code: ${code}, signal: ${signal}`);
                    project.outputChannel!.appendLine('[Extension] Function host stopped.');
                } else if (wasStarting) {
                    // Process died during startup — always an error
                    project.status = FunctionStatus.Errored;
                    project.lastError = this.buildExitErrorMessage(code, signal, 'Function failed to start');
                    project.outputChannel!.appendLine('');
                    project.outputChannel!.appendLine(`[Extension] Process exited — code: ${code}, signal: ${signal}`);
                    project.outputChannel!.appendLine(`[Extension] Error: ${project.lastError}`);
                } else if (wasRunning && code !== 0) {
                    // Process crashed while running
                    project.status = FunctionStatus.Errored;
                    project.lastError = this.buildExitErrorMessage(code, signal, 'Function crashed');
                    project.outputChannel!.appendLine('');
                    project.outputChannel!.appendLine(`[Extension] Process exited — code: ${code}, signal: ${signal}`);
                    project.outputChannel!.appendLine(`[Extension] Error: ${project.lastError}`);
                } else {
                    // Running process exited with code 0 (unusual but not an error)
                    project.status = FunctionStatus.Stopped;
                    project.lastError = undefined;
                    project.outputChannel!.appendLine(`[Extension] Process exited — code: ${code}, signal: ${signal}`);
                }

                this.fireStatusChanged(project);
            });

            return true;

        } catch (error) {
            console.error(`Error starting process for ${project.name}:`, error);
            project.status = FunctionStatus.Errored;
            project.lastError = error instanceof Error ? error.message : String(error);
            project.process = null;
            project.pid = null;
            project.outputChannel!.appendLine(`[Extension] Error: ${project.lastError}`);
            this.fireStatusChanged(project);
            return false;
        }
    }

    /**
     * Stop a running process
     */
    public async stopProcess(projectId: string, timeout: number = 10000): Promise<boolean> {
        const project = this.projects.get(projectId);
        if (!project) {
            return false;
        }

        const child = project.process;
        if (!child) {
            // Already stopped — ensure state is clean
            project.status = FunctionStatus.Stopped;
            project.process = null;
            project.pid = null;
            project.endpoints = [];
            this.fireStatusChanged(project);
            return true;
        }

        // Transition to 'stopping' immediately
        project.status = FunctionStatus.Stopping;
        this.fireStatusChanged(project);
        project.outputChannel!.appendLine('');
        project.outputChannel!.appendLine('[Extension] Stopping function host...');

        const pid = project.pid;

        // Set up promise that resolves when process exits
        const exitPromise = new Promise<void>((resolve) => {
            child.once('exit', () => {
                resolve();
            });
        });

        // Kill the process tree
        if (pid) {
            killProcessTree(pid);
        } else {
            // No PID — try killing the child directly
            try { 
                child.kill('SIGKILL'); 
            } catch { 
                // Already dead 
            }
        }

        // Wait for exit with timeout
        const timeoutPromise = new Promise<void>((resolve) => {
            setTimeout(() => {
                if (project.process) {
                    project.outputChannel!.appendLine('[Extension] WARNING: Process did not exit within 10s — forcing cleanup.');
                    project.status = FunctionStatus.Stopped;
                    project.process = null;
                    project.pid = null;
                    project.endpoints = [];
                    this.fireStatusChanged(project);
                }
                resolve();
            }, timeout);
        });

        await Promise.race([exitPromise, timeoutPromise]);
        return true;
    }

    /**
     * Check if a process is running
     */
    public isRunning(projectId: string): boolean {
        const project = this.projects.get(projectId);
        return project?.process !== null && project?.process !== undefined;
    }

    /**
     * Get project by ID
     */
    public getProject(projectId: string): FunctionProject | undefined {
        return this.projects.get(projectId);
    }

    /**
     * Get all registered projects
     */
    public getAllProjects(): FunctionProject[] {
        return Array.from(this.projects.values());
    }

    /**
     * Build error message from exit code and signal
     */
    private buildExitErrorMessage(
        code: number | null,
        signal: NodeJS.Signals | null,
        prefix: string
    ): string {
        const parts = [prefix];
        if (code !== null) parts.push(`exit code ${code}`);
        if (signal) parts.push(`signal ${signal}`);
        return parts.join(' — ');
    }

    /**
     * Fire status changed event
     */
    private fireStatusChanged(project: FunctionProject): void {
        this._onDidChangeStatus.fire({ project });
    }

    /**
     * Fire endpoints discovered event
     */
    private fireEndpointsDiscovered(project: FunctionProject): void {
        this._onDidDiscoverEndpoints.fire({ project });
    }

    /**
     * Fire log written event
     */
    private fireLogWritten(entry: LogWrittenEvent): void {
        this._onDidWriteLog.fire(entry);
    }

    /**
     * Cleanup all processes (called on extension deactivation)
     */
    public dispose(): void {
        // Fire-and-forget kill all processes
        // VS Code has limited deactivation time, don't await
        for (const project of this.projects.values()) {
            if (project.process && project.pid) {
                killProcessTree(project.pid);
            }
            if (project.outputChannel) {
                project.outputChannel.dispose();
            }
        }

        this.projects.clear();
        
        // Dispose event emitters
        this._onDidChangeStatus.dispose();
        this._onDidDiscoverEndpoints.dispose();
        this._onDidWriteLog.dispose();
    }
}

// Made with Bob
