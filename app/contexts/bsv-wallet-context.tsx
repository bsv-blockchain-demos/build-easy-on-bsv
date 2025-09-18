'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { SetupClient, StorageIdb, Wallet } from '@bsv/wallet-toolbox/client';

export interface BSVWalletState {
  wallet: Wallet | null;
  isConnected: boolean;
  isLoading: boolean;
  address: string | null;
  balance: number;
  formattedBalance: string;
  error: string | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
}

export interface BSVWalletActions {
  createWallet: () => Promise<void>;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  requestTransaction: (recipient: string, amountSatoshis: number) => Promise<string>;
  clearError: () => void;
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
    wallet: null,
    isConnected: false,
    isLoading: true,
    address: null,
    balance: 0,
    formattedBalance: '0.00000000',
    error: null,
    connectionStatus: 'disconnected',
  });

  const formatSatoshisToBSV = (satoshis: number): string => {
    return (satoshis / 100000000).toFixed(8);
  };

  const updateState = (updates: Partial<BSVWalletState>) => {
    setState(prev => {
      const newState = { ...prev, ...updates };

      // Auto-format balance when it changes
      if ('balance' in updates && updates.balance !== undefined) {
        newState.formattedBalance = formatSatoshisToBSV(updates.balance);
      }

      return newState;
    });
  };

  const createWallet = async (): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null, connectionStatus: 'connecting' });

      const storage = new StorageIdb('BSVTorrentWallet');
      const wallet = await SetupClient.createWallet({
        storage,
        network: process.env.NEXT_PUBLIC_BSV_NETWORK === 'mainnet' ? 'mainnet' : 'testnet',
      });

      const address = await wallet.getAddress();

      updateState({
        wallet,
        isConnected: true,
        isLoading: false,
        address,
        connectionStatus: 'connected',
      });

      // Refresh balance after wallet creation
      await refreshBalance();

    } catch (error) {
      console.error('Failed to create wallet:', error);
      updateState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to create wallet',
        connectionStatus: 'error',
      });
    }
  };

  const connectWallet = async (): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null, connectionStatus: 'connecting' });

      const storage = new StorageIdb('BSVTorrentWallet');

      // Try to load existing wallet
      const wallet = await SetupClient.createWallet({
        storage,
        network: process.env.NEXT_PUBLIC_BSV_NETWORK === 'mainnet' ? 'mainnet' : 'testnet',
      });

      const address = await wallet.getAddress();

      updateState({
        wallet,
        isConnected: true,
        isLoading: false,
        address,
        connectionStatus: 'connected',
      });

      // Refresh balance after connection
      await refreshBalance();

    } catch (error) {
      console.error('Failed to connect wallet:', error);
      updateState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to connect wallet',
        connectionStatus: 'error',
      });
    }
  };

  const disconnectWallet = async (): Promise<void> => {
    try {
      updateState({
        wallet: null,
        isConnected: false,
        isLoading: false,
        address: null,
        balance: 0,
        formattedBalance: '0.00000000',
        error: null,
        connectionStatus: 'disconnected',
      });
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
      updateState({
        error: error instanceof Error ? error.message : 'Failed to disconnect wallet',
      });
    }
  };

  const refreshBalance = async (): Promise<void> => {
    if (!state.wallet) return;

    try {
      // Call backend API to get balance from server wallet
      const response = await fetch('/api/wallet/balance', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch balance');
      }

      const { balance } = await response.json();

      updateState({ balance });

    } catch (error) {
      console.error('Failed to refresh balance:', error);
      updateState({
        error: error instanceof Error ? error.message : 'Failed to refresh balance',
      });
    }
  };

  const requestTransaction = async (recipient: string, amountSatoshis: number): Promise<string> => {
    if (!state.wallet || !state.isConnected) {
      throw new Error('Wallet not connected');
    }

    try {
      // Request transaction from server wallet (which holds the actual funds and keys)
      const response = await fetch('/api/wallet/transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({
          recipient,
          amountSatoshis,
          clientAddress: state.address,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Transaction failed');
      }

      const { txid } = await response.json();

      // Refresh balance after transaction
      setTimeout(() => refreshBalance(), 1000);

      return txid;

    } catch (error) {
      console.error('Failed to request transaction:', error);
      const errorMessage = error instanceof Error ? error.message : 'Transaction failed';
      updateState({ error: errorMessage });
      throw new Error(errorMessage);
    }
  };

  const getAuthToken = async (): Promise<string> => {
    // Generate authentication token using client wallet signature
    // This proves the client has access to the wallet without exposing private keys
    if (!state.wallet) {
      throw new Error('Wallet not available for authentication');
    }

    const message = `BSV Torrent Auth: ${Date.now()}`;
    const signature = await state.wallet.sign(message);

    return btoa(JSON.stringify({
      address: state.address,
      message,
      signature,
    }));
  };

  const clearError = (): void => {
    updateState({ error: null });
  };

  // Initialize wallet on mount
  useEffect(() => {
    const initializeWallet = async () => {
      try {
        // Try to connect to existing wallet
        await connectWallet();
      } catch (error) {
        // If no existing wallet, we'll wait for user to create one
        updateState({
          isLoading: false,
          connectionStatus: 'disconnected'
        });
      }
    };

    initializeWallet();
  }, []);

  // Set up periodic balance refresh
  useEffect(() => {
    if (state.isConnected && state.wallet) {
      const interval = setInterval(refreshBalance, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [state.isConnected, state.wallet]);

  const actions: BSVWalletActions = {
    createWallet,
    connectWallet,
    disconnectWallet,
    refreshBalance,
    requestTransaction,
    clearError,
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
export function useWalletBalance() {
  const { state } = useBSVWallet();
  return {
    balance: state.balance,
    formattedBalance: state.formattedBalance,
  };
}

export function useWalletConnection() {
  const { state, actions } = useBSVWallet();
  return {
    isConnected: state.isConnected,
    isLoading: state.isLoading,
    connectionStatus: state.connectionStatus,
    address: state.address,
    error: state.error,
    connect: actions.connectWallet,
    disconnect: actions.disconnectWallet,
    create: actions.createWallet,
    clearError: actions.clearError,
  };
}