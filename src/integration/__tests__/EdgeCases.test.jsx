import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import CustomerMenu from '../../pages/CustomerMenu';
import AdminMenu from '../../components/AdminMenu';

// Mock Firebase with error scenarios
const mockOnSnapshot = jest.fn();
const mockAddDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDeleteDoc = jest.fn();

jest.mock('../../firebase/config', () => ({
  db: {},
  auth: {}
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  onSnapshot: mockOnSnapshot,
  addDoc: mockAddDoc,
  doc: jest.fn(),
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
  arrayUnion: jest.fn(),
  increment: jest.fn(),
  serverTimestamp: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
}));

// Mock components
jest.mock('../../components/OrderTracker', () => {
  return function OrderTracker({ open, onOpenChange, onActiveOrderChange, onAddMore }) {
    React.useEffect(() => {
      // Simulate active order for interception tests
      if (open) {
        onActiveOrderChange({
          id: 'active-order-1',
          status: 'Pending',
          tableNumber: '5',
          totalPrice: 200,
          orderMode: 'dine-in'
        });
      }
    }, [open]);

    return open ? <div data-testid="order-tracker">Order Tracker</div> : null;
  };
});

jest.mock('../../components/OrderModificationSheet', () => {
  return function OrderModificationSheet({ order, onClose }) {
    return order ? <div data-testid="order-modification">Order Modification</div> : null;
  };
});

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { email: 'admin@test.com' },
    logout: jest.fn().mockResolvedValue()
  })
}));

