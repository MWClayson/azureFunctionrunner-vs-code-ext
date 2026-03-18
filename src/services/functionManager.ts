import * as vscode from 'vscode';
import { FunctionProject, FunctionStatus } from '../models/types';
import { ProcessManager, StatusChangeEvent } from './processManager';

/**
 * Service for managing Azure Function lifecycle
 * Simplified to delegate process management to ProcessManager
 */
export class FunctionManager {
    private processManager: ProcessManager;
    private statusChangeEmitter: vscode.EventEmitter<StatusChangeEvent>;
    public readonly onStatusChange: vscode.Event<StatusChangeEvent>;

    constructor() {
        this.processManager = new ProcessManager();
        this.statusChangeEmitter = new vscode.EventEmitter<StatusChangeEvent>();
        this.onStatusChange = this.statusChangeEmitter.event;
        
        // Forward ProcessManager status changes to our subscribers
        this.processManager.onDidChangeStatus((event) => {
            this.statusChangeEmitter.fire(event);
        });
    }

    /**
     * Register a function project for management
     */
    public registerProject(project: FunctionProject): void {
        this.processManager.registerProject(project);
    }

    /**
     * Start a function project
     */
    public async startFunction(project: FunctionProject): Promise<boolean> {
        try {
            const success = await this.processManager.startProcess(project.id);
            
            if (success) {
                vscode.window.showInformationMessage(`${project.name} is starting...`);
            }
            
            return success;
        } catch (error) {
            console.error(`Error starting function ${project.name}:`, error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to start ${project.name}: ${errorMessage}`);
            return false;
        }
    }

    /**
     * Stop a function project
     */
    public async stopFunction(project: FunctionProject): Promise<boolean> {
        try {
            const success = await this.processManager.stopProcess(project.id);
            
            if (success) {
                vscode.window.showInformationMessage(`${project.name} stopped successfully`);
            } else {
                vscode.window.showWarningMessage(`${project.name} is not running`);
            }
            
            return success;
        } catch (error) {
            console.error(`Error stopping function ${project.name}:`, error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to stop ${project.name}: ${errorMessage}`);
            return false;
        }
    }

    /**
     * Restart a function project
     */
    public async restartFunction(project: FunctionProject): Promise<boolean> {
        try {
            const wasRunning = this.processManager.isRunning(project.id);

            if (wasRunning) {
                // Stop first
                const stopped = await this.stopFunction(project);
                if (!stopped) {
                    return false;
                }

                // Wait a bit for cleanup
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Start
            return await this.startFunction(project);

        } catch (error) {
            console.error(`Error restarting function ${project.name}:`, error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to restart ${project.name}: ${errorMessage}`);
            return false;
        }
    }

    /**
     * Start all function projects
     */
    public async startAllFunctions(projects: FunctionProject[]): Promise<void> {
        const stoppedProjects = projects.filter(p => 
            !this.processManager.isRunning(p.id)
        );

        if (stoppedProjects.length === 0) {
            vscode.window.showInformationMessage('All functions are already running');
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Starting ${stoppedProjects.length} function(s)...`,
                cancellable: false
            },
            async (progress) => {
                let completed = 0;

                for (const project of stoppedProjects) {
                    progress.report({
                        message: `Starting ${project.name}...`,
                        increment: (100 / stoppedProjects.length)
                    });

                    await this.startFunction(project);
                    completed++;

                    // Small delay between starts
                    if (completed < stoppedProjects.length) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }
        );

        vscode.window.showInformationMessage(
            `Started ${stoppedProjects.length} function(s)`
        );
    }

    /**
     * Stop all function projects
     */
    public async stopAllFunctions(projects: FunctionProject[]): Promise<void> {
        const runningProjects = projects.filter(p => 
            this.processManager.isRunning(p.id)
        );

        if (runningProjects.length === 0) {
            vscode.window.showInformationMessage('No functions are running');
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Stopping ${runningProjects.length} function(s)...`,
                cancellable: false
            },
            async (progress) => {
                const stopPromises = runningProjects.map(async (project) => {
                    progress.report({
                        message: `Stopping ${project.name}...`,
                        increment: (100 / runningProjects.length)
                    });

                    return this.stopFunction(project);
                });

                await Promise.all(stopPromises);
            }
        );

        vscode.window.showInformationMessage(
            `Stopped ${runningProjects.length} function(s)`
        );
    }

    /**
     * Get current status of a function
     */
    public getStatus(projectId: string): FunctionStatus {
        const project = this.processManager.getProject(projectId);
        return project?.status ?? FunctionStatus.Stopped;
    }

    /**
     * Check if a function is running
     */
    public isRunning(projectId: string): boolean {
        return this.processManager.isRunning(projectId);
    }

    /**
     * Get project by ID
     */
    public getProject(projectId: string): FunctionProject | undefined {
        return this.processManager.getProject(projectId);
    }

    /**
     * Get all projects
     */
    public getAllProjects(): FunctionProject[] {
        return this.processManager.getAllProjects();
    }

    /**
     * Cleanup (called on extension deactivation)
     */
    public async dispose(): Promise<void> {
        // ProcessManager handles all cleanup
        this.processManager.dispose();
        this.statusChangeEmitter.dispose();
    }
}

// Made with Bob
