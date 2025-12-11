#!/usr/bin/env node

/**
 * Cleanup script to remove expired workflow contexts
 * Run with: node cleanup-contexts.js
 */

import { SharedContextStorage } from './dist/sharedContextStorage.js';

async function cleanup() {
  try {
    const storage = new SharedContextStorage();
    
    console.log('🧹 Cleaning up expired workflow contexts...\n');
    
    const deletedCount = storage.cleanupExpiredContexts();
    
    if (deletedCount > 0) {
      console.log(`✅ Deleted ${deletedCount} expired context(s)`);
    } else {
      console.log('✅ No expired contexts found');
    }
    
    // List remaining contexts
    const remaining = storage.listContexts(false);
    console.log(`\n📋 Active contexts remaining: ${remaining.length}`);
    remaining.forEach(ctx => {
      console.log(`  - ${ctx.name}`);
    });
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
  }
}

cleanup();
