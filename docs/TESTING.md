# 🧪 Testing Guide for Cafe QR App

This document outlines the comprehensive testing strategy for the Cafe QR application, covering unit tests, integration tests, performance testing, and CI/CD automation.

## 📚 Table of Contents

- [Testing Architecture](#testing-architecture)
- [Unit Tests](#unit-tests)
- [Integration Tests](#integration-tests)  
- [Edge Case Testing](#edge-case-testing)
- [Performance Testing](#performance-testing)
- [Load Testing](#load-testing)
- [CI/CD Pipeline](#cicd-pipeline)
- [Running Tests](#running-tests)
- [Coverage Reports](#coverage-reports)

## 🏗️ Testing Architecture

### Test Types & Coverage

| Test Type | Coverage | Files | Purpose |
|-----------|----------|-------|---------|
| **Unit Tests** | Components, Hooks, Utils | `src/**/__tests__/*.test.jsx` | Isolated component logic |
| **Integration Tests** | User Flows | `src/integration/**/*.test.jsx` | End-to-end user journeys |
| **Edge Cases** | Error Scenarios | `src/integration/**/*EdgeCases.test.jsx` | Error handling, network issues |
| **Performance Tests** | Web Vitals, Load Time | `scripts/performance-monitor.js` | Performance metrics |
| **Load Tests** | Concurrent Users | `scripts/load-test.js` | Scalability testing |

### Testing Stack

- **Framework**: Jest + React Testing Library
- **Mocking**: Firebase mocks, Component mocks
- **Performance**: Puppeteer-based monitoring  
- **Load Testing**: Custom Node.js stress testing
- **CI/CD**: GitHub Actions automation

## 🧪 Unit Tests

### Component Tests

**CustomerMenu Component** (`src/pages/__tests__/CustomerMenu.test.jsx`)
- ✅ Phone gate modal for new users
- ✅ Menu item loading and display
- ✅ Category filtering (including MNC Special)
- ✅ Cart operations (add, update, remove)
- ✅ Checkout flow with table selection bypass
- ✅ Loyalty streak integration
- ✅ Mobile responsive behavior

**AdminMenu Component** (`src/components/__tests__/AdminMenu.test.jsx`)
- ✅ Menu item CRUD operations
- ✅ Stock status toggling
- ✅ Order management and status updates
- ✅ Form validation and error handling
- ✅ Navigation security (back button prevention)
- ✅ Real-time order notifications

**HomePage Component** (`src/pages/__tests__/HomePage.test.jsx`)
- ✅ CTA button functionality
- ✅ Table selection modal with tap-to-select grid
- ✅ Mode selection persistence
- ✅ Navigation routing
- ✅ Mobile viewport adaptations

### Hook Tests

**useLoyalty Hook** (`src/hooks/__tests__/useLoyalty.test.js`)
- ✅ Customer profile fetching
- ✅ Order recording and streak calculation
- ✅ Firebase error handling
- ✅ Concurrent request safety
- ✅ Data validation and sanitization

## 🔗 Integration Tests

### Complete User Journeys

**Full Order Flows** (`src/integration/__tests__/UserFlows.test.jsx`)

1. **🛍️ Takeaway Order Flow**
   - Homepage → Takeaway selection
   - Phone verification (new user)  
   - Menu browsing and item selection
   - Cart operations and checkout
   - Order confirmation

2. **🪑 Dine-In Order Flow**
   - Table selection with tap-to-select grid
   - Phone verification
   - Menu browsing with table context
   - Multi-item cart with variants/addons
   - Checkout with table confirmation

3. **⭐ MNC Special Flow**
   - Special category access
   - Table selection bypass
   - Special-only item filtering
   - Streamlined checkout process

4. **🔄 Deferred Dining Mode**
   - Menu access without preset mode
   - Dining option selection at checkout
   - Dynamic table number request
   - Flow completion validation

5. **🎁 Loyalty Streak Flow**  
   - 7th order detection
   - Free burger automatic addition
   - Streak completion celebration
   - Reward fulfillment verification

6. **📱 Mobile Experience**
   - Mobile viewport constraints
   - Touch interaction optimization
   - Progressive web app behavior
   - Session persistence across refreshes

## ⚠️ Edge Case Testing  

**Network & Connectivity** (`src/integration/__tests__/EdgeCases.test.jsx`)
- ✅ Firebase connection failures
- ✅ Order placement network errors
- ✅ Partial data loading scenarios
- ✅ Connection timeout handling

**Input Validation**
- ✅ Invalid phone number formats
- ✅ Malformed menu item data
- ✅ XSS prevention in admin forms
- ✅ Long text content handling
- ✅ Broken image URL fallbacks

**Session Management**
- ✅ Active order interception modal
- ✅ Add to current vs. new order flow
- ✅ Race condition prevention
- ✅ Component unmounting during async ops
- ✅ Memory leak prevention

**Security Edge Cases**
- ✅ Admin panel navigation restrictions
- ✅ Browser back button hijacking prevention
- ✅ Input sanitization validation
- ✅ Malicious file upload prevention

## ⚡ Performance Testing

### Web Vitals Monitoring (`scripts/performance-monitor.js`)

**Core Web Vitals**
- **First Paint (FP)**: < 1.8s target
- **First Contentful Paint (FCP)**: < 1.8s target  
- **Largest Contentful Paint (LCP)**: < 2.5s target
- **First Input Delay (FID)**: < 100ms target
- **Cumulative Layout Shift (CLS)**: < 0.1 target

**Performance Grades**
- **A Grade**: Excellent (meets all targets)
- **B Grade**: Acceptable (minor delays)
- **C Grade**: Needs optimization

**Mobile Performance**
- Slow 3G network simulation
- Mobile device emulation (iPhone 12)
- Touch interaction responsiveness
- Bundle size optimization

**Memory Stress Testing**
- Memory leak detection
- Garbage collection monitoring  
- Heavy usage simulation
- Memory growth tracking

### Running Performance Tests

```bash
# Full performance suite
npm run perf-test

# With custom URL
node scripts/performance-monitor.js http://localhost:3000

# Mobile-specific testing
MOBILE_ONLY=true npm run perf-test
```

## 📊 Load Testing

### Concurrent User Simulation (`scripts/load-test.js`)

**Test Scenarios**
- **Menu Browsing** (40%): Category navigation, item viewing
- **Order Placement** (30%): Full checkout flows
- **MNC Special** (20%): Special category filtering  
- **Admin Operations** (10%): Menu management, order updates

**Load Test Configuration**
```bash
# Default: 10 concurrent users, 60 seconds
npm run load-test

# Custom configuration
CONCURRENT_USERS=25 TEST_DURATION=120 npm run load-test

# High load testing
CONCURRENT_USERS=50 TEST_DURATION=300 npm run load-test
```

**Performance Thresholds**
- **Error Rate**: < 1% excellent, < 5% acceptable
- **Average Response**: < 1s excellent, < 3s acceptable  
- **95th Percentile**: < 2s excellent, < 5s acceptable
- **Requests/Second**: Based on server capacity

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow (`.github/workflows/ci.yml`)

**Pipeline Stages**
1. **🧪 Test Suite**
   - Unit tests with coverage
   - Integration test execution
   - Edge case validation
   - Coverage report upload

2. **🏗️ Build Application**
   - Production build creation
   - Artifact generation
   - Build verification

3. **⚡ Performance Tests**
   - Web vitals measurement
   - Load testing execution
   - Performance regression detection

**Trigger Conditions**
- **Push**: `main`, `develop` branches
- **Pull Request**: All branches → `main`, `develop`  
- **Manual**: Workflow dispatch

**Environment Variables**
- `NODE_VERSION`: Node.js version (18)
- `CONCURRENT_USERS`: Load test user count
- `TEST_DURATION`: Load test duration (seconds)

## 🚀 Running Tests

### Local Development

```bash
# Install dependencies
npm install

# Run all tests
npm run test:all

# Individual test suites
npm run test:unit          # Component unit tests
npm run test:integration   # User flow tests  
npm run test:edge         # Edge case tests
npm run test:coverage     # Coverage report

# Performance testing
npm run perf-test         # Web vitals
npm run load-test         # Load testing

# Custom test execution
npm test -- --testNamePattern="CustomerMenu"
npm test -- --testPathPattern="integration"
npm test -- --coverage --watchAll=false
```

### CI Environment

```bash
# Full CI pipeline
npm ci                    # Clean install
npm run test:all         # All test suites
npm run build            # Production build
npm run perf-test        # Performance validation
```

## 📈 Coverage Reports

### Coverage Thresholds

```javascript
coverageThreshold: {
  global: {
    branches: 70,
    functions: 70, 
    lines: 70,
    statements: 70
  }
}
```

### Coverage Exclusions
- Firebase configuration
- Test files and mocks
- Build artifacts
- Third-party libraries

### Viewing Coverage

```bash
# Generate coverage report
npm run test:coverage

# Open coverage report
open coverage/lcov-report/index.html
```

## 🎯 Test Strategy Best Practices

### Writing Effective Tests

1. **Arrange-Act-Assert Pattern**
   ```javascript
   // Arrange
   render(<Component />);
   
   // Act  
   fireEvent.click(button);
   
   // Assert
   expect(screen.getByText('Success')).toBeInTheDocument();
   ```

2. **User-Centric Testing**
   ```javascript
   // Good: Test user behavior
   await user.click(screen.getByRole('button', { name: /add to cart/i }));
   
   // Avoid: Test implementation details
   // fireEvent.click(wrapper.find('.add-button'));
   ```

3. **Async Testing Patterns**
   ```javascript
   await waitFor(() => {
     expect(screen.getByText('Loading...')).not.toBeInTheDocument();
   });
   
   await user.click(submitButton);
   await waitFor(() => {
     expect(screen.getByText('Order Placed')).toBeInTheDocument();
   });
   ```

### Mock Strategy

1. **Firebase Mocking**
   - Mock at the service level, not individual functions
   - Provide realistic data structures
   - Test both success and error scenarios

2. **Component Mocking**
   - Mock heavy third-party components
   - Preserve component interface contracts
   - Mock with realistic behavior

3. **Network Mocking**
   - Mock API responses with realistic delays
   - Test network failure scenarios
   - Validate request parameters

## 🔧 Troubleshooting

### Common Issues

1. **Test Timeouts**
   ```javascript
   // Increase timeout for slow operations
   await waitFor(() => {
     expect(element).toBeInTheDocument();
   }, { timeout: 10000 });
   ```

2. **Async State Updates**
   ```javascript
   // Wrap state updates in act()
   await act(async () => {
     await user.click(button);
   });
   ```

3. **Memory Leaks in Tests**
   ```javascript
   afterEach(() => {
     cleanup();
     jest.clearAllMocks();
   });
   ```

4. **Firebase Mock Issues**
   ```javascript
   // Reset mocks between tests
   beforeEach(() => {
     mockOnSnapshot.mockClear();
     mockAddDoc.mockClear();
   });
   ```

### Debugging Tests

```bash
# Run single test file with debugging
npm test -- --testNamePattern="CustomerMenu" --verbose

# Run with coverage and open report
npm run test:coverage && open coverage/lcov-report/index.html

# Performance test debugging
DEBUG=true node scripts/performance-monitor.js
```

## 📊 Monitoring & Alerts

### Performance Monitoring
- **Web Vitals**: Automated tracking in CI
- **Bundle Size**: Regression detection
- **Memory Usage**: Leak detection alerts
- **Load Testing**: Capacity planning

### Test Metrics
- **Test Coverage**: Maintained above 70%
- **Test Execution Time**: < 15 minutes total
- **Flaky Test Rate**: < 5% failure rate
- **Performance Regression**: > 20% degradation alerts

---

This comprehensive testing strategy ensures the Cafe QR application maintains high quality, performance, and reliability across all user scenarios and edge cases.