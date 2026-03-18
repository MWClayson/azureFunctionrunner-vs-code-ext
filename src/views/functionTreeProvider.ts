import * as vscode from 'vscode';
import * as path from 'path';
import { FunctionProject, FunctionStatus } from '../models/types';

/**
 * Tree item representing a function project
 */
export class FunctionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly project: FunctionProject,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(project.name, collapsibleState);

        this.tooltip = project.path;
        this.description = this.getStatusDescription();
        this.contextValue = `functionProject-${project.status}`;
        this.iconPath = this.getIcon();
        
        // Add command to open project in explorer
        this.command = {
            command: 'revealInExplorer',
            title: 'Reveal in Explorer',
            arguments: [vscode.Uri.file(project.path)]
        };
    }

    /**
     * Get status description for the tree item
     */
    private getStatusDescription(): string {
        switch (this.project.status) {
            case FunctionStatus.Running:
                return '● Running';
            case FunctionStatus.Starting:
                return '⟳ Starting...';
            case FunctionStatus.Stopping:
                return '⟳ Stopping...';
            case FunctionStatus.Errored:
                return '✗ Error';
            case FunctionStatus.Stopped:
            default:
                return '○ Stopped';
        }
    }

    /**
     * Get icon for the tree item based on status
     */
    private getIcon(): vscode.ThemeIcon {
        switch (this.project.status) {
            case FunctionStatus.Running:
                return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconPassed'));
            case FunctionStatus.Starting:
            case FunctionStatus.Stopping:
                return new vscode.ThemeIcon('loading~spin');
            case FunctionStatus.Errored:
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
            case FunctionStatus.Stopped:
            default:
                return new vscode.ThemeIcon('circle-outline');
        }
    }
}

/**
 * Tree item representing a solution file grouping
 */
export class SolutionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly solutionName: string,
        public readonly solutionPath: string,
        public readonly projects: FunctionProject[]
    ) {
        super(solutionName, vscode.TreeItemCollapsibleState.Expanded);
        
        this.tooltip = solutionPath;
        this.description = `${projects.length} function${projects.length !== 1 ? 's' : ''}`;
        this.contextValue = 'solutionGroup';
        this.iconPath = new vscode.ThemeIcon('file-code');
    }
}

/**
 * Tree data provider for Azure Function projects
 */
export class FunctionTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = 
        new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    private projects: FunctionProject[] = [];

    /**
     * Refresh the tree view
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Update the projects displayed in the tree
     * @param projects Array of function projects
     */
    public updateProjects(projects: FunctionProject[]): void {
        this.projects = projects;
        this.refresh();
    }

    /**
     * Update a specific project's status
     * @param projectId Project ID
     * @param status New status
     */
    public updateProjectStatus(projectId: string, status: FunctionStatus): void {
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            project.status = status;
            this.refresh();
        }
    }

    /**
     * Get tree item for an element
     */
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children for a tree element
     */
    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (!element) {
            // Root level - group by solution or show standalone
            return Promise.resolve(this.getRootItems());
        }

        if (element instanceof SolutionTreeItem) {
            // Return function projects for this solution
            return Promise.resolve(
                element.projects.map(
                    project => new FunctionTreeItem(project, vscode.TreeItemCollapsibleState.None)
                )
            );
        }

        return Promise.resolve([]);
    }

    /**
     * Get root level tree items
     */
    private getRootItems(): vscode.TreeItem[] {
        if (this.projects.length === 0) {
            return [];
        }

        // Group projects by solution
        const solutionGroups = new Map<string, FunctionProject[]>();
        const standaloneProjects: FunctionProject[] = [];

        for (const project of this.projects) {
            if (project.solutionFile) {
                const solutionName = path.basename(project.solutionFile, '.sln');
                const key = project.solutionFile;
                
                if (!solutionGroups.has(key)) {
                    solutionGroups.set(key, []);
                }
                solutionGroups.get(key)!.push(project);
            } else {
                standaloneProjects.push(project);
            }
        }

        const items: vscode.TreeItem[] = [];

        // Add solution groups
        for (const [solutionPath, projects] of solutionGroups) {
            const solutionName = path.basename(solutionPath, '.sln');
            items.push(new SolutionTreeItem(solutionName, solutionPath, projects));
        }

        // Add standalone projects group if any exist
        if (standaloneProjects.length > 0) {
            items.push(
                new SolutionTreeItem(
                    'Standalone Projects',
                    '',
                    standaloneProjects
                )
            );
        }

        return items;
    }

    /**
     * Get all projects
     */
    public getProjects(): FunctionProject[] {
        return this.projects;
    }

    /**
     * Get a project by ID
     */
    public getProject(projectId: string): FunctionProject | undefined {
        return this.projects.find(p => p.id === projectId);
    }
}

// Made with Bob
