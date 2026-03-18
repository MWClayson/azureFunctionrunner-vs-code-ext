import { FunctionEndpoint } from '../models/types';

/**
 * Result of parsing func start output
 */
export interface ParseResult {
    /** True if any readiness pattern matched */
    isReady: boolean;
    /** True if any fatal error pattern matched */
    isFatalError: boolean;
    /** The matched error text, for use as lastError */
    fatalErrorMessage: string | undefined;
    /** Any endpoints discovered in this chunk */
    discoveredEndpoints: FunctionEndpoint[];
}

/**
 * Patterns that indicate the host is ready to accept requests.
 * ANY match = transition to 'running'.
 */
const READINESS_PATTERNS: RegExp[] = [
    /Host started/i,
    /Worker process started and initialized/i,
    /Job host started/i,
    /Hosting started/i,
];

/**
 * Pattern to extract HTTP endpoint definitions from func output.
 * Captures: [1] = function name, [2] = HTTP methods, [3] = URL
 *
 * Example match:
 *   "        ProcessOrder: [POST] http://localhost:7075/api/ProcessOrder"
 *   → name: "ProcessOrder", methods: "POST", url: "http://localhost:7075/api/ProcessOrder"
 */
const ENDPOINT_PATTERN: RegExp = /^\s+(\w+):\s+\[([^\]]+)\]\s+(https?:\/\/\S+)/gm;

/**
 * Patterns that indicate a fatal startup error.
 * ANY match while in 'starting' state = transition to 'errored'.
 * The matched line (or a relevant portion) becomes `lastError`.
 */
const FATAL_ERROR_PATTERNS: RegExp[] = [
    /address already in use/i,
    /EADDRINUSE/i,
    /A host error has occurred/i,
    /Unable to start host/i,
    /Port \d+ is unavailable/i,
    /Build FAILED/i,
    /error MSB\d+/i,
];

/**
 * Parse func start output to detect readiness, errors, and endpoints.
 * This function is pure (no side effects) and testable in isolation.
 * 
 * @param text The text chunk from stdout/stderr
 * @returns ParseResult with detected information
 */
export function parseHostOutput(text: string): ParseResult {
    const result: ParseResult = {
        isReady: false,
        isFatalError: false,
        fatalErrorMessage: undefined,
        discoveredEndpoints: [],
    };

    // Check for readiness
    for (const pattern of READINESS_PATTERNS) {
        if (pattern.test(text)) {
            result.isReady = true;
            break;
        }
    }

    // Check for fatal errors
    for (const pattern of FATAL_ERROR_PATTERNS) {
        const match = pattern.exec(text);
        if (match) {
            result.isFatalError = true;
            result.fatalErrorMessage = match[0];
            break;
        }
    }

    // Extract endpoints
    let endpointMatch: RegExpExecArray | null;
    // Reset lastIndex since we're reusing the regex
    ENDPOINT_PATTERN.lastIndex = 0;
    while ((endpointMatch = ENDPOINT_PATTERN.exec(text)) !== null) {
        result.discoveredEndpoints.push({
            name: endpointMatch[1],
            methods: endpointMatch[2].split(',').map(m => m.trim()),
            url: endpointMatch[3],
        });
    }

    return result;
}

// Made with Bob
