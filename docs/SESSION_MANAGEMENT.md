# 🔄 Session Management System

This document outlines the comprehensive session management system implemented for the Cafe QR App to ensure proper session reset when orders are completed.

## 📋 Overview

The session management system ensures that when a customer's order reaches **Completed** status, all locally stored session state (`tableNumber`, `orderMode`) is completely cleared. This guarantees that future orders (even days later) start with a fresh session, prompting users for dining mode and table selection from scratch.

## 🏗️ Architecture

### Core Components

1. **SessionManager Utility** (`src/utils/sessionManager.js`)
   - Centralized session state management
   - Automatic expiration handling (30-minute timeout)
   - Session validation and cleanup
   - Event-driven architecture

2. **OrderTracker Integration** (`src/components/OrderTracker.jsx`)
   - Monitors order status changes via Firebase
   - Triggers session reset when all active orders complete
   - Handles multiple concurrent orders

3. **CustomerMenu Integration** (`src/pages/CustomerMenu.jsx`)
   - Listens for session reset events
   - Resets component state automatically
   - Uses SessionManager for all session operations

4. **HomePage Integration** (`src/pages/HomePage.jsx`)
   - Validates session on app entry
   - Cleans up expired sessions
   - Handles QR code table assignments

## 🔄 Session Reset Triggers

### 1. Order Completion Reset
**When**: All active orders (Pending/Preparing/Ready) become Completed
**What happens**:
- `orderMode` cleared
- `tableNumber` cleared  
- `cart_*` keys cleared
- `lastSessionReset` timestamp updated
- `sessionReset` event dispatched

### 2. Session Timeout Reset  
**When**: 30 minutes after last session activity
**What happens**:
- Same as order completion reset
- Triggered on next app interaction

### 3. Manual Reset
**When**: Invalid session detected or emergency reset needed
**What happens**:
- Complete localStorage cleanup
- Optional phone number preservation
- Emergency reset event dispatched

## 🎯 Key Features

### ✅ Complete Session Reset
```javascript
// When order status changes from active to completed
OrderTracker monitors: Pending → Preparing → Ready → Completed
↓
SessionManager.handleOrderCompletion()
↓  
- Clear orderMode
- Clear tableNumber  
- Clear cart data
- Preserve verifiedPhone
- Dispatch reset event
```

### ✅ Multi-Order Support
```javascript
// Only resets when ALL active orders are completed
const hadActive = prevOrders.some(o => ['Pending', 'Preparing', 'Ready'].includes(o.status));
const nowHasActive = currentOrders.some(o => ['Pending', 'Preparing', 'Ready'].includes(o.status));

if (hadActive && !nowHasActive) {
  SessionManager.handleOrderCompletion(); // Reset session
}
```

### ✅ Automatic Expiration
```javascript
// 30-minute session timeout
const SESSION_TIMEOUT = 30 * 60 * 1000;

SessionManager.isSessionExpired() // Checks timestamp
↓
SessionManager.performReset('timeout') // Auto-cleanup
```

### ✅ Data Preservation
```javascript
// Always preserved
- verifiedPhone (loyalty data)
- User preferences (theme, etc.)

// Always cleared on reset
- orderMode
- tableNumber  
- cart_* keys
- lastSessionReset
```

## 🧪 Testing Coverage

### Unit Tests
- `src/integration/__tests__/SessionReset.test.jsx`
- Order completion scenarios
- Session timeout validation
- Component state reset
- Multi-order handling
- Edge cases and error handling

### Test Scenarios
1. **Single Order Completion**: Order goes Pending → Completed
2. **Multiple Order Handling**: Only reset when ALL orders complete
3. **Session Timeout**: Automatic cleanup after 30 minutes
4. **Component Integration**: State reset across all components
5. **Data Preservation**: Phone numbers and loyalty data maintained
6. **Edge Cases**: Invalid timestamps, localStorage errors

## 🔧 Implementation Details

### SessionManager API

