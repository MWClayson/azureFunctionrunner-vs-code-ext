import * as fs from 'fs';
import * as path from 'path';
import { FunctionProject, FunctionStatus, SolutionProject } from '../models/types';

/**
 * Service for detecting Azure Function projects
 */
export class ProjectDetector {
    /**
     * Check if a project is an Azure Function project
     * @param projectPath Absolute path to the project directory
     * @returns True if the project is an Azure Function project
     */
    public async isAzureFunctionProject(projectPath: string): Promise<boolean> {
        try {
            // Check for host.json file (required for Azure Functions)
            const hostJsonPath = path.join(projectPath, 'host.json');
            const hasHostJson = await this.fileExists(hostJsonPath);

            if (!hasHostJson) {
                return false;
            }

            // Check for .csproj file with Azure Functions SDK reference
            const csprojFiles = await this.findCsprojFiles(projectPath);
            
            for (const csprojPath of csprojFiles) {
                const hasAzureFunctionsSdk = await this.hasFunctionsSdkReference(csprojPath);
                if (hasAzureFunctionsSdk) {
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error(`Error checking if project is Azure Function: ${projectPath}`, error);
            return false;
        }
    }

    /**
     * Create a FunctionProject from a solution project reference
     * @param solutionProject Solution project reference
     * @param solutionPath Path to the solution file
     * @returns FunctionProject or null if not an Azure Function project
     */
    public async createFunctionProject(
        solutionProject: SolutionProject,
        solutionPath: string
    ): Promise<FunctionProject | null> {
        // Check if the .csproj file actually exists
        const csprojExists = await this.fileExists(solutionProject.absolutePath);
        if (!csprojExists) {
            console.log(`[ProjectDetector] Skipping project ${solutionProject.name}: .csproj file not found at ${solutionProject.absolutePath}`);
            return null;
        }

        const projectDir = path.dirname(solutionProject.absolutePath);
        console.log(`[ProjectDetector] Checking if ${solutionProject.name} at ${projectDir} is an Azure Function project`);
        
        const isAzureFunction = await this.isAzureFunctionProject(projectDir);
        console.log(`[ProjectDetector] ${solutionProject.name} isAzureFunction: ${isAzureFunction}`);
        
        if (!isAzureFunction) {
            console.log(`[ProjectDetector] Skipping ${solutionProject.name}: not an Azure Function project`);
            return null;
        }

        return {
            id: this.generateProjectId(projectDir),  // Use project directory, not .csproj path
            name: solutionProject.name,
            path: projectDir,
            solutionFile: solutionPath,
            status: FunctionStatus.Stopped,
            process: null,
            pid: null,
            outputChannel: null,  // Will be created by ProcessManager.registerProject()
            startedAt: undefined,
            lastError: undefined,
            endpoints: []
        };
    }

    /**
     * Find standalone Azure Function projects in a directory
     * @param directory Directory to search
     * @returns Array of FunctionProjects
     */
    public async findStandaloneProjects(directory: string): Promise<FunctionProject[]> {
        const projects: FunctionProject[] = [];

        try {
            const hostJsonFiles = await this.findHostJsonFiles(directory);

            for (const hostJsonPath of hostJsonFiles) {
                const projectDir = path.dirname(hostJsonPath);
                const isAzureFunction = await this.isAzureFunctionProject(projectDir);

                if (isAzureFunction) {
                    const projectName = path.basename(projectDir);
                    
                    projects.push({
                        id: this.generateProjectId(projectDir),
                        name: projectName,
                        path: projectDir,
                        status: FunctionStatus.Stopped,
                        process: null,
                        pid: null,
                        outputChannel: null,  // Will be created by ProcessManager.registerProject()
                        startedAt: undefined,
                        lastError: undefined,
                        endpoints: []
                    });
                }
            }
        } catch (error) {
            console.error(`Error finding standalone projects in ${directory}:`, error);
        }

        return projects;
    }

    /**
     * Find all host.json files in a directory
     * @param directory Directory to search
     * @returns Array of host.json file paths
     */
    private async findHostJsonFiles(directory: string): Promise<string[]> {
        const hostJsonFiles: string[] = [];

        try {
            const entries = await fs.promises.readdir(directory, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(directory, entry.name);

                if (entry.isDirectory()) {
                    if (!this.shouldSkipDirectory(entry.name)) {
                        const subFiles = await this.findHostJsonFiles(fullPath);
                        hostJsonFiles.push(...subFiles);
                    }
                } else if (entry.isFile() && entry.name === 'host.json') {
                    hostJsonFiles.push(fullPath);
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${directory}:`, error);
        }

        return hostJsonFiles;
    }

    /**
     * Find .csproj files in a directory
     * @param directory Directory to search
     * @returns Array of .csproj file paths
     */
    private async findCsprojFiles(directory: string): Promise<string[]> {
        try {
            const entries = await fs.promises.readdir(directory);
            return entries
                .filter(entry => entry.endsWith('.csproj'))
                .map(entry => path.join(directory, entry));
        } catch (error) {
            console.error(`Error finding .csproj files in ${directory}:`, error);
            return [];
        }
    }

    /**
     * Check if a .csproj file references the Azure Functions SDK
     * @param csprojPath Path to the .csproj file
     * @returns True if the project references Azure Functions SDK
     */
    private async hasFunctionsSdkReference(csprojPath: string): Promise<boolean> {
        try {
            const content = await fs.promises.readFile(csprojPath, 'utf-8');
            
            // Check for Azure Functions SDK package references
            const azureFunctionsPackages = [
                'Microsoft.NET.Sdk.Functions',
                'Microsoft.Azure.Functions.Worker',
                'Microsoft.Azure.WebJobs'
            ];

            return azureFunctionsPackages.some(pkg => content.includes(pkg));
        } catch (error) {
            console.error(`Error reading .csproj file ${csprojPath}:`, error);
            return false;
        }
    }

    /**
     * Check if a file exists
     * @param filePath Path to the file
     * @returns True if the file exists
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Generate a unique ID for a project
     * @param projectPath Path to the project
     * @returns Unique project ID
     */
    private generateProjectId(projectPath: string): string {
        // Use the normalized path as the ID
        return path.normalize(projectPath).toLowerCase();
    }

    /**
     * Determine if a directory should be skipped during scanning
     * @param dirName Directory name
     * @returns True if directory should be skipped
     */
    private shouldSkipDirectory(dirName: string): boolean {
        const skipDirs = [
            'node_modules',
            'bin',
            'obj',
            '.git',
            '.vs',
            '.vscode',
            'packages',
            'TestResults'
        ];

        return skipDirs.includes(dirName);
    }
}

// Made with Bob
