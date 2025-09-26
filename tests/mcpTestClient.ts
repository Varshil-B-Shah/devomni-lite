import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

/**
 * MCP Server Test Client
 * 
 * Provides utilities for testing MCP server functionality in Jest tests.
 * Handles server lifecycle, MCP protocol communication, and response parsing.
 */

export class McpServerTestClient extends EventEmitter {
  private serverProcess: ChildProcess | null = null;
  private requestId: number = 1;
  private responses: Map<number, any> = new Map();
  private isInitialized: boolean = false;

  async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.serverProcess = spawn('node', ['dist/mcp-server.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let initComplete = false;

      this.serverProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              this.responses.set(response.id, response);
              this.emit('response', response);
            } catch (e) {
              // Ignore non-JSON lines (logs, etc.)
            }
          }
        }
      });

      this.serverProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Initialized') && !initComplete) {
          initComplete = true;
          resolve();
        }
      });

      this.serverProcess.on('error', reject);
      
      setTimeout(() => {
        if (!initComplete) {
          reject(new Error('Server initialization timeout'));
        }
      }, 5000);
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const request = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'jest-test-client', version: '1.0.0' }
      }
    };

    await this.sendRequest(request);
    this.isInitialized = true;
  }

  async callTool(toolName: string, args: any): Promise<any> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const request = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    const response = await this.sendRequest(request);
    
    if (response.error) {
      throw new Error(`MCP Tool Error: ${response.error.message}`);
    }

    if (response.result?.content?.[0]?.text) {
      try {
        return JSON.parse(response.result.content[0].text);
      } catch (error) {
        // If parsing fails, the response might be an error message
        throw new Error(`Failed to parse MCP response: ${response.result.content[0].text}`);
      }
    }

    return response.result;
  }

  async listTools(): Promise<any[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const request = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'tools/list'
    };

    const response = await this.sendRequest(request);
    return response.result?.tools || [];
  }

  private async sendRequest(request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.serverProcess?.stdin) {
        reject(new Error('Server not started'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout for ID ${request.id}`));
      }, 10000);

      const onResponse = (response: any) => {
        if (response.id === request.id) {
          clearTimeout(timeout);
          this.removeListener('response', onResponse);
          resolve(response);
        }
      };

      this.on('response', onResponse);
      
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async stopServer(): Promise<void> {
    return new Promise((resolve) => {
      if (this.serverProcess) {
        this.serverProcess.on('close', () => {
          this.serverProcess = null;
          this.isInitialized = false;
          resolve();
        });
        
        this.serverProcess.kill();
      } else {
        resolve();
      }
    });
  }

  isRunning(): boolean {
    return this.serverProcess !== null && !this.serverProcess.killed;
  }
}

// Global test client instance
let globalTestClient: McpServerTestClient | null = null;

export async function getTestClient(): Promise<McpServerTestClient> {
  if (!globalTestClient) {
    globalTestClient = new McpServerTestClient();
    await globalTestClient.startServer();
  }
  return globalTestClient;
}

export async function cleanupTestClient(): Promise<void> {
  if (globalTestClient) {
    await globalTestClient.stopServer();
    globalTestClient = null;
  }
}