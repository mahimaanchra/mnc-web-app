import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import AdminMenu from '../AdminMenu';

// Mock Firebase
const mockOnSnapshot = jest.fn();
const mockAddDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDeleteDoc = jest.fn();

jest.mock('../../firebase/config', () => ({
  db: {}
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  onSnapshot: mockOnSnapshot,
  addDoc: mockAddDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
  doc: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
  serverTimestamp: jest.fn(),
}));

// Mock Auth Context
const mockLogout = jest.fn();
const mockCurrentUser = { email: 'admin@test.com' };

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: mockCurrentUser,
    logout: mockLogout
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
    inStock: false,
    isMncSpecial: true
  }
];

const mockOrders = [
  {
    id: 'order1',
    tableNumber: '5',
    orderMode: 'dine-in',
    items: [{ itemName: 'Cold Coffee', qty: 1, price: 120 }],
    totalPrice: 120,
    status: 'Pending',
    paymentMethod: 'Pay at Counter',
    customerPhone: '9876543210',
    createdAt: { toMillis: () => Date.now() - 300000 }
  }
];

describe('AdminMenu Component', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    mockOnSnapshot.mockClear();
    mockAddDoc.mockClear();
    mockUpdateDoc.mockClear();
    mockDeleteDoc.mockClear();
    mockLogout.mockClear();

    // Mock menu items subscription
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
      // Mock orders subscription
      .mockImplementationOnce((query, callback) => {
        callback({
          docs: mockOrders.map(order => ({
            id: order.id,
            data: () => order
          })),
          docChanges: () => []
        });
        return jest.fn();
      });
  });

  it('renders without crashing', async () => {
    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    expect(screen.getByText('admin@test.com')).toBeInTheDocument();
  });

  it('displays menu statistics', async () => {
    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Total Items')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument(); // Total items
      expect(screen.getByText('In Stock')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // In stock items
    });
  });

  it('displays menu items', async () => {
    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Cold Coffee')).toBeInTheDocument();
      expect(screen.getByText('MNC Burger')).toBeInTheDocument();
    });
  });

  it('opens add item form', async () => {
    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    const addButton = screen.getByText('Add Item');
    await user.click(addButton);

    expect(screen.getByText('➕ New Menu Item')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Classic Cold Coffee')).toBeInTheDocument();
  });

  it('handles item creation', async () => {
    mockAddDoc.mockResolvedValue({ id: 'new-item' });

    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    // Open add form
    const addButton = screen.getByText('Add Item');
    await user.click(addButton);

    // Fill form
    await user.type(screen.getByPlaceholderText('e.g. Classic Cold Coffee'), 'New Coffee');
    await user.type(screen.getByPlaceholderText('Short description of the item...'), 'Test description');

    // Add variant
    const variantInputs = screen.getAllByPlaceholderText('e.g. "Medium" or "Cheese Slice"');
    await user.type(variantInputs[0], 'Regular');
    
    const priceInputs = screen.getAllByPlaceholderText('0');
    await user.type(priceInputs[0], '150');

    // Submit form
    const saveButton = screen.getByText('Save Item');
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockAddDoc).toHaveBeenCalled();
    });
  });

  it('handles item editing', async () => {
    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Cold Coffee')).toBeInTheDocument();
    });

    // Click edit button
    const editButtons = screen.getAllByText('Edit');
    await user.click(editButtons[0]);

    expect(screen.getByText('✏️ Edit Menu Item')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Cold Coffee')).toBeInTheDocument();
  });

  it('handles item deletion with confirmation', async () => {
    window.confirm = jest.fn(() => true);
    mockDeleteDoc.mockResolvedValue();

    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Cold Coffee')).toBeInTheDocument();
    });

    // Click delete button
    const deleteButtons = screen.getAllByTestId('mock-icon'); // Trash2 icons
    const deleteButton = deleteButtons.find(btn => btn.closest('button'));
    await user.click(deleteButton);

    expect(window.confirm).toHaveBeenCalledWith('Delete this item? This cannot be undone.');
    await waitFor(() => {
      expect(mockDeleteDoc).toHaveBeenCalled();
    });
  });

  it('toggles item stock status', async () => {
    mockUpdateDoc.mockResolvedValue();

    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Cold Coffee')).toBeInTheDocument();
    });

    // Click stock toggle for in-stock item
    const stockButtons = screen.getAllByText('In Stock');
    await user.click(stockButtons[0]);

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          inStock: false
        })
      );
    });
  });

  it('switches to orders tab', async () => {
    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    const ordersTab = screen.getByText('Live Orders');
    await user.click(ordersTab);

    await waitFor(() => {
      expect(screen.getByText('Active Orders (1)')).toBeInTheDocument();
      expect(screen.getByText('Table 5')).toBeInTheDocument();
    });
  });

  it('handles order status updates', async () => {
    mockUpdateDoc.mockResolvedValue();

    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    // Switch to orders tab
    const ordersTab = screen.getByText('Live Orders');
    await user.click(ordersTab);

    await waitFor(() => {
      expect(screen.getByText('Mark Preparing')).toBeInTheDocument();
    });

    // Update order status
    const markPreparingButton = screen.getByText('Mark Preparing');
    await user.click(markPreparingButton);

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'Preparing'
        })
      );
    });
  });

  it('filters menu items by category', async () => {
    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Cold Coffee')).toBeInTheDocument();
      expect(screen.getByText('MNC Burger')).toBeInTheDocument();
    });

    // Click Burger category filter
    const burgerFilter = screen.getByText('Burger');
    await user.click(burgerFilter);

    // Should show only burger items
    expect(screen.getByText('MNC Burger')).toBeInTheDocument();
    expect(screen.queryByText('Cold Coffee')).not.toBeInTheDocument();
  });

  it('handles logout with confirmation', async () => {
    mockLogout.mockResolvedValue();

    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    const logoutButton = screen.getByText('Logout');
    await user.click(logoutButton);

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  it('prevents navigation back with confirmation', async () => {
    window.confirm = jest.fn(() => false);

    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    // Simulate browser back button
    const event = new PopStateEvent('popstate');
    window.dispatchEvent(event);

    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to leave the admin panel? You will need to log in again.'
    );
  });

  it('handles form validation errors', async () => {
    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    // Open add form
    const addButton = screen.getByText('Add Item');
    await user.click(addButton);

    // Try to submit without required fields
    const saveButton = screen.getByText('Save Item');
    await user.click(saveButton);

    expect(screen.getByText('Item name is required.')).toBeInTheDocument();
    expect(screen.getByText('At least one price variant is required.')).toBeInTheDocument();
  });

  it('displays order with modifications', async () => {
    const modifiedOrder = {
      ...mockOrders[0],
      hasModification: true,
      modifications: [
        {
          items: [{ itemName: 'Extra Coffee', qty: 1, price: 120 }],
          addedPrice: 120,
          addedAt: new Date().toISOString()
        }
      ]
    };

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
      .mockImplementationOnce((query, callback) => {
        callback({
          docs: [
            {
              id: modifiedOrder.id,
              data: () => modifiedOrder
            }
          ],
          docChanges: () => []
        });
        return jest.fn();
      });

    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    // Switch to orders tab
    const ordersTab = screen.getByText('Live Orders');
    await user.click(ordersTab);

    await waitFor(() => {
      expect(screen.getByText('Items Added by Customer')).toBeInTheDocument();
      expect(screen.getByText('Extra Coffee')).toBeInTheDocument();
    });
  });
});

