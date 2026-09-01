#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const testTypes = {
  unit: {
    description: 'Run unit tests for components and hooks',
    command: 'npm',
    args: ['test', '--', '--testPathPattern=__tests__', '--verbose'],
    timeout: 60000
  },
  integration: {
    description: 'Run integration tests for user flows',
    command: 'npm',
    args: ['test', '--', '--testPathPattern=integration', '--runInBand'],
    timeout: 120000
  },
  coverage: {
    description: 'Run tests with coverage report',
    command: 'npm',
    args: ['test', '--', '--coverage', '--watchAll=false'],
    timeout: 90000
  },
  smoke: {
    description: 'Run smoke tests for critical functionality',
    command: 'npm',
    args: ['test', '--', '--testNamePattern=smoke', '--verbose'],
    timeout: 30000
  },
  watch: {
    description: 'Run tests in watch mode',
    command: 'npm',
    args: ['test'],
    timeout: 0 // No timeout for watch mode
  }
};

function runTest(testType) {
  const config = testTypes[testType];
  if (!config) {
    console.error(`❌ Unknown test type: ${testType}`);
    console.log('Available test types:');
    Object.keys(testTypes).forEach(key => {
      console.log(`  ${key}: ${testTypes[key].description}`);
    });
    process.exit(1);
  }

  console.log(`🧪 Running ${testType} tests: ${config.description}`);
  console.log(`📝 Command: ${config.command} ${config.args.join(' ')}`);
  console.log('─'.repeat(50));

  const startTime = Date.now();
  const child = spawn(config.command, config.args, {
    stdio: 'inherit',
    shell: true,
    cwd: path.resolve(__dirname, '..')
  });

  if (config.timeout > 0) {
    setTimeout(() => {
      console.log(`⏰ Test timeout (${config.timeout}ms) reached, terminating...`);
      child.kill('SIGTERM');
    }, config.timeout);
  }

  child.on('close', (code) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('─'.repeat(50));
    
    if (code === 0) {
      console.log(`✅ ${testType} tests completed successfully in ${duration}s`);
    } else {
      console.log(`❌ ${testType} tests failed with code ${code} after ${duration}s`);
    }
    
    process.exit(code);
  });

  child.on('error', (error) => {
    console.error(`❌ Failed to start tests: ${error.message}`);
    process.exit(1);
  });
}

function showHelp() {
  console.log('🧪 Cafe QR App Test Runner');
  console.log('Usage: node scripts/test-runner.js <test-type>');
  console.log('');
  console.log('Available test types:');
  Object.keys(testTypes).forEach(key => {
    console.log(`  ${key.padEnd(12)} ${testTypes[key].description}`);
  });
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/test-runner.js unit');
  console.log('  node scripts/test-runner.js coverage');
  console.log('  node scripts/test-runner.js watch');
}

// Main execution
const testType = process.argv[2];

if (!testType || testType === '--help' || testType === '-h') {
  showHelp();
  process.exit(0);
}

// Check if npm is available
try {
  const { execSync } = require('child_process');
  execSync('npm --version', { stdio: 'ignore' });
} catch (error) {
  console.error('❌ npm is not available. Please install Node.js and npm.');
  process.exit(1);
}

// Check if package.json exists
const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ package.json not found. Run this script from the project root.');
  process.exit(1);
}

runTest(testType);