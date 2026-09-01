#!/usr/bin/env node

/**
 * Load Testing Script for Cafe QR App
 * Simulates concurrent users performing various actions
 */

const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');

// Configuration
const CONFIG = {
  baseUrl: process.env.TEST_URL || 'http://localhost:3000',
  concurrent: parseInt(process.env.CONCURRENT_USERS) || 10,
  duration: parseInt(process.env.TEST_DURATION) || 60, // seconds
  scenarios: {
    menuBrowsing: { weight: 40, path: '/menu' },
    ordering: { weight: 30, path: '/menu?mode=takeaway' },
    special: { weight: 20, path: '/menu?filter=special' },
    admin: { weight: 10, path: '/admin' }
  }
};

class LoadTester {
  constructor() {
    this.stats = {
      requests: 0,
      responses: 0,
      errors: 0,
      responseTimes: [],
      errorTypes: {},
      startTime: null
    };
  }

  async start() {
    console.log('🚀 Starting Cafe QR App Load Test');
    console.log(`📊 Config: ${CONFIG.concurrent} users, ${CONFIG.duration}s duration`);
    console.log('─'.repeat(50));

    this.stats.startTime = performance.now();
    
    const promises = [];
    for (let i = 0; i < CONFIG.concurrent; i++) {
      promises.push(this.simulateUser(i));
    }

    await Promise.all(promises);
    this.printResults();
  }

  async simulateUser(userId) {
    const endTime = Date.now() + (CONFIG.duration * 1000);
    
    while (Date.now() < endTime) {
      const scenario = this.selectScenario();
      await this.executeRequest(userId, scenario);
      
      // Random delay between requests
      await new Promise(resolve => 
        setTimeout(resolve, Math.random() * 1000 + 500)
      );
    }
  }

  selectScenario() {
    const rand = Math.random() * 100;
    let cumulative = 0;
    
    for (const [name, config] of Object.entries(CONFIG.scenarios)) {
      cumulative += config.weight;
      if (rand <= cumulative) {
        return { name, ...config };
      }
    }
    
    return { name: 'menuBrowsing', ...CONFIG.scenarios.menuBrowsing };
  }

  async executeRequest(userId, scenario) {
    const startTime = performance.now();
    this.stats.requests++;

    try {
      const response = await this.makeRequest(scenario.path);
      const responseTime = performance.now() - startTime;
      
      this.stats.responses++;
      this.stats.responseTimes.push(responseTime);
      
      if (responseTime > 5000) {
        console.log(`⚠️ Slow response: ${responseTime.toFixed(2)}ms for ${scenario.name}`);
      }
      
    } catch (error) {
      this.stats.errors++;
      this.stats.errorTypes[error.message] = (this.stats.errorTypes[error.message] || 0) + 1;
      
      if (this.stats.errors % 10 === 0) {
        console.log(`❌ Error count: ${this.stats.errors} (${error.message})`);
      }
    }
  }

  makeRequest(path) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, CONFIG.baseUrl);
      const client = url.protocol === 'https:' ? https : http;
      
      const request = client.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'LoadTest/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      }, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve({ statusCode: response.statusCode, data }));
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('TIMEOUT'));
      });
    });
  }

  printResults() {
    const duration = (performance.now() - this.stats.startTime) / 1000;
    const { responses, errors, responseTimes } = this.stats;
    
    // Calculate statistics
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length || 0;
    const p95ResponseTime = this.percentile(responseTimes, 95);
    const p99ResponseTime = this.percentile(responseTimes, 99);
    const rps = responses / duration;
    const errorRate = (errors / (responses + errors)) * 100;

    console.log('\n📊 Load Test Results');
    console.log('─'.repeat(50));
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log(`Total Requests: ${responses + errors}`);
    console.log(`Successful: ${responses}`);
    console.log(`Errors: ${errors} (${errorRate.toFixed(2)}%)`);
    console.log(`Requests/sec: ${rps.toFixed(2)}`);
    console.log(`Avg Response Time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`95th Percentile: ${p95ResponseTime.toFixed(2)}ms`);
    console.log(`99th Percentile: ${p99ResponseTime.toFixed(2)}ms`);

    if (Object.keys(this.stats.errorTypes).length > 0) {
      console.log('\n❌ Error Types:');
      Object.entries(this.stats.errorTypes).forEach(([error, count]) => {
        console.log(`   ${error}: ${count}`);
      });
    }

    // Performance assessment
    console.log('\n🎯 Performance Assessment:');
    if (errorRate < 1) {
      console.log('✅ Error rate: EXCELLENT (< 1%)');
    } else if (errorRate < 5) {
      console.log('⚠️ Error rate: ACCEPTABLE (< 5%)');
    } else {
      console.log('❌ Error rate: POOR (>= 5%)');
    }

    if (avgResponseTime < 1000) {
      console.log('✅ Avg response time: EXCELLENT (< 1s)');
    } else if (avgResponseTime < 3000) {
      console.log('⚠️ Avg response time: ACCEPTABLE (< 3s)');
    } else {
      console.log('❌ Avg response time: POOR (>= 3s)');
    }

    if (p95ResponseTime < 2000) {
      console.log('✅ 95th percentile: EXCELLENT (< 2s)');
    } else if (p95ResponseTime < 5000) {
      console.log('⚠️ 95th percentile: ACCEPTABLE (< 5s)');
    } else {
      console.log('❌ 95th percentile: POOR (>= 5s)');
    }
  }

  percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }
}

// Memory usage monitoring
function startMemoryMonitoring() {
  setInterval(() => {
    const usage = process.memoryUsage();
    const mb = (bytes) => Math.round(bytes / 1024 / 1024 * 100) / 100;
    
    if (usage.heapUsed > 100 * 1024 * 1024) { // 100MB
      console.log(`⚠️ Memory usage: ${mb(usage.heapUsed)}MB`);
    }
  }, 10000);
}

// Main execution
if (require.main === module) {
  startMemoryMonitoring();
  
  const tester = new LoadTester();
  tester.start().catch(error => {
    console.error('❌ Load test failed:', error);
    process.exit(1);
  });
}

module.exports = LoadTester;