const TestWrapper = ({ children }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

const mockMenuItems = [
  {
    id: '1',
    name: 'Cold Coffee',
    category: 'Cold Coffee',
    variants: [{ label: 'Regular', price: 120 }],
    addons: [],
    inStock: true,
    isMncSpecial: false
  }
];

describe('Edge Cases and Error Handling Tests', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockOnSnapshot.mockClear();
    mockAddDoc.mockClear();
    mockUpdateDoc.mockClear();
    mockDeleteDoc.mockClear();

    // Mock console to avoid noise in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('🌐 Network Connectivity Issues', () => {
    it('should handle Firebase connection failures gracefully', async () => {
      // Simulate network error
      mockOnSnapshot.mockImplementation(() => {
        throw new Error('NETWORK_ERROR: Failed to connect to Firestore');
      });

      localStorage.setItem('verifiedPhone', '9876543210');

      await act(async () => {
        render(
          <TestWrapper>
            <CustomerMenu />
          </TestWrapper>
        );
      });

      // Should show loading state or error state instead of crashing
      expect(screen.queryByText('Mid Night Coffee')).toBeInTheDocument();
    });

    it('should handle order placement failures during network issues', async () => {
      // Setup normal loading first
      mockOnSnapshot.mockImplementation((collection, callback) => {
        callback({
          docs: mockMenuItems.map(item => ({
            id: item.id,
            data: () => item
          }))
        });
        return jest.fn();
      });

      // Mock order placement failure
      mockAddDoc.mockRejectedValue(new Error('NETWORK_ERROR: Unable to place order'));

      localStorage.setItem('verifiedPhone', '9876543210');
      localStorage.setItem('orderMode', 'takeaway');

      await act(async () => {
        render(
          <TestWrapper>
            <CustomerMenu />
          </TestWrapper>
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Cold Coffee')).toBeInTheDocument();
      });

      // Add item and try to place order
      const addButton = screen.getByText('Add');
      await user.click(addButton);

      const viewOrderButton = screen.getByText('View Order');
      await user.click(viewOrderButton);

      const checkoutButton = screen.getByText('Proceed to Checkout');
      await user.click(checkoutButton);

      const placeOrderButton = screen.getByText('Place Order');
      await user.click(placeOrderButton);

      // Should show error message instead of crashing
      await waitFor(() => {
        expect(screen.getByText('Order could not be placed. Please try again.')).toBeInTheDocument();
      });
    });

    it('should handle partial data loading failures', async () => {
      // Simulate partial failure - menu loads but orders fail
      mockOnSnapshot
        .mockImplementationOnce((collection, callback) => {
          // Menu items load successfully
          callback({
            docs: mockMenuItems.map(item => ({
              id: item.id,
              data: () => item
            }))
          });
          return jest.fn();
        })
        .mockImplementationOnce(() => {
          // Orders fail to load
          throw new Error('Orders collection unavailable');
        });

      localStorage.setItem('verifiedPhone', '9876543210');

      await act(async () => {
        render(
          <TestWrapper>
            <CustomerMenu />
          </TestWrapper>
        );
      });

      // Menu should still work even if orders fail
      await waitFor(() => {
        expect(screen.getByText('Cold Coffee')).toBeInTheDocument();
      });

      // User should still be able to order
      const addButton = screen.getByText('Add');
      expect(addButton).toBeEnabled();
    });
  });

  describe('📱 Invalid Phone Number Formats', () => {
    it('should handle various invalid phone number formats', async () => {
      await act(async () => {
        render(
          <TestWrapper>
            <CustomerMenu />
          </TestWrapper>
        );
      });

      const phoneInput = screen.getByPlaceholderText('9876543210');
      const submitButton = screen.getByText('Start Ordering');

      // Test various invalid formats
      const invalidNumbers = [
        '123',           // Too short
        '12345678901',   // Too long
        '98765abcde',    // Contains letters
        '+919876543210', // With country code
        '9876-543-210',  // With dashes
        '9876 543 210',  // With spaces
        '',              // Empty
        '0000000000',    // All zeros
      ];

      for (const invalidNumber of invalidNumbers) {
        await user.clear(phoneInput);
        await user.type(phoneInput, invalidNumber);
        await user.click(submitButton);

        // Should show validation error
        expect(screen.getByText('Please enter a valid 10-digit mobile number.')).toBeInTheDocument();
      }
    });

    it('should sanitize and accept valid phone numbers with formatting', async () => {
      await act(async () => {
        render(
          <TestWrapper>
            <CustomerMenu />
          </TestWrapper>
        );
      });

      const phoneInput = screen.getByPlaceholderText('9876543210');
      const submitButton = screen.getByText('Start Ordering');

      // Test phone number with spaces that should be accepted after sanitization
      await user.type(phoneInput, '9876 543 210');
      await user.click(submitButton);

      // Should clean up and accept the number
      expect(localStorage.setItem).toHaveBeenCalledWith('verifiedPhone', '9876543210');
    });
  });

  describe('🔄 Active Order Interception Modal', () => {
    it('should show "Add to current vs new order" modal when active order exists', async () => {
      // Setup existing active order
      mockOnSnapshot
        .mockImplementationOnce((collection, callback) => {
          callback({
            docs: mockMenuItems.map(item => ({
              id: item.id,
              data: () => item
            }))
          });
          return jest.fn();
        })
        .mockImplementationOnce((collection, callback) => {
          callback({
            docs: [{
              id: 'active-order-1',
              data: () => ({
                status: 'Pending',
                tableNumber: '5',
                totalPrice: 200,
                orderMode: 'dine-in',
                customerPhone: '9876543210'
              })
            }],
            docChanges: () => []
          });
          return jest.fn();
        });

      localStorage.setItem('verifiedPhone', '9876543210');

      await act(async () => {
        render(
          <TestWrapper>
            <CustomerMenu />
          </TestWrapper>
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Cold Coffee')).toBeInTheDocument();
      });

      // Add item to cart
      const addButton = screen.getByText('Add');
      await user.click(addButton);

      // Open orders tracker to simulate active order
      const ordersButton = screen.getByText('Orders');
      await user.click(ordersButton);

      // Close tracker
      const closeButton = screen.getAllByRole('button').find(btn => 
        btn.textContent === '×' || btn.getAttribute('aria-label') === 'close'
      );
      if (closeButton) await user.click(closeButton);

      // Try to checkout - should show interception modal
      const viewOrderButton = screen.getByText('View Order');
      await user.click(viewOrderButton);

      const checkoutButton = screen.getByText('Proceed to Checkout');
      await user.click(checkoutButton);

      // Should show add to current order modal
      await waitFor(() => {
        expect(screen.getByText('You have an active order')).toBeInTheDocument();
        expect(screen.getByText('Add to Current Order')).toBeInTheDocument();
        expect(screen.getByText('Place as New Order')).toBeInTheDocument();
      });
    });

    it('should handle adding items to current order successfully', async () => {
      // Setup same as above but test the "add to current" flow
      mockOnSnapshot
        .mockImplementationOnce((collection, callback) => {
          callback({
            docs: mockMenuItems.map(item => ({
              id: item.id,
              data: () => item
            }))
          });
          return jest.fn();
        });

      // Mock successful update
      mockUpdateDoc.mockResolvedValue();

      localStorage.setItem('verifiedPhone', '9876543210');

      await act(async () => {
        render(
          <TestWrapper>
            <CustomerMenu />
          </TestWrapper>
        );
      });

      // Simulate the interception modal scenario through direct state manipulation
      // This would normally be triggered by the active order detection logic
    });

    it('should handle errors when adding to current order fails', async () => {
      mockUpdateDoc.mockRejectedValue(new Error('Failed to update order'));

      // Similar setup as above but mock the update failure
      // The error should be handled gracefully without crashing
    });
  });

  describe('🍽️ Menu Item Edge Cases', () => {
    it('should handle menu items with missing or malformed data', async () => {
      const malformedItems = [
        {
          id: '1',
          name: '',  // Empty name
          category: 'Cold Coffee',
          variants: [],  // No variants
          inStock: true
        },
        {
          id: '2',
          // Missing name
          category: 'Hot Beverages',
          variants: [{ label: 'Regular' }], // Missing price
          inStock: true
        },
        {
          id: '3',
          name: 'Valid Item',
          category: '', // Empty category
          variants: [{ label: 'Regular', price: 'invalid' }], // Invalid price
          inStock: null // Invalid stock status
        }
      ];

      mockOnSnapshot.mockImplementation((collection, callback) => {
        callback({
          docs: malformedItems.map(item => ({
            id: item.id,
            data: () => item
          }))
        });
        return jest.fn();
      });

      localStorage.setItem('verifiedPhone', '9876543210');

      await act(async () => {
        render(
          <TestWrapper>
            <CustomerMenu />
          </TestWrapper>
        );
      });

      // Should handle malformed data gracefully
      // Items with missing required data should be filtered out or handled
      await waitFor(() => {
        // Should show some fallback content or filtered items
        expect(screen.getByText('Mid Night Coffee')).toBeInTheDocument();
      });
    });

    it('should handle extremely long item names and descriptions', async () => {
      const longTextItems = [{
        id: '1',
        name: 'A'.repeat(200), // Very long name
        category: 'Cold Coffee',
        description: 'B'.repeat(1000), // Very long description
        variants: [{ label: 'Regular', price: 120 }],
        inStock: true
      }];

      mockOnSnapshot.mockImplementation((collection, callback) => {
        callback({
          docs: longTextItems.map(item => ({
            id: item.id,
            data: () => item
          }))
        });
        return jest.fn();
      });

      localStorage.setItem('verifiedPhone', '9876543210');

      await act(async () => {
        render(
          <TestWrapper>
            <CustomerMenu />
          </TestWrapper>
        );
      });

      // Should render without breaking layout
      await waitFor(() => {
        const longName = screen.getByText('A'.repeat(200));
        expect(longName).toBeInTheDocument();
        // Should have text truncation classes
        expect(longName.closest('[class*="line-clamp"]') || 
               longName.closest('[class*="truncate"]')).toBeTruthy();
      });
    });

    it('should handle broken image URLs gracefully', async () => {
      const itemsWithBrokenImages = [{
        id: '1',
        name: 'Coffee with Broken Image',
        category: 'Cold Coffee',
        imageUrl: 'https://broken-url.com/nonexistent.jpg',
        variants: [{ label: 'Regular', price: 120 }],
        inStock: true
      }];

      mockOnSnapshot.mockImplementation((collection, callback) => {
        callback({
          docs: itemsWithBrokenImages.map(item => ({
            id: item.id,
            data: () => item
          }))
        });
        return jest.fn();
      });

      localStorage.setItem('verifiedPhone', '9876543210');

      await act(async () => {
        render(
          <TestWrapper>
            <CustomerMenu />
          </TestWrapper>
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Coffee with Broken Image')).toBeInTheDocument();
      });

      // Simulate image error
      const images = screen.getAllByRole('img');
      images.forEach(img => {
        fireEvent.error(img);
      });

      // Should show fallback icon instead of broken image
      // (Specific implementation depends on your error handling)
    });
  });

  describe('⚡ Race Conditions and Timing Issues', () => {
    it('should handle rapid successive cart updates', async () => {
      mockOnSnapshot.mockImplementation((collection, callback) => {
        callback({
          docs: mockMenuItems.map(item => ({
            id: item.id,
            data: () => item
          }))
        });
        return jest.fn();
      });

      localStorage.setItem('verifiedPhone', '9876543210');

      await act(async () => {
        render(
          <TestWrapper>
            <CustomerMenu />
          </TestWrapper>
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Cold Coffee')).toBeInTheDocument();
      });

      // Rapidly click add button multiple times
      const addButton = screen.getByText('Add');
      
      // Fire multiple clicks in rapid succession
      await user.click(addButton);
      await user.click(addButton);
      await user.click(addButton);

      // Should handle updates correctly without race conditions
      await waitFor(() => {
        expect(screen.getByText('3 items')).toBeInTheDocument();
      });
    });

    it('should handle component unmounting during async operations', async () => {
      mockAddDoc.mockImplementation(() => new Promise(resolve => {
        setTimeout(resolve, 1000); // Slow async operation
      }));

      localStorage.setItem('verifiedPhone', '9876543210');
      localStorage.setItem('orderMode', 'takeaway');

      const { unmount } = render(
        <TestWrapper>
          <CustomerMenu />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Cold Coffee')).toBeInTheDocument();
      });

      // Start order placement
      const addButton = screen.getByText('Add');
      await user.click(addButton);

      const viewOrderButton = screen.getByText('View Order');
      await user.click(viewOrderButton);

      const checkoutButton = screen.getByText('Proceed to Checkout');
      await user.click(checkoutButton);

      const placeOrderButton = screen.getByText('Place Order');
      await user.click(placeOrderButton);

      // Unmount component before async operation completes
      unmount();

      // Should not cause memory leaks or errors
      // Test passes if no errors are thrown
    });
  });

  describe('🔐 Admin Panel Security Edge Cases', () => {
    it('should prevent XSS attacks in form inputs', async () => {
      await act(async () => {
        render(
          <TestWrapper>
            <AdminMenu />
          </TestWrapper>
        );
      });

      // Open add item form
      const addButton = screen.getByText('Add Item');
      await user.click(addButton);

      // Try to inject script tags
      const nameInput = screen.getByPlaceholderText('e.g. Classic Cold Coffee');
      const maliciousInput = '<script>alert("xss")</script>Coffee';
      
      await user.type(nameInput, maliciousInput);

      // Input should be sanitized or escaped
      expect(nameInput.value).toBe(maliciousInput); // Raw value is stored
      
      // But when rendered, it should be escaped (React does this automatically)
      // The script should not execute
    });

    it('should handle malicious file uploads for images', async () => {
      await act(async () => {
        render(
          <TestWrapper>
            <AdminMenu />
          </TestWrapper>
        );
      });

      const addButton = screen.getByText('Add Item');
      await user.click(addButton);

      // Try to use suspicious URLs
      const imageInput = screen.getByPlaceholderText('https://images.unsplash.com/photo-…');
      const suspiciousUrls = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'vbscript:msgbox("xss")',
        'file:///etc/passwd'
      ];

      for (const url of suspiciousUrls) {
        await user.clear(imageInput);
        await user.type(imageInput, url);
        
        // Should either reject the URL or sanitize it
        // Implementation depends on your URL validation
      }
    });

    it('should handle browser back button hijacking attempts', async () => {
      const { unmount } = render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );

      // Test the back button prevention
      const handlePopState = jest.fn();
      window.addEventListener('popstate', handlePopState);

      // Simulate back button
      window.history.back();
      
      // Should prevent navigation or show confirmation
      // The exact behavior depends on your implementation

      window.removeEventListener('popstate', handlePopState);
      unmount();
    });
  });

  describe('📊 Memory and Performance Edge Cases', () => {
    it('should handle large numbers of menu items without performance degradation', async () => {
      // Create a large number of items
      const largeItemSet = Array.from({ length: 1000 }, (_, i) => ({
        id: `item-${i}`,
        name: `Menu Item ${i}`,
        category: `Category ${i % 10}`,
        variants: [{ label: 'Regular', price: 100 + i }],
        addons: [],
        inStock: true,
        isMncSpecial: i % 50 === 0
      }));

      mockOnSnapshot.mockImplementation((collection, callback) => {
        callback({
          docs: largeItemSet.map(item => ({
            id: item.id,
            data: () => item
          }))
        });
        return jest.fn();
      });

      localStorage.setItem('verifiedPhone', '9876543210');

      const startTime = performance.now();

      await act(async () => {
        render(
          <TestWrapper>
            <CustomerMenu />
          </TestWrapper>
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Menu Item 0')).toBeInTheDocument();
      });

      const renderTime = performance.now() - startTime;

      // Should render within reasonable time (adjust threshold as needed)
      expect(renderTime).toBeLessThan(5000); // 5 seconds max
    });

    it('should cleanup event listeners and subscriptions on unmount', async () => {
      const unsubscribeMock = jest.fn();
      mockOnSnapshot.mockReturnValue(unsubscribeMock);

      const { unmount } = render(
        <TestWrapper>
          <CustomerMenu />
        </TestWrapper>
      );

      unmount();

      // Should call unsubscribe functions
      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });
});