```javascript
// Initialize session management
const sessionState = SessionManager.initialize();

// Check session status
const isExpired = SessionManager.isSessionExpired();
const hasSession = SessionManager.hasActiveSession();

// Set session values
SessionManager.setOrderMode('dine-in');
SessionManager.setTableNumber('5');

// Reset session
SessionManager.performReset('orderCompleted');
SessionManager.handleOrderCompletion(); // Delayed reset
SessionManager.emergencyReset(); // Nuclear option

// Event handling
const unsubscribe = SessionManager.onSessionReset((detail) => {
  console.log('Session reset:', detail.reason);
});

// Debug information
console.log(SessionManager.getDebugInfo());
```

### Event System

```javascript
// Session reset event
window.addEventListener('sessionReset', (event) => {
  const { reason, timestamp } = event.detail;
  // Handle reset: 'orderCompleted', 'timeout', 'manual'
});

// Emergency reset event  
window.addEventListener('emergencyReset', (event) => {
  // Handle complete system reset
});
```

## 🛡️ Error Handling

### localStorage Failures
```javascript
// Graceful degradation
try {
  localStorage.setItem(key, value);
} catch (error) {
  console.warn('Storage unavailable:', error);
  // Continue without persistence
}
```

### Invalid Session Data
```javascript
// Automatic validation and cleanup
const issues = SessionManager.validateSession();
if (issues) {
  SessionManager.performReset('validation_failed');
}
```

### Network Issues
```javascript
// Firebase connection failures don't break session management
// Session reset still works via localStorage and events
```

## 📊 Monitoring & Debugging

### Debug Information
```javascript
SessionManager.getDebugInfo() returns:
{
  state: { orderMode, tableNumber, verifiedPhone, lastReset },
  issues: ['validation errors if any'],
  isExpired: boolean,
  hasActiveSession: boolean,
  lastReset: 'human readable timestamp',
  localStorage: { size, keys }
}
```

### Console Logging
- `🔄 Session reset initiated - reason: orderCompleted`
- `✨ Starting fresh session for your next order`
- `🎉 Order completion detected - preparing session reset`
- `🚨 Emergency session reset completed`

## 🎯 User Experience Flow

### First Visit
1. User scans QR code or opens app
2. Phone verification (new users)
3. Session state: `{ orderMode: null, tableNumber: null }`
4. Prompted for dining preference

### During Order
1. User selects dine-in, picks table 5
2. Session state: `{ orderMode: 'dine-in', tableNumber: '5' }`
3. Order placed with table context

### Order Completion  
1. Order status: Pending → Preparing → Ready → Completed
2. SessionManager detects completion
3. Session reset: `{ orderMode: null, tableNumber: null }`
4. User notification: "Fresh session ready"

### Next Visit (Same Day or Later)
1. User returns to app
2. Phone recognized (loyalty preserved)  
3. Session state: `{ orderMode: null, tableNumber: null }`
4. **Fresh experience**: Prompted for dining mode again
5. **No assumptions**: Must select table number again

## 🔍 Verification Checklist

### ✅ Order Completion Reset
- [ ] Single order: Pending → Completed clears session
- [ ] Multiple orders: Only clears when ALL completed  
- [ ] Phone number preserved for loyalty
- [ ] Cart data completely cleared
- [ ] Component state reset across app

### ✅ Session Timeout
- [ ] 30-minute expiration works correctly
- [ ] Automatic cleanup on next interaction
- [ ] No data leakage between sessions

### ✅ User Experience
- [ ] Fresh prompts after order completion
- [ ] No pre-filled dining mode selection
- [ ] Table selection starts from scratch
- [ ] Loyalty data seamlessly continues

### ✅ Edge Cases
- [ ] localStorage unavailable scenarios
- [ ] Invalid session data handling
- [ ] Network failure resilience
- [ ] Concurrent order management

## 🚀 Benefits

1. **Privacy**: No session data persists between separate visits
2. **Flexibility**: Users can change dining preferences naturally  
3. **Reliability**: Automatic cleanup prevents stale state
4. **User Experience**: Clean slate for each ordering session
5. **Testing**: Comprehensive coverage of all scenarios
6. **Monitoring**: Debug tools for session state tracking

This system ensures that the Cafe QR App provides a fresh, clean experience for every customer interaction while maintaining essential loyalty and user data.