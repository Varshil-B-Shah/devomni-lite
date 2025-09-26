import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { McpServerTestClient, getTestClient, cleanupTestClient } from './mcpTestClient';

/**
 * Basic MCP Server Tests
 * 
 * Tests core MCP server functionality to ensure our testing infrastructure works.
 */

describe('MCP Server Basic Tests', () => {
  let mcpClient: McpServerTestClient;

  beforeAll(async () => {
    mcpClient = await getTestClient();
  }, 30000);

  afterAll(async () => {
    await cleanupTestClient();
  }, 10000);

  test('should list available tools', async () => {
    const tools = await mcpClient.listTools();
    
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    
    // Check for our new context management tools
    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain('analyze_intent');
    expect(toolNames).toContain('generate_preview');
    expect(toolNames).toContain('create_workflow_context');
    expect(toolNames).toContain('list_contexts');
    expect(toolNames).toContain('search_contexts');
    expect(toolNames).toContain('get_context');
    
    // Check for existing tools
    expect(toolNames).toContain('unified_query');
    expect(toolNames).toContain('get_database_schema');
    expect(toolNames).toContain('list_connection_profiles');
  });

  test('should analyze intent correctly', async () => {
    const result = await mcpClient.callTool('analyze_intent', {
      user_request: 'generate user management APIs with authentication',
      database: 'postgres',
      framework: 'nextjs'
    });

    expect(result).toMatchObject({
      originalRequest: 'generate user management APIs with authentication',
      database: 'postgres',
      framework: 'nextjs',
      detectedTables: expect.arrayContaining(['users', 'user_roles', 'permissions']),
      suggestedEndpoints: expect.arrayContaining(['auth', 'profile', 'admin']),
      features: expect.arrayContaining(['authentication', 'authorization']),
      complexity: 'medium'
    });
  });

  test('should create and retrieve workflow context', async () => {
    const contextName = `test_basic_${Date.now()}`;
    const intentAnalysis = {
      originalRequest: 'test request',
      database: 'postgres',
      framework: 'nextjs',
      detectedTables: ['test_table'],
      features: ['testing']
    };

    // Create context
    const createResult = await mcpClient.callTool('create_workflow_context', {
      context_name: contextName,
      intent_analysis: intentAnalysis,
      expires_in_minutes: 60
    });

    expect(createResult.id).toBe(contextName);
    expect(createResult.status).toBe('ready');

    // Retrieve context
    const getResult = await mcpClient.callTool('get_context', {
      context_name: contextName
    });

    expect(getResult.name).toBe(contextName);
    expect(getResult.intentAnalysis).toEqual(intentAnalysis);
  });

  test('should list contexts', async () => {
    const contexts = await mcpClient.callTool('list_contexts', {});
    
    expect(Array.isArray(contexts)).toBe(true);
    // Should have at least the context from previous test
    expect(contexts.length).toBeGreaterThan(0);
  });

  test('should handle validation errors', async () => {
    await expect(
      mcpClient.callTool('analyze_intent', {
        // Missing required user_request
        database: 'postgres',
        framework: 'nextjs'
      })
    ).rejects.toThrow(/validation failed/);
  });
});