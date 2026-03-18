import * as fs from 'fs';
import * as path from 'path';
import { SolutionFile, SolutionProject } from '../models/types';

/**
 * Service for parsing Visual Studio solution files
 */
export class SolutionParser {
    /**
     * Parse a solution file and extract project references
     * @param solutionPath Absolute path to the .sln file
     * @returns Parsed solution information
     */
    public async parseSolution(solutionPath: string): Promise<SolutionFile> {
        const content = await fs.promises.readFile(solutionPath, 'utf-8');
        const solutionDir = path.dirname(solutionPath);
        const solutionName = path.basename(solutionPath, '.sln');

        const projects = this.extractProjects(content, solutionDir);

        return {
            path: solutionPath,
            name: solutionName,
            projects
        };
    }

    /**
     * Extract project references from solution file content
     * @param content Solution file content
     * @param solutionDir Directory containing the solution file
     * @returns Array of project references
     */
    private extractProjects(content: string, solutionDir: string): SolutionProject[] {
        const projects: SolutionProject[] = [];
        
        // Regex to match project lines in .sln file
        // Format: Project("{GUID}") = "ProjectName", "RelativePath", "{ProjectGUID}"
        const projectRegex = /Project\("\{[A-F0-9-]+\}"\)\s*=\s*"([^"]+)",\s*"([^"]+)",\s*"\{([A-F0-9-]+)\}"/gi;
        
        let match;
        while ((match = projectRegex.exec(content)) !== null) {
            const projectName = match[1];
            const relativePath = match[2];
            const projectGuid = match[3];

            // Only include .csproj files (C# projects)
            if (relativePath.endsWith('.csproj')) {
                // Convert Windows-style paths to platform-specific paths
                const normalizedPath = relativePath.replace(/\\/g, path.sep);
                const absolutePath = path.resolve(solutionDir, normalizedPath);

                projects.push({
                    name: projectName,
                    relativePath: normalizedPath,
                    absolutePath,
                    guid: projectGuid
                });
            }
        }

        return projects;
    }

    /**
     * Find all solution files in a directory
     * @param directory Directory to search
     * @param recursive Whether to search recursively
     * @returns Array of solution file paths
     */
    public async findSolutionFiles(directory: string, recursive: boolean = true): Promise<string[]> {
        const solutionFiles: string[] = [];

        try {
            const entries = await fs.promises.readdir(directory, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(directory, entry.name);

                if (entry.isDirectory() && recursive) {
                    // Skip common directories that shouldn't contain solutions
                    if (!this.shouldSkipDirectory(entry.name)) {
                        const subSolutions = await this.findSolutionFiles(fullPath, recursive);
                        solutionFiles.push(...subSolutions);
                    }
                } else if (entry.isFile() && entry.name.endsWith('.sln')) {
                    solutionFiles.push(fullPath);
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${directory}:`, error);
        }

        return solutionFiles;
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
