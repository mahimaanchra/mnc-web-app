/**
 * Session Management Utility
 * 
 * Handles session state for order flow including table numbers,
 * order modes, and automatic cleanup when orders are completed.
 */

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const SESSION_KEYS = {
  ORDER_MODE: 'orderMode',
  TABLE_NUMBER: 'tableNumber',
  LAST_RESET: 'lastSessionReset',
  VERIFIED_PHONE: 'verifiedPhone'
};

/**
 * Session Manager Class
 */
class SessionManager {
  /**
   * Check if current session has expired
   */
  static isSessionExpired() {
    try {
      const lastReset = localStorage.getItem(SESSION_KEYS.LAST_RESET);
      if (!lastReset) return false;
      
      const timestamp = parseInt(lastReset);
      if (isNaN(timestamp)) return true; // Invalid timestamp
      
      const timeSinceReset = Date.now() - timestamp;
      return timeSinceReset > SESSION_TIMEOUT;
    } catch (error) {
      console.warn('Error checking session expiry:', error.message);
      return true; // Assume expired on error
    }
  }

  /**
   * Get current session state with automatic expiry checking
   */
  static getSessionState() {
    if (this.isSessionExpired()) {
      this.performReset('timeout');
    }
    
    try {
      return {
        orderMode: localStorage.getItem(SESSION_KEYS.ORDER_MODE),
        tableNumber: localStorage.getItem(SESSION_KEYS.TABLE_NUMBER),
        verifiedPhone: localStorage.getItem(SESSION_KEYS.VERIFIED_PHONE),
        lastReset: localStorage.getItem(SESSION_KEYS.LAST_RESET)
      };
    } catch (error) {
      console.warn('Error getting session state:', error.message);
      return {
        orderMode: null,
        tableNumber: null,
        verifiedPhone: null,
        lastReset: null
      };
    }
  }

  /**
   * Set session values safely
   */
  static setSessionValue(key, value) {
    try {
      if (value === null || value === undefined) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, String(value));
      }
      return true;
    } catch (error) {
      console.warn(`Error setting session value ${key}:`, error.message);
      return false;
    }
  }

  /**
   * Set order mode and persist it
   */
  static setOrderMode(mode) {
    return this.setSessionValue(SESSION_KEYS.ORDER_MODE, mode);
  }

  /**
   * Set table number and persist it
   */
  static setTableNumber(tableNumber) {
    return this.setSessionValue(SESSION_KEYS.TABLE_NUMBER, tableNumber);
  }

  /**
   * Perform complete session reset
   */
  static performReset(reason = 'manual') {
    try {
      console.log(`🔄 Session reset initiated - reason: ${reason}`);
      
      // Clear order-related data
      const orderKeys = [
        SESSION_KEYS.ORDER_MODE,
        SESSION_KEYS.TABLE_NUMBER,
        SESSION_KEYS.LAST_RESET
      ];
      
      orderKeys.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.warn(`Error removing ${key}:`, error.message);
        }
      });

      // Clear cart-related keys
      try {
        const allKeys = Object.keys(localStorage);
        const cartKeys = allKeys.filter(key => key.startsWith('cart_'));
        cartKeys.forEach(key => localStorage.removeItem(key));
      } catch (error) {
        console.warn('Error clearing cart keys:', error.message);
      }

      // Mark reset timestamp
      this.setSessionValue(SESSION_KEYS.LAST_RESET, Date.now());

      // Dispatch reset event
      try {
        const event = new CustomEvent('sessionReset', {
          detail: { 
            reason, 
            timestamp: Date.now(),
            success: true
          }
        });
        window.dispatchEvent(event);
      } catch (error) {
        console.warn('Error dispatching session reset event:', error.message);
      }

      return true;
    } catch (error) {
      console.error('Session reset failed:', error);
      return false;
    }
  }

  /**
   * Check if user has active session data
   */
  static hasActiveSession() {
    const state = this.getSessionState();
    return !!(state.orderMode || state.tableNumber);
  }

  /**
   * Validate session consistency
   * Returns issues found or null if valid
   */
  static validateSession() {
    const state = this.getSessionState();
    const issues = [];

    // Check for orphaned table without mode
    if (state.tableNumber && !state.orderMode) {
      issues.push('Table number exists without order mode');
    }

    // Check for invalid combinations
    if (state.orderMode === 'takeaway' && state.tableNumber && state.tableNumber !== 'Takeaway') {
      issues.push('Takeaway mode with dine-in table number');
    }

    return issues.length > 0 ? issues : null;
  }

  /**
   * Auto-cleanup invalid session data
   */
  static cleanupInvalidSession() {
    const issues = this.validateSession();
    if (issues) {
      console.warn('Invalid session detected:', issues);
      this.performReset('validation_failed');
      return true;
    }
    return false;
  }

  /**
   * Subscribe to session reset events
   */
  static onSessionReset(callback) {
    const handler = (event) => callback(event.detail);
    window.addEventListener('sessionReset', handler);
    
    // Return unsubscribe function
    return () => window.removeEventListener('sessionReset', handler);
  }

  /**
   * Initialize session management for a component
   * Returns session state and cleanup function
   */
  static initialize() {
    // Clean up any invalid session data
    this.cleanupInvalidSession();
    
    // Return current state
    return this.getSessionState();
  }

  /**
   * Handle order completion - to be called when orders move to completed status
   */
  static handleOrderCompletion() {
    console.log('🎉 Order completion detected - preparing session reset');
    
    // Small delay to allow UI updates to complete
    setTimeout(() => {
      this.performReset('orderCompleted');
    }, 1000);
  }

  /**
   * Emergency reset - clears everything including phone
   */
  static emergencyReset() {
    try {
      // Clear absolutely everything
      Object.values(SESSION_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
      
      // Clear all cart keys
      const allKeys = Object.keys(localStorage);
      const cartKeys = allKeys.filter(key => key.startsWith('cart_'));
      cartKeys.forEach(key => localStorage.removeItem(key));
      
      console.log('🚨 Emergency session reset completed');
      
      // Dispatch emergency reset event
      window.dispatchEvent(new CustomEvent('emergencyReset', {
        detail: { timestamp: Date.now() }
      }));
      
      return true;
    } catch (error) {
      console.error('Emergency reset failed:', error);
      return false;
    }
  }

  /**
   * Get session debug info
   */
  static getDebugInfo() {
    const state = this.getSessionState();
    const issues = this.validateSession();
    
    return {
      state,
      issues,
      isExpired: this.isSessionExpired(),
      hasActiveSession: this.hasActiveSession(),
      lastReset: state.lastReset ? new Date(parseInt(state.lastReset)).toLocaleString() : 'Never',
      localStorage: {
        size: Object.keys(localStorage).length,
        keys: Object.keys(localStorage)
      }
    };
  }
}

// Export both the class and individual functions for convenience
export default SessionManager;

export const {
  isSessionExpired,
  getSessionState,
  setSessionValue,
  setOrderMode,
  setTableNumber,
  performReset,
  hasActiveSession,
  validateSession,
  cleanupInvalidSession,
  onSessionReset,
  initialize,
  handleOrderCompletion,
  emergencyReset,
  getDebugInfo
} = SessionManager;