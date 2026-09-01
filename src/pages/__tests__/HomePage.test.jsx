import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import HomePage from '../HomePage';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const TestWrapper = ({ children }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('HomePage Component', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockClear();
  });

  it('renders without crashing', () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    expect(screen.getByText('Mid Night Coffee')).toBeInTheDocument();
    expect(screen.getByText('Order, Track & Enjoy 🎯')).toBeInTheDocument();
  });

  it('displays main CTA buttons', () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    expect(screen.getByText('🛍️ Order Takeaway')).toBeInTheDocument();
    expect(screen.getByText('🪑 Dine-In (Select Table)')).toBeInTheDocument();
    expect(screen.getByText('⭐ Browse MNC Special')).toBeInTheDocument();
  });

  it('handles takeaway order flow', async () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    const takeawayButton = screen.getByText('🛍️ Order Takeaway');
    await user.click(takeawayButton);

    expect(mockNavigate).toHaveBeenCalledWith('/menu?mode=takeaway');
  });

  it('opens table selection modal for dine-in', async () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    const dineInButton = screen.getByText('🪑 Dine-In (Select Table)');
    await user.click(dineInButton);

    expect(screen.getByText('Choose Your Table')).toBeInTheDocument();
    expect(screen.getByText('Select your table number to start ordering')).toBeInTheDocument();
  });

  it('handles table selection', async () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    const dineInButton = screen.getByText('🪑 Dine-In (Select Table)');
    await user.click(dineInButton);

    // Select table 5
    const table5Button = screen.getByText('5');
    await user.click(table5Button);

    const continueButton = screen.getByText('Start Dining Experience');
    await user.click(continueButton);

    expect(mockNavigate).toHaveBeenCalledWith('/menu?mode=dine-in&table=5');
  });

  it('handles custom table number input', async () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    const dineInButton = screen.getByText('🪑 Dine-In (Select Table)');
    await user.click(dineInButton);

    // Open custom input
    const customInput = screen.getByText("Don't see your table? Enter custom number");
    await user.click(customInput);

    const tableInput = screen.getByPlaceholderText('Enter table number');
    await user.type(tableInput, 'VIP-1');

    const continueButton = screen.getByText('Start Dining Experience');
    await user.click(continueButton);

    expect(mockNavigate).toHaveBeenCalledWith('/menu?mode=dine-in&table=VIP-1');
  });

  it('handles MNC Special navigation', async () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    const specialButton = screen.getByText('⭐ Browse MNC Special');
    await user.click(specialButton);

    // Should either navigate directly or open table selection based on saved preferences
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/\/menu.*filter=special/)
    );
  });

  it('remembers saved table number for MNC Special', async () => {
    localStorage.setItem('tableNumber', '3');

    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    const specialButton = screen.getByText('⭐ Browse MNC Special');
    await user.click(specialButton);

    expect(mockNavigate).toHaveBeenCalledWith('/menu?mode=dine-in&table=3&filter=special');
  });

  it('shows admin login link', () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    expect(screen.getByText('Admin Login')).toBeInTheDocument();
  });

  it('closes table selection modal', async () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    const dineInButton = screen.getByText('🪑 Dine-In (Select Table)');
    await user.click(dineInButton);

    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    expect(screen.queryByText('Choose Your Table')).not.toBeInTheDocument();
  });

  it('validates table selection', async () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    const dineInButton = screen.getByText('🪑 Dine-In (Select Table)');
    await user.click(dineInButton);

    // Try to continue without selecting a table
    const continueButton = screen.getByText('Select a Table First');
    expect(continueButton).toBeDisabled();
  });

  it('handles keyboard navigation in table selection', async () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    const dineInButton = screen.getByText('🪑 Dine-In (Select Table)');
    await user.click(dineInButton);

    // Test escape key to close modal
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    
    await waitFor(() => {
      expect(screen.queryByText('Choose Your Table')).not.toBeInTheDocument();
    });
  });

  it('displays feature highlights', () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    expect(screen.getByText('🎁 Loyalty Rewards')).toBeInTheDocument();
    expect(screen.getByText('📱 QR Code Ordering')).toBeInTheDocument();
    expect(screen.getByText('⚡ Quick Takeaway')).toBeInTheDocument();
  });

  it('handles mobile responsive design', () => {
    // Mock mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    // Check for mobile-specific elements
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    
    // Buttons should be full width on mobile
    buttons.forEach(button => {
      expect(button).toHaveClass('w-full');
    });
  });

  it('preserves user preferences across sessions', async () => {
    localStorage.setItem('orderMode', 'takeaway');

    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    const takeawayButton = screen.getByText('🛍️ Order Takeaway');
    expect(takeawayButton).toBeInTheDocument();
    
    // Should remember preference when navigating
    await user.click(takeawayButton);
    expect(mockNavigate).toHaveBeenCalledWith('/menu?mode=takeaway');
  });

  it('handles error states gracefully', async () => {
    // Mock navigation error
    mockNavigate.mockImplementation(() => {
      throw new Error('Navigation failed');
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    const takeawayButton = screen.getByText('🛍️ Order Takeaway');
    await user.click(takeawayButton);

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('HomePage Table Selection Modal', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders all table numbers', async () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    const dineInButton = screen.getByText('🪑 Dine-In (Select Table)');
    await user.click(dineInButton);

    // Check all tables 1-10 are present
    for (let i = 1; i <= 10; i++) {
      expect(screen.getByText(i.toString())).toBeInTheDocument();
    }
  });

  it('highlights selected table', async () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    const dineInButton = screen.getByText('🪑 Dine-In (Select Table)');
    await user.click(dineInButton);

    const table5Button = screen.getByText('5');
    await user.click(table5Button);

    // Check if button is highlighted (has selected styling)
    expect(table5Button).toHaveClass('bg-[#f5a623]');
  });

  it('allows changing table selection', async () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    const dineInButton = screen.getByText('🪑 Dine-In (Select Table)');
    await user.click(dineInButton);

    // Select table 3
    const table3Button = screen.getByText('3');
    await user.click(table3Button);

    // Then select table 7
    const table7Button = screen.getByText('7');
    await user.click(table7Button);

    // Table 7 should be selected, table 3 should not
    expect(table7Button).toHaveClass('bg-[#f5a623]');
    expect(table3Button).not.toHaveClass('bg-[#f5a623]');
  });

  it('updates continue button text based on selection', async () => {
    render(
      <TestWrapper>
        <HomePage />
      </TestWrapper>
    );

    const dineInButton = screen.getByText('🪑 Dine-In (Select Table)');
    await user.click(dineInButton);

    // Initially should show "Select a Table First"
    expect(screen.getByText('Select a Table First')).toBeDisabled();

    // After selecting a table
    const table2Button = screen.getByText('2');
    await user.click(table2Button);

    expect(screen.getByText('Start Dining Experience')).toBeEnabled();
  });
});