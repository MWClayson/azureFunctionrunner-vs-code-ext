import { execSync } from 'child_process';

/**
 * Kill a process tree (parent and all children).
 * Uses platform-specific methods to ensure all child processes are terminated.
 * 
 * @param pid The PID of the root process to kill
 */
export function killProcessTree(pid: number): void {
    if (process.platform === 'win32') {
        killProcessTreeWindows(pid);
    } else {
        killProcessTreeUnix(pid);
    }
}

/**
 * Windows: Use taskkill with /T (tree kill) and /F (force).
 *
 * This kills cmd.exe, func/node.exe, and dotnet.exe in one call.
 * Without /T, only cmd.exe is killed and the rest become orphans.
 */
function killProcessTreeWindows(pid: number): void {
    try {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } catch {
        // Process may have already exited — this is not an error.
        // taskkill returns exit code 128 if the process doesn't exist.
    }
}

/**
 * macOS/Linux: Kill the process group, then force-kill after a timeout.
 *
 * When shell: true is used, the shell and its children share a process group.
 * Sending a signal to the negative PID targets the entire group.
 */
function killProcessTreeUnix(pid: number): void {
    // First attempt: kill the process group (negative PID)
    try {
        process.kill(-pid, 'SIGTERM');
    } catch (err: any) {
        if (err.code === 'ESRCH') {
            // Process group doesn't exist — already dead
            return;
        }
        // Fallback: kill the individual process
        try {
            process.kill(pid, 'SIGTERM');
        } catch { 
            // Already dead
        }
    }

    // Schedule a force-kill in case SIGTERM doesn't work
    // (e.g. the process is stuck or ignoring SIGTERM)
    setTimeout(() => {
        try {
            process.kill(-pid, 'SIGKILL');
        } catch {
            try {
                process.kill(pid, 'SIGKILL');
            } catch { 
                // Already dead
            }
        }
    }, 5000);
}

// Made with Bob
