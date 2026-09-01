import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import CustomerMenu from '../CustomerMenu';

// Mock Firebase functions
const mockOnSnapshot = jest.fn();
const mockAddDoc = jest.fn();
const mockCollection = jest.fn();

jest.mock('../../firebase/config', () => ({
  db: {}
}));

jest.mock('firebase/firestore', () => ({
  collection: mockCollection,
  onSnapshot: mockOnSnapshot,
  addDoc: mockAddDoc,
  doc: jest.fn(),
  updateDoc: jest.fn(),
  arrayUnion: jest.fn(),
  increment: jest.fn(),
  serverTimestamp: jest.fn(),
}));

// Mock the loyalty hook
jest.mock('../../hooks/useLoyalty', () => ({
  useLoyalty: () => ({
    completedOrders: 3,
    fetchProfile: jest.fn(),
    recordOrder: jest.fn(),
  }),
  STREAK_TARGET: 7
}));

// Mock components
jest.mock('../../components/OrderTracker', () => {
  return function OrderTracker({ open, onOpenChange }) {
    return open ? <div data-testid="order-tracker">Order Tracker</div> : null;
  };
});

jest.mock('../../components/OrderModificationSheet', () => {
  return function OrderModificationSheet({ order, onClose }) {
    return order ? <div data-testid="order-modification">Order Modification</div> : null;
  };
});

