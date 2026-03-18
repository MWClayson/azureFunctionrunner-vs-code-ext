import * as vscode from 'vscode';
import { SolutionParser } from './solutionParser';
import { ProjectDetector } from './projectDetector';
import { FunctionProject } from '../models/types';

/**
 * Service for discovering Azure Function projects in the workspace
 */
export class ProjectDiscoveryService {
    private solutionParser: SolutionParser;
    private projectDetector: ProjectDetector;
    private discoveredProjects: Map<string, FunctionProject> = new Map();

    constructor() {
        this.solutionParser = new SolutionParser();
        this.projectDetector = new ProjectDetector();
    }

    /**
     * Discover all Azure Function projects in the workspace
     * @returns Array of discovered function projects
     */
    public async discoverProjects(): Promise<FunctionProject[]> {
        this.discoveredProjects.clear();

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }

        // Discover projects from solution files
        for (const folder of workspaceFolders) {
            await this.discoverFromSolutions(folder.uri.fsPath);
        }

        // Discover standalone projects if enabled
        const config = vscode.workspace.getConfiguration('azureFunctionRunner');
        const scanStandalone = config.get<boolean>('scanStandaloneProjects', true);

        if (scanStandalone) {
            for (const folder of workspaceFolders) {
                await this.discoverStandaloneProjects(folder.uri.fsPath);
            }
        }

        const allProjects = Array.from(this.discoveredProjects.values());
        console.log(`[ProjectDiscovery] Total discovered projects: ${allProjects.length}`);
        allProjects.forEach(p => {
            console.log(`[ProjectDiscovery] - ${p.name}: solutionFile=${p.solutionFile || 'none'}`);
        });
        
        return allProjects;
    }

    /**
     * Discover projects from solution files
     * @param workspacePath Path to the workspace folder
     */
    private async discoverFromSolutions(workspacePath: string): Promise<void> {
        try {
            // Find all solution files
            const solutionFiles = await this.solutionParser.findSolutionFiles(workspacePath);

            for (const solutionPath of solutionFiles) {
                try {
                    // Parse the solution file
                    const solution = await this.solutionParser.parseSolution(solutionPath);

                    // Check each project in the solution
                    for (const project of solution.projects) {
                        const functionProject = await this.projectDetector.createFunctionProject(
                            project,
                            solutionPath
                        );

                        if (functionProject) {
                            // Add to discovered projects (avoid duplicates)
                            this.discoveredProjects.set(functionProject.id, functionProject);
                        }
                    }
                } catch (error) {
                    console.error(`Error parsing solution ${solutionPath}:`, error);
                    vscode.window.showWarningMessage(
                        `Failed to parse solution: ${solutionPath}`
                    );
                }
            }
        } catch (error) {
            console.error(`Error discovering projects from solutions:`, error);
        }
    }

    /**
     * Discover standalone Azure Function projects
     * @param workspacePath Path to the workspace folder
     */
    private async discoverStandaloneProjects(workspacePath: string): Promise<void> {
        try {
            const standaloneProjects = await this.projectDetector.findStandaloneProjects(
                workspacePath
            );
            console.log(`[ProjectDiscovery] Found ${standaloneProjects.length} standalone projects`);

            for (const project of standaloneProjects) {
                // Only add if not already discovered from a solution
                if (!this.discoveredProjects.has(project.id)) {
                    console.log(`[ProjectDiscovery] Adding standalone project: ${project.name} (ID: ${project.id})`);
                    this.discoveredProjects.set(project.id, project);
                } else {
                    console.log(`[ProjectDiscovery] Skipping standalone project ${project.name} (ID: ${project.id}) - already discovered from solution`);
                }
            }
        } catch (error) {
            console.error(`Error discovering standalone projects:`, error);
        }
    }

    /**
     * Get a project by ID
     * @param projectId Project ID
     * @returns FunctionProject or undefined
     */
    public getProject(projectId: string): FunctionProject | undefined {
        return this.discoveredProjects.get(projectId);
    }

    /**
     * Get all discovered projects
     * @returns Array of all discovered projects
     */
    public getAllProjects(): FunctionProject[] {
        return Array.from(this.discoveredProjects.values());
    }

    /**
     * Clear all discovered projects
     */
    public clear(): void {
        this.discoveredProjects.clear();
    }
}

// Made with Bob