describe('AdminMenu Form Validation', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    mockOnSnapshot.mockImplementation((collection, callback) => {
      callback({ docs: [] });
      return jest.fn();
    });
  });

  it('validates required fields', async () => {
    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    const addButton = screen.getByText('Add Item');
    await user.click(addButton);

    const saveButton = screen.getByText('Save Item');
    await user.click(saveButton);

    expect(screen.getByText('Item name is required.')).toBeInTheDocument();
  });

  it('validates price variants', async () => {
    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    const addButton = screen.getByText('Add Item');
    await user.click(addButton);

    // Fill name but leave variants empty
    await user.type(screen.getByPlaceholderText('e.g. Classic Cold Coffee'), 'Test Item');

    const saveButton = screen.getByText('Save Item');
    await user.click(saveButton);

    expect(screen.getByText('At least one price variant is required.')).toBeInTheDocument();
  });

  it('handles image URL validation', async () => {
    await act(async () => {
      render(
        <TestWrapper>
          <AdminMenu />
        </TestWrapper>
      );
    });

    const addButton = screen.getByText('Add Item');
    await user.click(addButton);

    const imageInput = screen.getByPlaceholderText('https://images.unsplash.com/photo-…');
    await user.type(imageInput, 'invalid-url');

    // Should show error when image fails to load
    const image = screen.getByAltText('preview');
    fireEvent.error(image);

    expect(screen.getByText('⚠ Could not load this URL.')).toBeInTheDocument();
  });
});