const TestWrapper = ({ children }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

const mockMenuItems = [
  {
    id: '1',
    name: 'Cold Coffee',
    category: 'Cold Coffee',
    description: 'Refreshing cold brew',
    imageUrl: 'test-image.jpg',
    variants: [{ label: 'Regular', price: 120 }],
    addons: [{ label: 'Extra Shot', price: 20 }],
    inStock: true,
    isMncSpecial: false
  },
  {
    id: '2',
    name: 'MNC Burger',
    category: 'Burger',
    description: 'Special burger',
    variants: [{ label: 'Regular', price: 200 }],
    addons: [],
    inStock: true,
    isMncSpecial: true
  }
];

describe('CustomerMenu Component', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    localStorage.clear();
    mockOnSnapshot.mockClear();
    mockAddDoc.mockClear();
    mockCollection.mockClear();
    
    // Mock successful Firebase subscription
    mockOnSnapshot.mockImplementation((collection, callback) => {
      // Simulate loading menu items
      callback({
        docs: mockMenuItems.map(item => ({
          id: item.id,
          data: () => item
        }))
      });
      
      // Return unsubscribe function
      return jest.fn();
    });
  });

  it('renders without crashing', async () => {
    await act(async () => {
      render(
        <TestWrapper>
          <CustomerMenu />
        </TestWrapper>
      );
    });

    expect(screen.getByText('Mid Night Coffee')).toBeInTheDocument();
  });

  it('displays phone gate modal for new users', async () => {
    await act(async () => {
      render(
        <TestWrapper>
          <CustomerMenu />
        </TestWrapper>
      );
    });

    expect(screen.getByText('Welcome to MNC ☕')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('9876543210')).toBeInTheDocument();
  });

  it('handles phone number verification', async () => {
    await act(async () => {
      render(
        <TestWrapper>
          <CustomerMenu />
        </TestWrapper>
      );
    });

    const phoneInput = screen.getByPlaceholderText('9876543210');
    const submitButton = screen.getByText('Start Ordering');

    await user.type(phoneInput, '9876543210');
    await user.click(submitButton);

    expect(localStorage.setItem).toHaveBeenCalledWith('verifiedPhone', '9876543210');
  });

  it('displays menu items after loading', async () => {
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
      expect(screen.getByText('MNC Burger')).toBeInTheDocument();
    });
  });

  it('filters items by category', async () => {
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

    // Click on Burger category
    const burgerCategory = screen.getByText('🍔 Burger');
    await user.click(burgerCategory);

    // Should show burger items, hide coffee items
    expect(screen.getByText('MNC Burger')).toBeInTheDocument();
    expect(screen.queryByText('Cold Coffee')).not.toBeInTheDocument();
  });

  it('adds items to cart', async () => {
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
    const addButton = screen.getAllByText('Add')[0];
    await user.click(addButton);

    // Cart should show 1 item
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('opens cart drawer', async () => {
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

    // Add item to cart first
    const addButton = screen.getAllByText('Add')[0];
    await user.click(addButton);

    // Click cart button
    const cartButton = screen.getByText('Cart');
    await user.click(cartButton);

    // Should show cart drawer
    expect(screen.getByText('Your Cart')).toBeInTheDocument();
  });

  it('handles MNC Special filter', async () => {
    // Mock location search for special filter
    const mockLocation = { search: '?filter=special' };
    jest.spyOn(require('react-router-dom'), 'useLocation').mockReturnValue(mockLocation);

    localStorage.setItem('verifiedPhone', '9876543210');
    
    await act(async () => {
      render(
        <TestWrapper>
          <CustomerMenu />
        </TestWrapper>
      );
    });

    await waitFor(() => {
      // Should show only MNC Special items
      expect(screen.getByText('MNC Burger')).toBeInTheDocument();
      expect(screen.queryByText('Cold Coffee')).not.toBeInTheDocument();
    });
  });

  it('handles out of stock toggle', async () => {
    localStorage.setItem('verifiedPhone', '9876543210');
    
    await act(async () => {
      render(
        <TestWrapper>
          <CustomerMenu />
        </TestWrapper>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Showing all items')).toBeInTheDocument();
    });

    // Click toggle to hide out of stock
    const toggleButton = screen.getByText('Showing all items');
    await user.click(toggleButton);

    expect(screen.getByText('Hiding out-of-stock')).toBeInTheDocument();
  });

  it('displays loyalty streak banner', async () => {
    localStorage.setItem('verifiedPhone', '9876543210');
    
    await act(async () => {
      render(
        <TestWrapper>
          <CustomerMenu />
        </TestWrapper>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Loyalty Streak')).toBeInTheDocument();
      expect(screen.getByText('3/7')).toBeInTheDocument();
    });
  });

  it('handles checkout flow with table selection', async () => {
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
    const addButton = screen.getAllByText('Add')[0];
    await user.click(addButton);

    // Open checkout
    const viewOrderButton = screen.getByText('View Order');
    await user.click(viewOrderButton);

    const checkoutButton = screen.getByText('Proceed to Checkout');
    await user.click(checkoutButton);

    // Should show dining mode selection
    expect(screen.getByText('Choose your dining option')).toBeInTheDocument();
  });

  it('handles special order checkout bypass', async () => {
    // Mock special filter
    const mockLocation = { search: '?filter=special' };
    jest.spyOn(require('react-router-dom'), 'useLocation').mockReturnValue(mockLocation);

    localStorage.setItem('verifiedPhone', '9876543210');
    
    await act(async () => {
      render(
        <TestWrapper>
          <CustomerMenu />
        </TestWrapper>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('MNC Burger')).toBeInTheDocument();
    });

    // Add item to cart
    const addButton = screen.getAllByText('Add')[0];
    await user.click(addButton);

    // Open checkout
    const viewOrderButton = screen.getByText('View Order');
    await user.click(viewOrderButton);

    const checkoutButton = screen.getByText('Proceed to Checkout');
    await user.click(checkoutButton);

    // Should skip directly to confirmation for special orders
    expect(screen.getByText('Confirm Order')).toBeInTheDocument();
    expect(screen.getByText('⭐ MNC Special')).toBeInTheDocument();
  });
});

describe('CustomerMenu Edge Cases', () => {
  beforeEach(() => {
    localStorage.clear();
    mockOnSnapshot.mockClear();
  });

  it('handles loading state', async () => {
    // Mock loading state
    mockOnSnapshot.mockImplementation(() => jest.fn());
    
    await act(async () => {
      render(
        <TestWrapper>
          <CustomerMenu />
        </TestWrapper>
      );
    });

    // Should show loading skeletons
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(6);
  });

  it('handles empty menu items', async () => {
    localStorage.setItem('verifiedPhone', '9876543210');
    
    // Mock empty items
    mockOnSnapshot.mockImplementation((collection, callback) => {
      callback({ docs: [] });
      return jest.fn();
    });
    
    await act(async () => {
      render(
        <TestWrapper>
          <CustomerMenu />
        </TestWrapper>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('No menu items available right now')).toBeInTheDocument();
    });
  });

  it('handles Firebase connection errors gracefully', async () => {
    localStorage.setItem('verifiedPhone', '9876543210');
    
    // Mock Firebase error
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockOnSnapshot.mockImplementation(() => {
      throw new Error('Firebase connection failed');
    });
    
    await act(async () => {
      render(
        <TestWrapper>
          <CustomerMenu />
        </TestWrapper>
      );
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('handles invalid phone numbers', async () => {
    const user = userEvent.setup();
    
    await act(async () => {
      render(
        <TestWrapper>
          <CustomerMenu />
        </TestWrapper>
      );
    });

    const phoneInput = screen.getByPlaceholderText('9876543210');
    const submitButton = screen.getByText('Start Ordering');

    await user.type(phoneInput, '123'); // Invalid short number
    await user.click(submitButton);

    expect(screen.getByText('Please enter a valid 10-digit mobile number.')).toBeInTheDocument();
  });
});