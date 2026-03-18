import { ChildProcess } from 'child_process';
import * as vscode from 'vscode';

/**
 * Represents the status of an Azure Function project
 */
export enum FunctionStatus {
    Stopped = 'stopped',
    Starting = 'starting',
    Running = 'running',
    Stopping = 'stopping',
    Errored = 'errored'
}

/**
 * Represents an HTTP endpoint discovered from func start output
 */
export interface FunctionEndpoint {
    /** Function name */
    name: string;
    /** HTTP methods (GET, POST, etc.) */
    methods: string[];
    /** Full URL of the endpoint */
    url: string;
}

/**
 * Represents an Azure Function project
 */
export interface FunctionProject {
    /** Unique identifier for the project */
    id: string;
    
    /** Display name of the project */
    name: string;
    
    /** Absolute path to the project directory */
    path: string;
    
    /** Path to the parent solution file (if any) */
    solutionFile?: string;
    
    /** Current status of the function */
    status: FunctionStatus;
    
    /** The spawned ChildProcess. Null when not running. */
    process: ChildProcess | null;
    
    /**
     * OS-level PID of the shell process that owns func start.
     * This is the shell PID (due to shell: true), not the func or dotnet PID.
     * Used for process tree kill, not for debugger attachment.
     * Null when not running.
     */
    pid: number | null;
    
    /** Port number the function is running on */
    port?: number;
    
    /** Dedicated output channel for this function's logs */
    outputChannel: vscode.OutputChannel | null;
    
    /** When the function last reached 'running' status */
    startedAt: Date | undefined;
    
    /** Error description when status is 'errored'. Always set when errored, always undefined otherwise. */
    lastError: string | undefined;
    
    /** HTTP trigger endpoints discovered from func start output */
    endpoints: FunctionEndpoint[];
}

/**
 * Represents a Visual Studio solution file
 */
export interface SolutionFile {
    /** Path to the .sln file */
    path: string;
    
    /** Name of the solution */
    name: string;
    
    /** List of project references in the solution */
    projects: SolutionProject[];
}

/**
 * Represents a project reference in a solution file
 */
export interface SolutionProject {
    /** Project name */
    name: string;
    
    /** Relative path to the .csproj file */
    relativePath: string;
    
    /** Absolute path to the .csproj file */
    absolutePath: string;
    
    /** Project GUID */
    guid: string;
}

/**
 * Extension configuration
 */
export interface ExtensionConfig {
    /** Whether to scan for standalone projects */
    scanStandaloneProjects: boolean;
    
    /** Whether to auto-refresh on workspace changes */
    autoRefresh: boolean;
    
    /** Path to the func CLI */
    funcCliPath: string;
}

// Made with Bob
