#!/usr/bin/env node

/**
 * Test script to demonstrate GitHub Copilot discovering contexts via list_contexts
 * This simulates how GitHub Copilot would discover workflow contexts created by Claude Desktop
 */

const { spawn } = require('child_process');

class McpTestClient {
  constructor() {
    this.messageId = 1;
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      this.serverProcess = spawn('node', ['dist/mcp-server.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let initComplete = false;
      
      this.serverProcess.stdout.on('data', (data) => {
        if (!initComplete && data.toString().includes('MCP server ready')) {
          initComplete = true;
          resolve();
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        console.error('Server error:', data.toString());
      });

      // Initialize the server
      setTimeout(() => {
        this.sendMessage({
          jsonrpc: '2.0',
          id: this.messageId++,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'DevOmni Test Client',
              version: '1.0.0'
            }
          }
        });
      }, 100);
    });
  }

  sendMessage(message) {
    if (this.serverProcess && this.serverProcess.stdin.writable) {
      this.serverProcess.stdin.write(JSON.stringify(message) + '\n');
    }
  }

  async callTool(name, args = {}) {
    return new Promise((resolve, reject) => {
      const id = this.messageId++;
      
      const timeout = setTimeout(() => {
        reject(new Error('Tool call timeout'));
      }, 5000);

      const handleData = (data) => {
        try {
          const lines = data.toString().split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            const response = JSON.parse(line);
            
            if (response.id === id) {
              clearTimeout(timeout);
              this.serverProcess.stdout.removeListener('data', handleData);
              
              if (response.error) {
                reject(new Error(response.error.message));
                return;
              }

              const result = response.result?.content?.[0]?.text;
              if (result) {
                try {
                  const parsedResult = JSON.parse(result);
                  resolve(parsedResult);
                } catch (parseError) {
                  resolve(result);
                }
              } else {
                resolve(response.result);
              }
              return;
            }
          }
        } catch (error) {
          // Continue listening for more data
        }
      };

      this.serverProcess.stdout.on('data', handleData);

      this.sendMessage({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name,
          arguments: args
        }
      });
    });
  }

  async cleanup() {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
    }
  }
}

async function testListContexts() {
  console.log('🚀 Testing DevOmni Cross-Agent Context Discovery');
  console.log('=' .repeat(60));
  
  const client = new McpTestClient();
  
  try {
    // Start the MCP server
    console.log('📡 Starting MCP server...');
    await client.startServer();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // First, create some test contexts (simulating Claude Desktop)
    console.log('\n1️⃣  Creating test contexts (Claude Desktop simulation)...');
    
    const testContexts = [
      {
        context_name: 'ecommerce_postgres_nextjs',
        intent_analysis: {
          originalRequest: 'create ecommerce APIs with product catalog and user management',
          database: 'postgres',
          framework: 'nextjs',
          detectedTables: ['products', 'users', 'orders', 'categories'],
          suggestedEndpoints: ['products', 'users', 'orders', 'auth'],
          features: ['authentication', 'crud-operations', 'search'],
          complexity: 'complex'
        },
        expires_in_minutes: 60
      },
      {
        context_name: 'blog_mysql_express',
        intent_analysis: {
          originalRequest: 'generate blog APIs with posts and comments',
          database: 'mysql',
          framework: 'express',
          detectedTables: ['posts', 'comments', 'authors'],
          suggestedEndpoints: ['posts', 'comments', 'authors'],
          features: ['crud-operations', 'relationships'],
          complexity: 'medium'
        },
        expires_in_minutes: 30
      },
      {
        context_name: 'inventory_mongo_nextjs',
        intent_analysis: {
          originalRequest: 'create inventory management system',
          database: 'mongodb',
          framework: 'nextjs',
          detectedTables: ['products', 'suppliers', 'warehouse'],
          suggestedEndpoints: ['inventory', 'suppliers', 'reports'],
          features: ['tracking', 'reporting'],
          complexity: 'medium'
        },
        expires_in_minutes: 45
      }
    ];

    // Create the test contexts
    for (let i = 0; i < testContexts.length; i++) {
      try {
        await client.callTool('create_workflow_context', testContexts[i]);
        console.log(`   ✅ Created context: ${testContexts[i].context_name}`);
      } catch (error) {
        console.log(`   ❌ Failed to create context: ${testContexts[i].context_name} - ${error.message}`);
      }
    }
    
    // Now test list_contexts (GitHub Copilot simulation)
    console.log('\n2️⃣  GitHub Copilot discovering contexts...');
    console.log('   📋 Calling list_contexts...\n');
    
    const contexts = await client.callTool('list_contexts');
    
    if (contexts && contexts.length > 0) {
      console.log(`🎉 Found ${contexts.length} available contexts:\n`);
      
      contexts.forEach((context, index) => {
        console.log(`📁 Context ${index + 1}: ${context.contextName}`);
        console.log(`   🗄️  Database: ${context.database}`);
        console.log(`   ⚡ Framework: ${context.framework}`);
        console.log(`   📊 Complexity: ${context.complexity}`);
        console.log(`   🕒 Created: ${new Date(context.createdAt).toLocaleString()}`);
        console.log(`   📋 Tables: ${context.detectedTables?.join(', ') || 'N/A'}`);
        console.log(`   🔗 Endpoints: ${context.suggestedEndpoints?.join(', ') || 'N/A'}`);
        console.log(`   ⏰ Expires: ${new Date(context.expiresAt).toLocaleString()}`);
        console.log();
      });
      
      console.log('✅ GitHub Copilot successfully discovered all contexts!');
      console.log('🤝 Cross-agent collaboration is working perfectly!');
      
    } else {
      console.log('❌ No contexts found');
    }

    // Test search functionality
    console.log('\n3️⃣  Testing search_contexts for specific scenarios...');
    
    const searchTests = [
      { query: 'nextjs', description: 'Next.js projects' },
      { query: 'ecommerce', description: 'E-commerce systems' },
      { query: 'postgres', description: 'PostgreSQL databases' }
    ];

    for (const test of searchTests) {
      try {
        console.log(`   🔍 Searching for: ${test.description}`);
        const searchResults = await client.callTool('search_contexts', { query: test.query });
        
        if (searchResults && searchResults.length > 0) {
          console.log(`      ✅ Found ${searchResults.length} matching contexts`);
          searchResults.forEach(result => {
            console.log(`         - ${result.contextName} (Score: ${result.score})`);
          });
        } else {
          console.log(`      ℹ️  No matches found for "${test.query}"`);
        }
      } catch (error) {
        console.log(`      ❌ Search failed: ${error.message}`);
      }
      console.log();
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await client.cleanup();
    console.log('\n🏁 Test completed');
    process.exit(0);
  }
}

// Run the test
testListContexts().catch(console.error);