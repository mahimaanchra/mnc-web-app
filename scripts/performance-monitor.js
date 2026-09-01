#!/usr/bin/env node

/**
 * Performance Monitoring Script
 * Monitors key performance metrics during development and testing
 */

const puppeteer = require('puppeteer');
const { performance, PerformanceObserver } = require('perf_hooks');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      loadTime: [],
      firstPaint: [],
      firstContentfulPaint: [],
      largestContentfulPaint: [],
      firstInputDelay: [],
      cumulativeLayoutShift: [],
      memoryUsage: [],
      bundle: { size: 0, gzipped: 0 }
    };
  }

  async measureWebVitals(url = 'http://localhost:3000') {
    console.log('📊 Measuring Web Vitals...');
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      // Enable performance monitoring
      await page.setCacheEnabled(false);
      await page.coverage.startCSSCoverage();
      await page.coverage.startJSCoverage();
      
      // Collect performance metrics
      const startTime = performance.now();
      
      await page.goto(url, { waitUntil: 'networkidle0' });
      
      const loadTime = performance.now() - startTime;
      this.metrics.loadTime.push(loadTime);
      
      // Get Web Vitals
      const webVitals = await page.evaluate(() => {
        return new Promise((resolve) => {
          const vitals = {};
          
          // Performance Observer for Web Vitals
          const observer = new PerformanceObserver((list) => {
            list.getEntries().forEach((entry) => {
              if (entry.entryType === 'paint') {
                vitals[entry.name] = entry.startTime;
              }
              if (entry.entryType === 'largest-contentful-paint') {
                vitals.lcp = entry.startTime;
              }
            });
          });
          
          observer.observe({ entryTypes: ['paint', 'largest-contentful-paint'] });
          
          // Collect other metrics
          setTimeout(() => {
            const navigation = performance.getEntriesByType('navigation')[0];
            vitals.domContentLoaded = navigation.domContentLoadedEventEnd - navigation.navigationStart;
            vitals.loadComplete = navigation.loadEventEnd - navigation.navigationStart;
            
            // Memory usage (if available)
            if (performance.memory) {
              vitals.memory = {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit
              };
            }
            
            resolve(vitals);
          }, 1000);
        });
      });
      
      // Store metrics
      if (webVitals['first-paint']) {
        this.metrics.firstPaint.push(webVitals['first-paint']);
      }
      if (webVitals['first-contentful-paint']) {
        this.metrics.firstContentfulPaint.push(webVitals['first-contentful-paint']);
      }
      if (webVitals.lcp) {
        this.metrics.largestContentfulPaint.push(webVitals.lcp);
      }
      if (webVitals.memory) {
        this.metrics.memoryUsage.push(webVitals.memory.used);
      }
      
      // Get bundle size information
      const [jsCoverage, cssCoverage] = await Promise.all([
        page.coverage.stopJSCoverage(),
        page.coverage.stopCSSCoverage()
      ]);
      
      let totalBytes = 0;
      jsCoverage.forEach(entry => totalBytes += entry.text.length);
      cssCoverage.forEach(entry => totalBytes += entry.text.length);
      
      this.metrics.bundle.size = totalBytes;
      
      return webVitals;
      
    } finally {
      await browser.close();
    }
  }

  async testUserInteractions(url = 'http://localhost:3000') {
    console.log('🎯 Testing User Interaction Performance...');
    
    const browser = await puppeteer.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();
    
    try {
      await page.goto(url);
      
      // Wait for menu to load
      await page.waitForSelector('[data-testid="menu-item"], .bg-\\[\\#242424\\]', { timeout: 10000 });
      
      // Measure menu browsing performance
      const menuStartTime = performance.now();
      await page.click('button:has-text("🍔 Burger")'); // Category filter
      await page.waitForTimeout(500);
      const menuFilterTime = performance.now() - menuStartTime;
      
      // Measure cart operations
      const cartStartTime = performance.now();
      await page.click('button:has-text("Add")');
      await page.waitForSelector('text="1 item"', { timeout: 5000 });
      const addToCartTime = performance.now() - cartStartTime;
      
      // Measure checkout flow
      const checkoutStartTime = performance.now();
      await page.click('button:has-text("Cart")');
      await page.waitForSelector('text="Your Cart"', { timeout: 5000 });
      const cartOpenTime = performance.now() - checkoutStartTime;
      
      console.log(`📊 Interaction Times:`);
      console.log(`   Menu Filter: ${menuFilterTime.toFixed(2)}ms`);
      console.log(`   Add to Cart: ${addToCartTime.toFixed(2)}ms`);
      console.log(`   Open Cart: ${cartOpenTime.toFixed(2)}ms`);
      
      return {
        menuFilter: menuFilterTime,
        addToCart: addToCartTime,
        cartOpen: cartOpenTime
      };
      
    } finally {
      await browser.close();
    }
  }

  async testMobilePerformance(url = 'http://localhost:3000') {
    console.log('📱 Testing Mobile Performance...');
    
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
      // Simulate mobile device
      await page.emulate({
        name: 'iPhone 12',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        viewport: {
          width: 390,
          height: 844,
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
          isLandscape: false,
        }
      });
      
      // Simulate slow 3G network
      await page.emulateNetworkConditions({
        offline: false,
        downloadThroughput: 500 * 1024, // 500kb/s
        uploadThroughput: 500 * 1024,
        latency: 400, // 400ms
      });
      
      const startTime = performance.now();
      await page.goto(url, { waitUntil: 'networkidle0' });
      const mobileLoadTime = performance.now() - startTime;
      
      // Test mobile interactions
      await page.waitForSelector('button:has-text("🛍️ Order Takeaway")', { timeout: 15000 });
      
      const tapStartTime = performance.now();
      await page.tap('button:has-text("🛍️ Order Takeaway")');
      const tapResponseTime = performance.now() - tapStartTime;
      
      console.log(`📱 Mobile Metrics:`);
      console.log(`   Load Time (3G): ${mobileLoadTime.toFixed(2)}ms`);
      console.log(`   Tap Response: ${tapResponseTime.toFixed(2)}ms`);
      
      return {
        loadTime: mobileLoadTime,
        tapResponse: tapResponseTime
      };
      
    } finally {
      await browser.close();
    }
  }

  async runMemoryStressTest(url = 'http://localhost:3000') {
    console.log('🧠 Running Memory Stress Test...');
    
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
      await page.goto(url);
      
      const initialMemory = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
      
      // Simulate heavy usage
      for (let i = 0; i < 50; i++) {
        // Add items to cart repeatedly
        await page.evaluate(() => {
          const addButtons = document.querySelectorAll('button:has-text("Add")');
          if (addButtons.length > 0) {
            addButtons[0].click();
          }
        });
        
        await page.waitForTimeout(100);
        
        // Check memory every 10 iterations
        if (i % 10 === 0) {
          const currentMemory = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
          const memoryIncrease = currentMemory - initialMemory;
          
          if (memoryIncrease > 10 * 1024 * 1024) { // 10MB increase
            console.log(`⚠️ Memory leak detected: +${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
            break;
          }
        }
      }
      
      const finalMemory = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
      const memoryDelta = finalMemory - initialMemory;
      
      console.log(`🧠 Memory Usage:`);
      console.log(`   Initial: ${(initialMemory / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Final: ${(finalMemory / 1024 / 1024).toFixed(2)}MB`);
      console.log(`   Delta: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB`);
      
      return { initialMemory, finalMemory, memoryDelta };
      
    } finally {
      await browser.close();
    }
  }

  generateReport() {
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length || 0;
    const max = (arr) => Math.max(...arr) || 0;
    
    console.log('\n📊 Performance Report');
    console.log('═'.repeat(50));
    
    if (this.metrics.loadTime.length > 0) {
      console.log(`Load Time: ${avg(this.metrics.loadTime).toFixed(2)}ms (max: ${max(this.metrics.loadTime).toFixed(2)}ms)`);
    }
    
    if (this.metrics.firstPaint.length > 0) {
      console.log(`First Paint: ${avg(this.metrics.firstPaint).toFixed(2)}ms`);
    }
    
    if (this.metrics.firstContentfulPaint.length > 0) {
      console.log(`First Contentful Paint: ${avg(this.metrics.firstContentfulPaint).toFixed(2)}ms`);
    }
    
    if (this.metrics.largestContentfulPaint.length > 0) {
      console.log(`Largest Contentful Paint: ${avg(this.metrics.largestContentfulPaint).toFixed(2)}ms`);
    }
    
    console.log(`Bundle Size: ${(this.metrics.bundle.size / 1024).toFixed(2)}KB`);
    
    // Performance grades
    console.log('\n🎯 Performance Grades:');
    
    const avgLoadTime = avg(this.metrics.loadTime);
    if (avgLoadTime < 2000) {
      console.log('✅ Load Time: A (< 2s)');
    } else if (avgLoadTime < 4000) {
      console.log('⚠️ Load Time: B (< 4s)');
    } else {
      console.log('❌ Load Time: C (>= 4s)');
    }
    
    const avgFCP = avg(this.metrics.firstContentfulPaint);
    if (avgFCP < 1800) {
      console.log('✅ First Contentful Paint: A (< 1.8s)');
    } else if (avgFCP < 3000) {
      console.log('⚠️ First Contentful Paint: B (< 3s)');
    } else {
      console.log('❌ First Contentful Paint: C (>= 3s)');
    }
    
    const avgLCP = avg(this.metrics.largestContentfulPaint);
    if (avgLCP < 2500) {
      console.log('✅ Largest Contentful Paint: A (< 2.5s)');
    } else if (avgLCP < 4000) {
      console.log('⚠️ Largest Contentful Paint: B (< 4s)');
    } else {
      console.log('❌ Largest Contentful Paint: C (>= 4s)');
    }
  }

  async runFullSuite(url = 'http://localhost:3000') {
    console.log('🚀 Running Full Performance Test Suite...\n');
    
    try {
      // Run all tests
      await this.measureWebVitals(url);
      await this.testUserInteractions(url);
      await this.testMobilePerformance(url);
      await this.runMemoryStressTest(url);
      
      // Generate report
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Performance test failed:', error.message);
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const url = process.argv[2] || 'http://localhost:3000';
  const monitor = new PerformanceMonitor();
  
  monitor.runFullSuite(url).catch(error => {
    console.error('❌ Performance monitoring failed:', error);
    process.exit(1);
  });
}

module.exports = PerformanceMonitor;