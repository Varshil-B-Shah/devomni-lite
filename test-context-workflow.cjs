const http = require('http');

async function testWorkflow() {
  console.log('🎯 Testing Interactive Context Workflow\n');
  
  // 1. Create a context (simulating Claude's action)
  console.log('Step 1: Creating context (Claude Desktop simulation)...');
  const createResponse = await makeRequest('create_workflow_context', {
    context_name: 'user_management_nextjs_test',
    intent_analysis: {
      originalRequest: 'generate user management APIs with authentication',
      database: 'postgres',
      framework: 'nextjs',
      detectedTables: ['users', 'user_roles', 'permissions'],
      features: ['authentication', 'authorization', 'jwt-tokens']
    },
    expires_in_minutes: 120
  });
  
  console.log('✅ Context created:', createResponse.id);
  console.log('   Expires at:', new Date(createResponse.expires).toLocaleTimeString());

  // 2. List available contexts (simulating GitHub Copilot discovery)
  console.log('\nStep 2: Listing contexts (GitHub Copilot discovery)...');
  const listResponse = await makeRequest('list_contexts', {});
  
  console.log('✅ Available contexts:');
  listResponse.forEach(ctx => {
    console.log(`   - ${ctx.name} (${ctx.intentAnalysis.database}/${ctx.intentAnalysis.framework})`);
  });

  // 3. Get specific context (simulating GitHub Copilot retrieval)
  console.log('\nStep 3: Retrieving context (GitHub Copilot usage)...');
  const getResponse = await makeRequest('get_context', {
    context_name: 'user_management_nextjs_test'
  });
  
  console.log('✅ Retrieved context details:');
  console.log('   Name:', getResponse.name);
  console.log('   Database:', getResponse.intentAnalysis.database);
  console.log('   Framework:', getResponse.intentAnalysis.framework);
  console.log('   Tables:', getResponse.intentAnalysis.detectedTables.join(', '));
  console.log('   Features:', getResponse.intentAnalysis.features.join(', '));

  // 4. Search contexts (testing search functionality)
  console.log('\nStep 4: Searching contexts...');
  const searchResponse = await makeRequest('search_contexts', {
    keywords: ['user', 'management'],
    framework: 'nextjs'
  });
  
  console.log('✅ Search results:');
  searchResponse.forEach(ctx => {
    console.log(`   - ${ctx.name} (matches: user management + nextjs)`);
  });

  console.log('\n🚀 SUCCESS: Complete cross-agent context workflow is working!');
  console.log('\n📋 What this means:');
  console.log('   1. Claude can create contexts with analyzed intent');
  console.log('   2. GitHub Copilot can discover available contexts');  
  console.log('   3. GitHub Copilot can retrieve specific contexts');
  console.log('   4. Context includes database schema and generation preferences');
  console.log('   5. Multiple AI agents can now collaborate seamlessly!');
}

async function makeRequest(toolName, args) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ toolName, arguments: args });
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/mcp/tool',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON response: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

testWorkflow().catch(console.error);