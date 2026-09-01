import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import App from '../../App';

// Mock Firebase with more detailed implementations
const mockOnSnapshot = jest.fn();
const mockAddDoc = jest.fn();
const mockCollection = jest.fn();
const mockUpdateDoc = jest.fn();

jest.mock('../../firebase/config', () => ({
  db: {},
  auth: {}
}));

jest.mock('firebase/firestore', () => ({
  collection: mockCollection,
  onSnapshot: mockOnSnapshot,
  addDoc: mockAddDoc,
  doc: jest.fn(),
  updateDoc: mockUpdateDoc,
  arrayUnion: jest.fn(),
  increment: jest.fn(),
  serverTimestamp: jest.fn(() => ({ timestamp: Date.now() })),
}));

// Mock react-router-dom with actual implementation
jest.mock('react-router-dom', () => {
  const actualRouter = jest.requireActual('react-router-dom');
  return {
    ...actualRouter,
    BrowserRouter: ({ children }) => <div data-testid="router">{children}</div>,
  };
});

// Mock authentication context
jest.mock('../../context/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({
    currentUser: null,
    login: jest.fn(),
    logout: jest.fn()
  })
}));

const mockMenuItems = [
  {
    id: '1',
    name: 'Classic Cold Coffee',
    category: 'Cold Coffee',
    description: 'Rich and creamy cold brew',
    imageUrl: 'https://example.com/cold-coffee.jpg',
    variants: [
      { label: 'Regular', price: 120 },
      { label: 'Large', price: 150 }
    ],
    addons: [
      { label: 'Extra Shot', price: 20 },
      { label: 'Whipped Cream', price: 15 }
    ],
    inStock: true,
    isMncSpecial: false
  },
  {
    id: '2',
    name: 'MNC Special Burger',
    category: 'Burger',
    description: 'House special with secret sauce',
    variants: [{ label: 'Regular', price: 250 }],
    addons: [{ label: 'Extra Cheese', price: 30 }],
    inStock: true,
    isMncSpecial: true
  },
  {
    id: '3',
    name: 'Margherita Pizza',
    category: 'Pizza',
    description: 'Classic tomato and mozzarella',
    variants: [
      { label: 'Personal', price: 180 },
      { label: 'Regular', price: 280 }
    ],
    addons: [],
    inStock: false,
    isMncSpecial: false
  }
];

