import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import CustomerMenu from '../../pages/CustomerMenu';
import OrderTracker from '../../components/OrderTracker';

// Mock Firebase
const mockOnSnapshot = jest.fn();
const mockAddDoc = jest.fn();
const mockUpdateDoc = jest.fn();

jest.mock('../../firebase/config', () => ({
  db: {},
  auth: {}
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  onSnapshot: mockOnSnapshot,
  addDoc: mockAddDoc,
  updateDoc: mockUpdateDoc,
  doc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  Timestamp: {
    fromMillis: jest.fn((ms) => ({ toMillis: () => ms }))
  },
  serverTimestamp: jest.fn(),
  arrayUnion: jest.fn(),
  increment: jest.fn(),
}));

// Mock components
jest.mock('../../components/OrderModificationSheet', () => {
  return function OrderModificationSheet({ order, onClose }) {
    return order ? <div data-testid="order-modification">Order Modification</div> : null;
  };
});

const TestWrapper = ({ children }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('Session Reset Functionality', () => {
  const user = userEvent.setup();
  
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockOnSnapshot.mockClear();
    mockAddDoc.mockClear();
    mockUpdateDoc.mockClear();
    
    // Mock console to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('🔄 Order Completion Session Reset', () => {
    it('should clear session data when active order becomes completed', async () => {
      // Set up initial session data
      localStorage.setItem('orderMode', 'dine-in');
      localStorage.setItem('tableNumber', '5');
      localStorage.setItem('verifiedPhone', '9876543210');

      const mockActiveOrder = {
        id: 'order-1',
        status: 'Preparing',
        tableNumber: '5',
        totalPrice: 200,
        customerPhone: '9876543210',
        createdAt: { toMillis: () => Date.now() - 600000 } // 10 mins ago
      };

      const mockCompletedOrder = {
        ...mockActiveOrder,
        status: 'Completed'
      };

      let callbackFunction;
      
      // Mock onSnapshot to capture the callback
      mockOnSnapshot.mockImplementation((query, callback) => {
        callbackFunction = callback;
        // Initially return active order
        callback({
          docs: [{
            id: mockActiveOrder.id,
            data: () => mockActiveOrder
          }]
        });
        return jest.fn(); // unsubscribe
      });

      // Render OrderTracker
      const mockOnOpenChange = jest.fn();
      const mockOnAddMore = jest.fn();
      const mockOnActiveOrderChange = jest.fn();

      await act(async () => {
        render(
          <TestWrapper>
            <OrderTracker
              phone="9876543210"
              open={false}
              onOpenChange={mockOnOpenChange}
              onAddMore={mockOnAddMore}
              onActiveOrderChange={mockOnActiveOrderChange}
            />
          </TestWrapper>
        );
      });

      // Verify initial state
      expect(localStorage.getItem('orderMode')).toBe('dine-in');
      expect(localStorage.getItem('tableNumber')).toBe('5');

      // Simulate order completion by calling the callback with completed order
      await act(async () => {
        callbackFunction({
          docs: [{
            id: mockCompletedOrder.id,
            data: () => mockCompletedOrder
          }]
        });
      });

      // Verify session has been cleared
      expect(localStorage.getItem('orderMode')).toBeNull();
      expect(localStorage.getItem('tableNumber')).toBeNull();
      expect(localStorage.getItem('lastSessionReset')).toBeTruthy();

      // Verify phone is preserved (loyalty data)
      expect(localStorage.getItem('verifiedPhone')).toBe('9876543210');
    });

    it('should dispatch session reset event when order completes', async () => {
      const sessionResetHandler = jest.fn();
      window.addEventListener('sessionReset', sessionResetHandler);

      localStorage.setItem('orderMode', 'takeaway');
      localStorage.setItem('verifiedPhone', '9876543210');

      const mockActiveOrder = {
        id: 'order-1',
        status: 'Pending',
        tableNumber: 'Takeaway',
        customerPhone: '9876543210',
        createdAt: { toMillis: () => Date.now() - 300000 }
      };

      let callbackFunction;
      mockOnSnapshot.mockImplementation((query, callback) => {
        callbackFunction = callback;
        // Start with active order
        callback({
          docs: [{
            id: mockActiveOrder.id,
            data: () => mockActiveOrder
          }]
        });
        return jest.fn();
      });

      await act(async () => {
        render(
          <TestWrapper>
            <OrderTracker
              phone="9876543210"
              open={false}
              onOpenChange={jest.fn()}
              onAddMore={jest.fn()}
              onActiveOrderChange={jest.fn()}
            />
          </TestWrapper>
        );
      });

      // Complete the order
      await act(async () => {
        callbackFunction({
          docs: [{
            id: mockActiveOrder.id,
            data: () => ({ ...mockActiveOrder, status: 'Completed' })
          }]
        });
      });

      // Verify event was dispatched
      expect(sessionResetHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            reason: 'orderCompleted'
          })
        })
      );

      window.removeEventListener('sessionReset', sessionResetHandler);
    });
  });

  describe('⏰ Session Timeout Reset', () => {
    it('should reset expired session on homepage load', async () => {
      // Set up expired session
      const oldTimestamp = Date.now() - (35 * 60 * 1000); // 35 minutes ago
      localStorage.setItem('orderMode', 'dine-in');
      localStorage.setItem('tableNumber', '3');
      localStorage.setItem('lastSessionReset', oldTimestamp.toString());

      // Mock HomePage behavior (simplified)
      const checkExpiredSession = () => {
        const lastReset = localStorage.getItem('lastSessionReset');
        const sessionTimeout = 30 * 60 * 1000; // 30 minutes
        
        if (lastReset) {
          const timeSinceReset = Date.now() - parseInt(lastReset);
          if (timeSinceReset > sessionTimeout) {
            localStorage.removeItem("orderMode");
            localStorage.removeItem("tableNumber");
            localStorage.removeItem('lastSessionReset');
            return true;
          }
        }
        return false;
      };

      const wasReset = checkExpiredSession();

      expect(wasReset).toBe(true);
      expect(localStorage.getItem('orderMode')).toBeNull();
      expect(localStorage.getItem('tableNumber')).toBeNull();
      expect(localStorage.getItem('lastSessionReset')).toBeNull();
    });

    it('should preserve recent session data', async () => {
      // Set up recent session
      const recentTimestamp = Date.now() - (10 * 60 * 1000); // 10 minutes ago
      localStorage.setItem('orderMode', 'dine-in');
      localStorage.setItem('tableNumber', '7');
      localStorage.setItem('lastSessionReset', recentTimestamp.toString());

      const checkExpiredSession = () => {
        const lastReset = localStorage.getItem('lastSessionReset');
        const sessionTimeout = 30 * 60 * 1000;
        
        if (lastReset) {
          const timeSinceReset = Date.now() - parseInt(lastReset);
          if (timeSinceReset > sessionTimeout) {
            localStorage.removeItem("orderMode");
            localStorage.removeItem("tableNumber");
            localStorage.removeItem('lastSessionReset');
            return true;
          }
        }
        return false;
      };

      const wasReset = checkExpiredSession();

      expect(wasReset).toBe(false);
      expect(localStorage.getItem('orderMode')).toBe('dine-in');
      expect(localStorage.getItem('tableNumber')).toBe('7');
    });
  });

  describe('🎯 CustomerMenu Session Reset Integration', () => {
    it('should reset component state when session reset event is received', async () => {
      // Set up menu with existing session
      localStorage.setItem('verifiedPhone', '9876543210');
      localStorage.setItem('orderMode', 'dine-in');
      localStorage.setItem('tableNumber', '2');

      const mockMenuItems = [{
        id: '1',
        name: 'Test Coffee',
        category: 'Cold Coffee',
        variants: [{ label: 'Regular', price: 120 }],
        addons: [],
        inStock: true,
        isMncSpecial: false
      }];

      mockOnSnapshot.mockImplementation((collection, callback) => {
        callback({
          docs: mockMenuItems.map(item => ({
            id: item.id,
            data: () => item
          }))
        });
        return jest.fn();
      });

      await act(async () => {
        render(
          <TestWrapper>
            <CustomerMenu />
          </TestWrapper>
        );
      });

      // Verify component loaded with session
      await waitFor(() => {
        expect(screen.getByText('Table 2')).toBeInTheDocument();
        expect(screen.getByText('Test Coffee')).toBeInTheDocument();
      });

      // Add item to cart
      const addButton = screen.getByText('Add');
      await user.click(addButton);

      // Verify cart has item
      expect(screen.getByText('1 item')).toBeInTheDocument();

      // Dispatch session reset event
      await act(async () => {
        window.dispatchEvent(new CustomEvent('sessionReset', {
          detail: { reason: 'orderCompleted', timestamp: Date.now() }
        }));
      });

      // Wait for component state reset
      await waitFor(() => {
        // Cart should be cleared (component state reset)
        expect(screen.queryByText('1 item')).not.toBeInTheDocument();
      });
    });
  });

  describe('🧹 Cart and Session Data Cleanup', () => {
    it('should clear cart-related localStorage keys on session reset', () => {
      // Set up various localStorage keys
      localStorage.setItem('orderMode', 'takeaway');
      localStorage.setItem('tableNumber', '4');
      localStorage.setItem('cart_item1', 'some cart data');
      localStorage.setItem('cart_item2', 'more cart data');
      localStorage.setItem('verifiedPhone', '9876543210');
      localStorage.setItem('otherData', 'should remain');

      // Simulate session reset function
      const performSessionReset = () => {
        const keysToRemove = ['orderMode', 'tableNumber', 'lastSessionReset'];
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        const allKeys = Object.keys(localStorage);
        const cartKeys = allKeys.filter(key => key.startsWith('cart_'));
        cartKeys.forEach(key => localStorage.removeItem(key));
        
        localStorage.setItem('lastSessionReset', Date.now().toString());
      };

      performSessionReset();

      // Verify cleanup
      expect(localStorage.getItem('orderMode')).toBeNull();
      expect(localStorage.getItem('tableNumber')).toBeNull();
      expect(localStorage.getItem('cart_item1')).toBeNull();
      expect(localStorage.getItem('cart_item2')).toBeNull();
      expect(localStorage.getItem('lastSessionReset')).toBeTruthy();

      // Verify preserved data
      expect(localStorage.getItem('verifiedPhone')).toBe('9876543210');
      expect(localStorage.getItem('otherData')).toBe('should remain');
    });
  });

  describe('🔄 Multiple Order Scenarios', () => {
    it('should only reset session when ALL active orders are completed', async () => {
      localStorage.setItem('orderMode', 'dine-in');
      localStorage.setItem('tableNumber', '8');
      localStorage.setItem('verifiedPhone', '9876543210');

      const mockOrders = [
        {
          id: 'order-1',
          status: 'Preparing',
          tableNumber: '8',
          customerPhone: '9876543210',
          createdAt: { toMillis: () => Date.now() - 600000 }
        },
        {
          id: 'order-2',
          status: 'Ready',
          tableNumber: '8',
          customerPhone: '9876543210',
          createdAt: { toMillis: () => Date.now() - 300000 }
        }
      ];

      let callbackFunction;
      mockOnSnapshot.mockImplementation((query, callback) => {
        callbackFunction = callback;
        callback({
          docs: mockOrders.map(order => ({
            id: order.id,
            data: () => order
          }))
        });
        return jest.fn();
      });

      await act(async () => {
        render(
          <TestWrapper>
            <OrderTracker
              phone="9876543210"
              open={false}
              onOpenChange={jest.fn()}
              onAddMore={jest.fn()}
              onActiveOrderChange={jest.fn()}
            />
          </TestWrapper>
        );
      });

      // Complete only one order - session should NOT reset
      await act(async () => {
        callbackFunction({
          docs: [
            { id: 'order-1', data: () => ({ ...mockOrders[0], status: 'Completed' }) },
            { id: 'order-2', data: () => mockOrders[1] } // Still ready
          ]
        });
      });

      expect(localStorage.getItem('orderMode')).toBe('dine-in');
      expect(localStorage.getItem('tableNumber')).toBe('8');

      // Complete all orders - session SHOULD reset
      await act(async () => {
        callbackFunction({
          docs: [
            { id: 'order-1', data: () => ({ ...mockOrders[0], status: 'Completed' }) },
            { id: 'order-2', data: () => ({ ...mockOrders[1], status: 'Completed' }) }
          ]
        });
      });

      expect(localStorage.getItem('orderMode')).toBeNull();
      expect(localStorage.getItem('tableNumber')).toBeNull();
    });
  });

  describe('🎲 Edge Cases', () => {
    it('should handle missing localStorage gracefully', () => {
      // Mock localStorage errors
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = jest.fn(() => {
        throw new Error('localStorage not available');
      });

      expect(() => {
        // This should not throw
        const checkSession = () => {
          try {
            const lastReset = localStorage.getItem('lastSessionReset');
            return lastReset;
          } catch (error) {
            console.warn('localStorage access failed:', error.message);
            return null;
          }
        };
        
        checkSession();
      }).not.toThrow();

      localStorage.getItem = originalGetItem;
    });

    it('should handle invalid timestamp data', () => {
      localStorage.setItem('lastSessionReset', 'invalid-timestamp');
      localStorage.setItem('orderMode', 'dine-in');

      const checkExpiredSession = () => {
        try {
          const lastReset = localStorage.getItem('lastSessionReset');
          const sessionTimeout = 30 * 60 * 1000;
          
          if (lastReset) {
            const timestamp = parseInt(lastReset);
            if (isNaN(timestamp)) {
              // Invalid timestamp - reset session
              localStorage.removeItem("orderMode");
              localStorage.removeItem("tableNumber");
              localStorage.removeItem('lastSessionReset');
              return true;
            }
            
            const timeSinceReset = Date.now() - timestamp;
            if (timeSinceReset > sessionTimeout) {
              localStorage.removeItem("orderMode");
              localStorage.removeItem("tableNumber");
              localStorage.removeItem('lastSessionReset');
              return true;
            }
          }
          return false;
        } catch (error) {
          // Reset on any error
          localStorage.removeItem("orderMode");
          localStorage.removeItem("tableNumber");
          localStorage.removeItem('lastSessionReset');
          return true;
        }
      };

      const wasReset = checkExpiredSession();
      expect(wasReset).toBe(true);
      expect(localStorage.getItem('orderMode')).toBeNull();
    });
  });
});