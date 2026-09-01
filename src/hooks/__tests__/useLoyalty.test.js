import { renderHook, act, waitFor } from '@testing-library/react';
import { useLoyalty, STREAK_TARGET } from '../useLoyalty';

// Mock Firebase
const mockDoc = jest.fn();
const mockGetDoc = jest.fn();
const mockSetDoc = jest.fn();
const mockUpdateDoc = jest.fn();

jest.mock('../../firebase/config', () => ({
  db: {}
}));

jest.mock('firebase/firestore', () => ({
  doc: mockDoc,
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  increment: jest.fn(val => ({ increment: val })),
  serverTimestamp: jest.fn(() => ({ timestamp: true })),
}));

describe('useLoyalty Hook', () => {
  beforeEach(() => {
    mockDoc.mockClear();
    mockGetDoc.mockClear();
    mockSetDoc.mockClear();
    mockUpdateDoc.mockClear();
  });

  it('initializes with default values', () => {
    const { result } = renderHook(() => useLoyalty());

    expect(result.current.completedOrders).toBe(0);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.fetchProfile).toBe('function');
    expect(typeof result.current.recordOrder).toBe('function');
  });

  it('fetches existing customer profile', async () => {
    const mockProfile = {
      exists: () => true,
      data: () => ({
        completedOrders: 5,
        lastOrderDate: new Date(),
        createdAt: new Date()
      })
    };

    mockGetDoc.mockResolvedValue(mockProfile);

    const { result } = renderHook(() => useLoyalty());

    await act(async () => {
      const orders = await result.current.fetchProfile('9876543210');
      expect(orders).toBe(5);
    });

    expect(result.current.completedOrders).toBe(5);
    expect(result.current.loading).toBe(false);
  });

  it('creates new customer profile for new user', async () => {
    const mockProfile = {
      exists: () => false
    };

    mockGetDoc.mockResolvedValue(mockProfile);
    mockSetDoc.mockResolvedValue();

    const { result } = renderHook(() => useLoyalty());

    await act(async () => {
      const orders = await result.current.fetchProfile('9876543210');
      expect(orders).toBe(0);
    });

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        completedOrders: 0,
        createdAt: expect.anything()
      })
    );

    expect(result.current.completedOrders).toBe(0);
  });

  it('records new order and increments count', async () => {
    mockUpdateDoc.mockResolvedValue();

    // Start with existing customer
    const mockProfile = {
      exists: () => true,
      data: () => ({
        completedOrders: 3,
        lastOrderDate: new Date(),
        createdAt: new Date()
      })
    };
    mockGetDoc.mockResolvedValue(mockProfile);

    const { result } = renderHook(() => useLoyalty());

    // Fetch profile first
    await act(async () => {
      await result.current.fetchProfile('9876543210');
    });

    // Record new order
    await act(async () => {
      await result.current.recordOrder('9876543210');
    });

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        completedOrders: { increment: 1 },
        lastOrderDate: expect.anything()
      })
    );

    expect(result.current.completedOrders).toBe(4);
  });

  it('handles errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockGetDoc.mockRejectedValue(new Error('Firebase error'));

    const { result } = renderHook(() => useLoyalty());

    await act(async () => {
      const orders = await result.current.fetchProfile('9876543210');
      expect(orders).toBe(0);
    });

    expect(result.current.error).toBe('Failed to fetch profile');
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  it('handles invalid phone numbers', async () => {
    const { result } = renderHook(() => useLoyalty());

    await act(async () => {
      const orders = await result.current.fetchProfile('');
      expect(orders).toBe(0);
    });

    expect(result.current.error).toBe('Invalid phone number');
  });

  it('detects streak completion', async () => {
    const mockProfile = {
      exists: () => true,
      data: () => ({
        completedOrders: STREAK_TARGET - 1, // One before target
        lastOrderDate: new Date(),
        createdAt: new Date()
      })
    };

    mockGetDoc.mockResolvedValue(mockProfile);
    mockUpdateDoc.mockResolvedValue();

    const { result } = renderHook(() => useLoyalty());

    // Fetch profile
    await act(async () => {
      await result.current.fetchProfile('9876543210');
    });

    expect(result.current.completedOrders).toBe(STREAK_TARGET - 1);

    // Record order that completes streak
    await act(async () => {
      await result.current.recordOrder('9876543210');
    });

    expect(result.current.completedOrders).toBe(STREAK_TARGET);
  });

  it('handles concurrent requests safely', async () => {
    const mockProfile = {
      exists: () => true,
      data: () => ({
        completedOrders: 2,
        lastOrderDate: new Date(),
        createdAt: new Date()
      })
    };

    mockGetDoc.mockResolvedValue(mockProfile);
    mockUpdateDoc.mockResolvedValue();

    const { result } = renderHook(() => useLoyalty());

    // Simulate concurrent requests
    await act(async () => {
      const promises = [
        result.current.fetchProfile('9876543210'),
        result.current.fetchProfile('9876543210'),
        result.current.fetchProfile('9876543210')
      ];
      await Promise.all(promises);
    });

    // Should only have been called once due to state management
    expect(result.current.completedOrders).toBe(2);
    expect(result.current.loading).toBe(false);
  });

  it('validates STREAK_TARGET constant', () => {
    expect(STREAK_TARGET).toBe(7);
    expect(typeof STREAK_TARGET).toBe('number');
    expect(STREAK_TARGET > 0).toBe(true);
  });

  it('handles network connectivity issues', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockGetDoc.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useLoyalty());

    await act(async () => {
      await result.current.fetchProfile('9876543210');
    });

    expect(result.current.error).toBe('Failed to fetch profile');
    expect(result.current.loading).toBe(false);
    expect(result.current.completedOrders).toBe(0);

    consoleSpy.mockRestore();
  });

  it('clears error state on successful operation', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // First, cause an error
    mockGetDoc.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useLoyalty());

    await act(async () => {
      await result.current.fetchProfile('9876543210');
    });

    expect(result.current.error).toBe('Failed to fetch profile');

    // Then, make it succeed
    const mockProfile = {
      exists: () => true,
      data: () => ({ completedOrders: 1, createdAt: new Date() })
    };
    mockGetDoc.mockResolvedValue(mockProfile);

    await act(async () => {
      await result.current.fetchProfile('9876543210');
    });

    expect(result.current.error).toBeNull();
    expect(result.current.completedOrders).toBe(1);

    consoleSpy.mockRestore();
  });

  it('handles malformed profile data', async () => {
    const mockProfile = {
      exists: () => true,
      data: () => ({
        // Missing completedOrders field
        lastOrderDate: new Date(),
        createdAt: new Date()
      })
    };

    mockGetDoc.mockResolvedValue(mockProfile);

    const { result } = renderHook(() => useLoyalty());

    await act(async () => {
      const orders = await result.current.fetchProfile('9876543210');
      expect(orders).toBe(0); // Should default to 0
    });

    expect(result.current.completedOrders).toBe(0);
  });
});