describe('Complete User Journey Integration Tests', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockOnSnapshot.mockClear();
    mockAddDoc.mockClear();
    mockUpdateDoc.mockClear();

    // Setup Firebase mocks for menu items
    mockOnSnapshot.mockImplementation((collection, callback) => {
      if (collection === 'menu_items') {
        callback({
          docs: mockMenuItems.map(item => ({
            id: item.id,
            data: () => item
          }))
        });
      } else if (collection === 'orders') {
        callback({
          docs: [],
          docChanges: () => []
        });
      }
      return jest.fn(); // unsubscribe function
    });

    mockAddDoc.mockResolvedValue({ id: 'new-order-id' });
  });

  describe('🎯 Complete Takeaway Order Flow', () => {
    it('should complete full takeaway order journey from homepage to confirmation', async () => {
      const { container } = render(<App />);

      // Step 1: Start from homepage
      expect(screen.getByText('Mid Night Coffee')).toBeInTheDocument();
      expect(screen.getByText('🛍️ Order Takeaway')).toBeInTheDocument();

      // Step 2: Click takeaway button
      const takeawayButton = screen.getByText('🛍️ Order Takeaway');
      await user.click(takeawayButton);

      // Should navigate to menu with takeaway mode
      await waitFor(() => {
        expect(window.location.pathname).toBe('/menu');
        expect(window.location.search).toContain('mode=takeaway');
      });

      // Step 3: Phone gate should appear for new user
      await waitFor(() => {
        expect(screen.getByText('Welcome to MNC ☕')).toBeInTheDocument();
      });

      const phoneInput = screen.getByPlaceholderText('9876543210');
      await user.type(phoneInput, '9876543210');

      const startOrderingButton = screen.getByText('Start Ordering');
      await user.click(startOrderingButton);

      // Step 4: Menu should load after phone verification
      await waitFor(() => {
        expect(screen.getByText('Classic Cold Coffee')).toBeInTheDocument();
        expect(screen.getByText('MNC Special Burger')).toBeInTheDocument();
      });

      // Step 5: Add items to cart
      const coffeeAddButton = screen.getAllByText('Add')[0];
      await user.click(coffeeAddButton);

      // Cart should show 1 item
      expect(screen.getByText('1 item')).toBeInTheDocument();

      // Step 6: Open cart and proceed to checkout
      const viewOrderButton = screen.getByText('View Order');
      await user.click(viewOrderButton);

      expect(screen.getByText('Your Cart')).toBeInTheDocument();
      expect(screen.getByText('Classic Cold Coffee')).toBeInTheDocument();

      const checkoutButton = screen.getByText('Proceed to Checkout');
      await user.click(checkoutButton);

      // Step 7: Should skip straight to confirmation for takeaway
      await waitFor(() => {
        expect(screen.getByText('Confirm Order')).toBeInTheDocument();
        expect(screen.getByText('🛍️ Takeaway')).toBeInTheDocument();
      });

      // Step 8: Place order
      const placeOrderButton = screen.getByText('Place Order');
      await user.click(placeOrderButton);

      // Step 9: Success confirmation
      await waitFor(() => {
        expect(screen.getByText('Order Placed! 🎉')).toBeInTheDocument();
        expect(screen.getByText('🛍️ Takeaway')).toBeInTheDocument();
      });

      // Verify Firebase calls
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          orderMode: 'takeaway',
          tableNumber: 'Takeaway',
          status: 'Pending',
          totalPrice: 120
        })
      );
    });
  });

  describe('🪑 Complete Dine-In Order Flow with Table Selection', () => {
    it('should complete full dine-in order with tap-to-select table', async () => {
      render(<App />);

      // Step 1: Start dine-in flow from homepage
      const dineInButton = screen.getByText('🪑 Dine-In (Select Table)');
      await user.click(dineInButton);

      // Step 2: Table selection modal
      expect(screen.getByText('Choose Your Table')).toBeInTheDocument();

      // Select table 5 using tap-to-select
      const table5Button = screen.getByText('5');
      await user.click(table5Button);
      expect(table5Button).toHaveClass('bg-[#f5a623]');

      const startDiningButton = screen.getByText('Start Dining Experience');
      await user.click(startDiningButton);

      // Step 3: Navigate to menu with table info
      await waitFor(() => {
        expect(window.location.search).toContain('mode=dine-in&table=5');
      });

      // Step 4: Phone verification (new user)
      await waitFor(() => {
        expect(screen.getByText('Welcome to MNC ☕')).toBeInTheDocument();
      });

      const phoneInput = screen.getByPlaceholderText('9876543210');
      await user.type(phoneInput, '9876543210');
      await user.click(screen.getByText('Start Ordering'));

      // Step 5: Menu loads with table info in header
      await waitFor(() => {
        expect(screen.getByText('Table 5')).toBeInTheDocument();
        expect(screen.getByText('Classic Cold Coffee')).toBeInTheDocument();
      });

      // Step 6: Add multiple items including variants and addons
      // Add coffee with addon
      const coffeeAddButton = screen.getAllByText('Add')[0];
      await user.click(coffeeAddButton);

      // Add burger
      const burgerAddButton = screen.getAllByText('Add')[1];
      await user.click(burgerAddButton);

      expect(screen.getByText('2 items')).toBeInTheDocument();

      // Step 7: Proceed to checkout
      const viewOrderButton = screen.getByText('View Order');
      await user.click(viewOrderButton);

      const checkoutButton = screen.getByText('Proceed to Checkout');
      await user.click(checkoutButton);

      // Step 8: Should skip to confirmation (table already selected)
      await waitFor(() => {
        expect(screen.getByText('Confirm Order')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument(); // Table number
      });

      // Step 9: Complete order
      const placeOrderButton = screen.getByText('Place Order');
      await user.click(placeOrderButton);

      await waitFor(() => {
        expect(screen.getByText('Order Placed! 🎉')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
      });

      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          orderMode: 'dine-in',
          tableNumber: '5',
          totalPrice: 370 // Coffee + Burger
        })
      );
    });
  });

  describe('⭐ MNC Special Order Flow (Table Selection Bypass)', () => {
    it('should bypass table selection for MNC Special orders', async () => {
      render(<App />);

      // Step 1: Click MNC Special from homepage
      const specialButton = screen.getByText('⭐ Browse MNC Special');
      await user.click(specialButton);

      // Should navigate with special filter
      await waitFor(() => {
        expect(window.location.search).toContain('filter=special');
      });

      // Step 2: Phone verification
      await waitFor(() => {
        expect(screen.getByText('Welcome to MNC ☕')).toBeInTheDocument();
      });

      const phoneInput = screen.getByPlaceholderText('9876543210');
      await user.type(phoneInput, '9876543210');
      await user.click(screen.getByText('Start Ordering'));

      // Step 3: Should show only MNC Special items
      await waitFor(() => {
        expect(screen.getByText('MNC Special Burger')).toBeInTheDocument();
        expect(screen.queryByText('Classic Cold Coffee')).not.toBeInTheDocument();
      });

      // Step 4: Add special item
      const addButton = screen.getByText('Add');
      await user.click(addButton);

      // Step 5: Proceed to checkout
      const viewOrderButton = screen.getByText('View Order');
      await user.click(viewOrderButton);

      const checkoutButton = screen.getByText('Proceed to Checkout');
      await user.click(checkoutButton);

      // Step 6: Should skip directly to confirmation with special order indicator
      await waitFor(() => {
        expect(screen.getByText('Confirm Order')).toBeInTheDocument();
        expect(screen.getByText('⭐ MNC Special')).toBeInTheDocument();
      });

      // Step 7: Place order
      const placeOrderButton = screen.getByText('Place Order');
      await user.click(placeOrderButton);

      await waitFor(() => {
        expect(screen.getByText('Order Placed! 🎉')).toBeInTheDocument();
        expect(screen.getByText('⭐ MNC Special')).toBeInTheDocument();
      });

      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          orderMode: 'takeaway',
          isSpecialOrder: true,
          tableNumber: 'Takeaway'
        })
      );
    });
  });

  describe('🔄 Deferred Dining Mode Selection Flow', () => {
    it('should handle deferred dining mode selection at checkout', async () => {
      // Start without any saved preferences
      render(<App />);

      // Navigate directly to menu without mode selection
      const { location } = window;
      delete window.location;
      window.location = { pathname: '/menu', search: '', assign: jest.fn() };

      // Phone verification
      const phoneInput = screen.getByPlaceholderText('9876543210');
      await user.type(phoneInput, '9876543210');
      await user.click(screen.getByText('Start Ordering'));

      // Add items to cart
      await waitFor(() => {
        expect(screen.getByText('Classic Cold Coffee')).toBeInTheDocument();
      });

      const addButton = screen.getAllByText('Add')[0];
      await user.click(addButton);

      // Proceed to checkout
      const viewOrderButton = screen.getByText('View Order');
      await user.click(viewOrderButton);

      const checkoutButton = screen.getByText('Proceed to Checkout');
      await user.click(checkoutButton);

      // Should show dining mode selection
      await waitFor(() => {
        expect(screen.getByText('Choose your dining option')).toBeInTheDocument();
        expect(screen.getByText('How would you like to enjoy your order?')).toBeInTheDocument();
      });

      // Select dine-in
      const dineInOption = screen.getByText('Dine-In');
      await user.click(dineInOption);

      // Should then ask for table selection with tap-to-select grid
      await waitFor(() => {
        expect(screen.getByText('Choose Your Table')).toBeInTheDocument();
        expect(screen.getByText('🪑 Dine-In Selected')).toBeInTheDocument();
      });

      // Use tap-to-select table grid
      const table3Button = screen.getByText('3');
      await user.click(table3Button);
      expect(table3Button).toHaveClass('bg-[#f5a623]');

      const confirmTableButton = screen.getByText('Confirm Table 3');
      await user.click(confirmTableButton);

      // Should proceed to final confirmation
      await waitFor(() => {
        expect(screen.getByText('Confirm Order')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
      });

      window.location = location; // Restore
    });
  });

  describe('🎁 Loyalty Streak Integration Flow', () => {
    it('should handle 7th order loyalty reward flow', async () => {
      // Mock loyalty hook to return 6 completed orders (next will be 7th)
      jest.doMock('../../hooks/useLoyalty', () => ({
        useLoyalty: () => ({
          completedOrders: 6,
          fetchProfile: jest.fn(),
          recordOrder: jest.fn(),
        }),
        STREAK_TARGET: 7
      }));

      render(<App />);

      // Complete order flow quickly
      const takeawayButton = screen.getByText('🛍️ Order Takeaway');
      await user.click(takeawayButton);

      // Phone verification
      await waitFor(() => {
        const phoneInput = screen.getByPlaceholderText('9876543210');
        user.type(phoneInput, '9876543210');
        user.click(screen.getByText('Start Ordering'));
      });

      // Should show streak banner indicating close to reward
      await waitFor(() => {
        expect(screen.getByText('Loyalty Streak')).toBeInTheDocument();
        expect(screen.getByText('6/7')).toBeInTheDocument();
        expect(screen.getByText('1 more order to go for your FREE Burger!')).toBeInTheDocument();
      });

      // Add item and checkout
      const addButton = screen.getAllByText('Add')[0];
      await user.click(addButton);

      const viewOrderButton = screen.getByText('View Order');
      await user.click(viewOrderButton);

      const checkoutButton = screen.getByText('Proceed to Checkout');
      await user.click(checkoutButton);

      // Should show 7th order unlock message
      await waitFor(() => {
        expect(screen.getByText('7th Order Unlocked!')).toBeInTheDocument();
        expect(screen.getByText('MNC Special Burger added to your order for FREE!')).toBeInTheDocument();
      });

      const placeOrderButton = screen.getByText('Place Order');
      await user.click(placeOrderButton);

      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          isStreakOrder: true
        })
      );
    });
  });

  describe('📱 Responsive Mobile Experience Flow', () => {
    it('should work seamlessly on mobile viewport', async () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 667,
      });

      render(<App />);

      // Mobile-specific interactions
      const takeawayButton = screen.getByText('🛍️ Order Takeaway');
      expect(takeawayButton).toHaveClass('w-full'); // Full width on mobile

      await user.click(takeawayButton);

      // Phone gate should be mobile optimized
      await waitFor(() => {
        const phoneGate = screen.getByText('Welcome to MNC ☕');
        expect(phoneGate).toBeInTheDocument();
      });

      // Complete flow and verify mobile layout constraints
      const phoneInput = screen.getByPlaceholderText('9876543210');
      await user.type(phoneInput, '9876543210');
      await user.click(screen.getByText('Start Ordering'));

      await waitFor(() => {
        // Should have mobile-first container
        const menuContainer = screen.getByText('Classic Cold Coffee').closest('[class*="max-w-md"]');
        expect(menuContainer).toBeInTheDocument();
      });
    });
  });

  describe('🔄 Session Persistence and Recovery', () => {
    it('should recover user session and cart across page refreshes', async () => {
      // Set up existing session data
      localStorage.setItem('verifiedPhone', '9876543210');
      localStorage.setItem('orderMode', 'dine-in');
      localStorage.setItem('tableNumber', '7');

      render(<App />);

      // Should skip phone gate and remember preferences
      await waitFor(() => {
        expect(screen.queryByText('Welcome to MNC ☕')).not.toBeInTheDocument();
        expect(screen.getByText('Table 7')).toBeInTheDocument();
      });

      // Add items to cart
      const addButton = screen.getAllByText('Add')[0];
      await user.click(addButton);

      // Simulate page refresh by unmounting and remounting
      const { unmount } = render(<App />);
      unmount();
      
      render(<App />);

      // Session should be recovered
      await waitFor(() => {
        expect(screen.getByText('Table 7')).toBeInTheDocument();
      });
    });
  });
});