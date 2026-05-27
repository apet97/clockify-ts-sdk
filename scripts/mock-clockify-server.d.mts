import type { Server } from "node:http";

export interface MockClockifyState {
    tags: Array<Record<string, unknown>>;
    clients: Array<Record<string, unknown>>;
    projects: Array<Record<string, unknown>>;
    entries: Array<Record<string, unknown>>;
}

export interface MockClockifyServer {
    server: Server;
    state: MockClockifyState;
    workspaceId: string;
    userId: string;
    listen(port?: number, host?: string): Promise<string>;
    close(): Promise<void>;
}

export function createMockClockifyServer(options?: {
    workspaceId?: string;
    userId?: string;
    state?: MockClockifyState;
}): MockClockifyServer;
