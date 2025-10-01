'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { WalletClient } from '@bsv/sdk';

export interface BSVWalletState {
  walletClient: WalletClient | null;
  wallet: WalletClient | null; // Alias for compatibility
  isConnected: boolean;
  isLoading: boolean;
  address: string | null;
  publicKey: string | null;
  balance: number;
  formattedBalance: string;
  error: string | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  isAuthenticated: boolean;
}

export interface BSVWalletActions {
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  sendToServerWallet: (amountSatoshis: number, purpose: string) => Promise<string>;
  clearError: () => void;
  refreshConnection: () => Promise<void>;
}

export interface BSVWalletContextType {
  state: BSVWalletState;
  actions: BSVWalletActions;
}

const BSVWalletContext = createContext<BSVWalletContextType | null>(null);

interface BSVWalletProviderProps {
  children: ReactNode;
}

export function BSVWalletProvider({ children }: BSVWalletProviderProps) {
  const [state, setState] = useState<BSVWalletState>({
    walletClient: null,
    wallet: null,
    isConnected: false,
    isLoading: true,
    address: null,
    publicKey: null,
    balance: 0,
    formattedBalance: '0.00000000',
    error: null,
    connectionStatus: 'disconnected',
    isAuthenticated: false,
  });

  const updateState = (updates: Partial<BSVWalletState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  /**
   * Connect to user's BRC-100 compliant wallet (browser extension, mobile app, etc.)
   * This follows the CommonSourceOnboarding pattern for client-side wallet connection
   */
  const connectWallet = useCallback(async (): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null, connectionStatus: 'connecting' });

      // Try different substrates in order of preference (like CommonSourceOnboarding)
      const substrates = [
        { name: 'auto', config: 'auto' as const },
        { name: 'window.CWI', config: 'window.CWI' as const },
        { name: 'Cicada', config: 'Cicada' as const },
        { name: 'json-api', config: 'json-api' as const }
      ];

      let walletClient = null;
      let lastError = null;
      const errors = [];

      for (const substrate of substrates) {
        try {
          console.log(`[BSVWallet] Trying substrate: ${substrate.name}`);
          walletClient = new WalletClient(substrate.config, 'localhost');

          // Force connection to substrate
          await walletClient.connectToSubstrate();
          console.log(`[BSVWallet] Connected to substrate: ${substrate.name}`);

          // Test authentication
          const authResult = await walletClient.isAuthenticated();
          const isAuthenticated = authResult.authenticated;
          console.log(`[BSVWallet] Authentication result: ${isAuthenticated}`);

          if (isAuthenticated) {
            // Get public key to verify full functionality
            const { publicKey } = await walletClient.getPublicKey({ identityKey: true });
            console.log(`[BSVWallet] Got public key: ${publicKey?.substring(0, 16)}...`);

            updateState({
              walletClient,
              wallet: walletClient,
              isConnected: true,
              isLoading: false,
              publicKey,
              address: publicKey, // For display purposes
              connectionStatus: 'connected',
              isAuthenticated: true,
            });

            console.log(`[BSVWallet] Successfully connected with substrate: ${substrate.name}`);
            return;
          } else {
            console.warn(`[BSVWallet] Substrate ${substrate.name} connected but not authenticated`);
            errors.push(`${substrate.name}: Connected but not authenticated`);
          }
        } catch (error) {
          console.error(`[BSVWallet] Substrate ${substrate.name} failed:`, error instanceof Error ? error.message : error);
          errors.push(`${substrate.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          lastError = error;
          continue;
        }
      }

      // If we get here, all substrates failed
      console.error('[BSVWallet] All substrate attempts failed:', errors);
      throw new Error(`Failed to connect to any wallet substrate. Last error: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`);

    } catch (error) {
      console.error('Failed to connect wallet:', error);
      updateState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to connect wallet',
        connectionStatus: 'error',
      });
    }
  }, []); // Empty deps - updateState is stable

  /**
   * Disconnect from user's wallet
   */
  const disconnectWallet = useCallback(async (): Promise<void> => {
    try {
      updateState({
        walletClient: null,
        wallet: null,
        isConnected: false,
        isLoading: false,
        address: null,
        publicKey: null,
        balance: 0,
        formattedBalance: '0.00000000',
        error: null,
        connectionStatus: 'disconnected',
        isAuthenticated: false,
      });
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
      updateState({
        error: error instanceof Error ? error.message : 'Failed to disconnect wallet',
      });
    }
  }, []);

  /**
   * Send payment from user's wallet to the server wallet
   * This uses the user's BRC-100 wallet to send funds to the app wallet
   */
  const sendToServerWallet = useCallback(async (amountSatoshis: number, purpose: string): Promise<string> => {
    if (!state.walletClient || !state.isConnected) {
      throw new Error('Wallet not connected');
    }

    try {
      // First, get a payment request from the server wallet
      const response = await fetch('/api/wallet/payment-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amountSatoshis,
          purpose,
          description: `BSV Torrent ${purpose} funding`
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create payment request');
      }

      const { data: paymentRequest } = await response.json();

      // Create BRC-100 compliant action using user's wallet
      const action = await state.walletClient.createAction({
        description: `BSV Torrent Payment: ${amountSatoshis} satoshis to app wallet`,
        outputs: [{
          lockingScript: paymentRequest.paymentAddress, // Server wallet address
          satoshis: amountSatoshis,
          outputDescription: `BSV Torrent ${purpose} payment`
        }]
      });

      const txid = action.txid;

      if (!txid) {
        throw new Error('Transaction creation failed - no txid returned');
      }

      console.log(`[BSVWallet] Payment sent to server wallet: ${txid}`);
      return txid;

    } catch (error) {
      console.error('Failed to send payment to server wallet:', error);
      const errorMessage = error instanceof Error ? error.message : 'Payment failed';
      updateState({ error: errorMessage });
      throw new Error(errorMessage);
    }
  }, [state.walletClient, state.isConnected]); // Depends on wallet state

  /**
   * Refresh wallet connection status
   */
  const refreshConnection = useCallback(async (): Promise<void> => {
    if (!state.walletClient) {
      return;
    }

    try {
      const authResult = await state.walletClient.isAuthenticated();
      const isAuthenticated = authResult.authenticated;

      updateState({
        isAuthenticated,
        isConnected: isAuthenticated,
        connectionStatus: isAuthenticated ? 'connected' : 'disconnected'
      });

    } catch (error) {
      console.error('Failed to refresh connection:', error);
      updateState({
        isAuthenticated: false,
        isConnected: false,
        connectionStatus: 'error',
        error: error instanceof Error ? error.message : 'Connection refresh failed',
      });
    }
  }, [state.walletClient]); // Depends on wallet client

  /**
   * Clear error state
   */
  const clearError = useCallback((): void => {
    updateState({ error: null });
  }, []);

  // Initialize wallet on mount
  useEffect(() => {
    const initializeWallet = async () => {
      try {
        // Try to connect to user's wallet
        await connectWallet();
      } catch (error) {
        // If connection fails, set to disconnected state
        updateState({
          isLoading: false,
          connectionStatus: 'disconnected'
        });
      }
    };

    initializeWallet();
  }, [connectWallet]); // Include connectWallet dependency

  // Set up periodic connection refresh when connected
  useEffect(() => {
    if (state.isConnected && state.walletClient) {
      const interval = setInterval(refreshConnection, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [state.isConnected, state.walletClient, refreshConnection]); // Include all dependencies

  const actions: BSVWalletActions = {
    connectWallet,
    disconnectWallet,
    sendToServerWallet,
    clearError,
    refreshConnection,
  };

  const contextValue: BSVWalletContextType = {
    state,
    actions,
  };

  return (
    <BSVWalletContext.Provider value={contextValue}>
      {children}
    </BSVWalletContext.Provider>
  );
}

export function useBSVWallet() {
  const context = useContext(BSVWalletContext);
  if (!context) {
    throw new Error('useBSVWallet must be used within a BSVWalletProvider');
  }
  return context;
}

// Convenience hooks for specific wallet state
export function useWalletConnection() {
  const { state, actions } = useBSVWallet();
  return {
    isConnected: state.isConnected,
    isLoading: state.isLoading,
    connectionStatus: state.connectionStatus,
    address: state.address,
    publicKey: state.publicKey,
    error: state.error,
    isAuthenticated: state.isAuthenticated,
    connect: actions.connectWallet,
    disconnect: actions.disconnectWallet,
    sendToServerWallet: actions.sendToServerWallet,
    clearError: actions.clearError,
    refreshConnection: actions.refreshConnection,
  };
}