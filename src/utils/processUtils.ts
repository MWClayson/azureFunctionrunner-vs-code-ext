import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Check if a process with the given PID is running
 * @param pid Process ID to check
 * @returns True if process is running, false otherwise
 */
export async function isProcessRunning(pid: number): Promise<boolean> {
    try {
        // Cross-platform: process.kill with signal 0 checks if process exists
        // without actually sending a signal
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // ESRCH error means process doesn't exist
        return false;
    }
}

/**
 * Find child processes of a parent process
 * @param parentPid Parent process ID
 * @returns Array of child process PIDs
 */
export async function findChildProcesses(parentPid: number): Promise<number[]> {
    try {
        const platform = process.platform;
        
        if (platform === 'win32') {
            // Windows: Use WMIC to find child processes
            const { stdout } = await execAsync(
                `wmic process where (ParentProcessId=${parentPid}) get ProcessId`
            );
            
            // Parse output, skip header line
            const lines = stdout.split('\n').slice(1);
            const pids: number[] = [];
            
            for (const line of lines) {
                const pid = parseInt(line.trim(), 10);
                if (!isNaN(pid)) {
                    pids.push(pid);
                }
            }
            
            return pids;
        } else {
            // macOS/Linux: Use pgrep to find child processes
            try {
                const { stdout } = await execAsync(`pgrep -P ${parentPid}`);
                const pids = stdout
                    .split('\n')
                    .filter(line => line.trim())
                    .map(line => parseInt(line.trim(), 10))
                    .filter(pid => !isNaN(pid));
                
                return pids;
            } catch (error: any) {
                // pgrep returns exit code 1 if no processes found
                if (error.code === 1) {
                    return [];
                }
                throw error;
            }
        }
    } catch (error) {
        console.error(`Error finding child processes of ${parentPid}:`, error);
        return [];
    }
}

/**
 * Find the Azure Function process (func or dotnet) started by a terminal
 * @param terminalPid Terminal shell process ID
 * @returns PID of the func/dotnet process, or undefined if not found
 */
export async function findFunctionProcess(terminalPid: number): Promise<number | undefined> {
    try {
        // Get immediate children of the terminal
        const children = await findChildProcesses(terminalPid);
        
        if (children.length === 0) {
            return undefined;
        }
        
        // Check each child process to find the func or dotnet process
        // The terminal might spawn a shell (zsh/bash) which then spawns func
        for (const childPid of children) {
            const processName = await getProcessName(childPid);
            
            if (processName) {
                const lowerName = processName.toLowerCase();
                
                // Check if this is a func or dotnet process
                if (lowerName.includes('func') || lowerName.includes('dotnet')) {
                    return childPid;
                }
                
                // If it's a shell, check its children
                if (lowerName.includes('sh') || lowerName.includes('bash') || lowerName.includes('zsh')) {
                    const grandchildren = await findChildProcesses(childPid);
                    
                    // Check grandchildren for func/dotnet
                    for (const grandchildPid of grandchildren) {
                        const grandchildName = await getProcessName(grandchildPid);
                        if (grandchildName) {
                            const lowerGrandchildName = grandchildName.toLowerCase();
                            if (lowerGrandchildName.includes('func') || lowerGrandchildName.includes('dotnet')) {
                                return grandchildPid;
                            }
                        }
                    }
                }
            }
        }
        
        // If we couldn't find func/dotnet specifically, return the first child
        // (it might be the func process but with a different name)
        return children[0];
    } catch (error) {
        console.error(`Error finding function process for terminal ${terminalPid}:`, error);
        return undefined;
    }
}

/**
 * Get process name by PID (for debugging/logging)
 * @param pid Process ID
 * @returns Process name or undefined
 */
export async function getProcessName(pid: number): Promise<string | undefined> {
    try {
        const platform = process.platform;
        
        if (platform === 'win32') {
            const { stdout } = await execAsync(
                `wmic process where (ProcessId=${pid}) get Name`
            );
            const lines = stdout.split('\n').slice(1);
            return lines[0]?.trim();
        } else {
            const { stdout } = await execAsync(`ps -p ${pid} -o comm=`);
            return stdout.trim();
        }
    } catch (error) {
        return undefined;
    }
}

// Made with Bob
