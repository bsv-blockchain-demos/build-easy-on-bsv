'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { SetupClient } from '@bsv/wallet-toolbox/client';
import { StorageIdb } from '@bsv/wallet-toolbox/client';
import { PrivateKey } from '@bsv/sdk';
import type { SetupWallet } from '@bsv/wallet-toolbox/client';

export interface BSVWalletState {
  setupWallet: SetupWallet | null;
  isConnected: boolean;
  isLoading: boolean;
  address: string | null;
  balance: number;
  formattedBalance: string;
  error: string | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  identityKey: string | null;
  rootKey: string | null;
}

export interface BSVWalletActions {
  createWallet: () => Promise<void>;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  createTransaction: (recipient: string, amountSatoshis: number) => Promise<string>;
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
    setupWallet: null,
    isConnected: false,
    isLoading: true,
    address: null,
    balance: 0,
    formattedBalance: '0.00000000',
    error: null,
    connectionStatus: 'disconnected',
    identityKey: null,
    rootKey: null,
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

      // Generate random root key using BSV SDK
      const rootKeyHex = PrivateKey.fromRandom().toString();

      // Create BRC-100 compliant wallet
      const setupWallet = await SetupClient.createWallet({
        chain: process.env.NEXT_PUBLIC_BSV_NETWORK === 'mainnet' ? 'main' : 'test',
        rootKeyHex,
        active: true,
        backups: {
          storage: new StorageIdb('BSVTorrentWallet')
        }
      });

      // Get identity key and first receiving address
      const identityKey = setupWallet.identityKey;
      const outputs = await setupWallet.listOutputs();
      const firstAddress = outputs.length > 0 ? outputs[0].spendingDescription?.identityKey || null : null;

      // Save wallet configuration to localStorage for persistence
      localStorage.setItem('bsv-torrent-wallet-config', JSON.stringify({
        rootKeyHex,
        chain: process.env.NEXT_PUBLIC_BSV_NETWORK === 'mainnet' ? 'main' : 'test',
        identityKey
      }));

      updateState({
        setupWallet,
        isConnected: true,
        isLoading: false,
        address: firstAddress,
        connectionStatus: 'connected',
        identityKey,
        rootKey: rootKeyHex,
      });

      // Calculate initial balance
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

      // Try to load existing wallet configuration
      const savedConfig = localStorage.getItem('bsv-torrent-wallet-config');

      if (!savedConfig) {
        throw new Error('No existing wallet found. Please create a new wallet.');
      }

      const config = JSON.parse(savedConfig);

      // Recreate wallet from saved configuration
      const setupWallet = await SetupClient.createWallet({
        chain: config.chain,
        rootKeyHex: config.rootKeyHex,
        active: true,
        backups: {
          storage: new StorageIdb('BSVTorrentWallet')
        }
      });

      // Get receiving address from outputs
      const outputs = await setupWallet.listOutputs();
      const firstAddress = outputs.length > 0 ? outputs[0].spendingDescription?.identityKey || null : null;

      updateState({
        setupWallet,
        isConnected: true,
        isLoading: false,
        address: firstAddress,
        connectionStatus: 'connected',
        identityKey: config.identityKey,
        rootKey: config.rootKeyHex,
      });

      // Calculate balance
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
        setupWallet: null,
        isConnected: false,
        isLoading: false,
        address: null,
        balance: 0,
        formattedBalance: '0.00000000',
        error: null,
        connectionStatus: 'disconnected',
        identityKey: null,
        rootKey: null,
      });
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
      updateState({
        error: error instanceof Error ? error.message : 'Failed to disconnect wallet',
      });
    }
  };

  const refreshBalance = async (): Promise<void> => {
    if (!state.setupWallet) return;

    try {
      // Get spendable outputs and calculate balance
      const outputs = await state.setupWallet.listOutputs();
      const spendableOutputs = outputs.filter(output =>
        output.spendable && !output.spent && output.satoshis > 0
      );

      const totalBalance = spendableOutputs.reduce((sum, output) => sum + output.satoshis, 0);

      updateState({ balance: totalBalance });

    } catch (error) {
      console.error('Failed to refresh balance:', error);
      updateState({
        error: error instanceof Error ? error.message : 'Failed to refresh balance',
      });
    }
  };

  const createTransaction = async (recipient: string, amountSatoshis: number): Promise<string> => {
    if (!state.setupWallet || !state.isConnected) {
      throw new Error('Wallet not connected');
    }

    try {
      // Create BRC-100 compliant action
      const action = await state.setupWallet.createAction({
        description: `BSV Torrent Payment: ${amountSatoshis} satoshis`,
        outputs: [{
          script: recipient, // Should be a valid locking script
          satoshis: amountSatoshis,
          description: 'BSV Torrent payment'
        }]
      });

      // The action should contain the signed transaction
      const txid = action.txid;

      if (!txid) {
        throw new Error('Transaction creation failed - no txid returned');
      }

      // Refresh balance after transaction
      setTimeout(() => refreshBalance(), 1000);

      return txid;

    } catch (error) {
      console.error('Failed to create transaction:', error);
      const errorMessage = error instanceof Error ? error.message : 'Transaction failed';
      updateState({ error: errorMessage });
      throw new Error(errorMessage);
    }
  };

  const clearError = (): void => {
    updateState({ error: null });
  };

  // Initialize wallet on mount
  useEffect(() => {
    const initializeWallet = async () => {
      try {
        // Try to connect to existing wallet first
        await connectWallet();
      } catch (error) {
        // If no existing wallet, set to disconnected state
        updateState({
          isLoading: false,
          connectionStatus: 'disconnected'
        });
      }
    };

    initializeWallet();
  }, []);

  // Set up periodic balance refresh when connected
  useEffect(() => {
    if (state.isConnected && state.setupWallet) {
      const interval = setInterval(refreshBalance, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [state.isConnected, state.setupWallet]);

  const actions: BSVWalletActions = {
    createWallet,
    connectWallet,
    disconnectWallet,
    refreshBalance,
    createTransaction,
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
    identityKey: state.identityKey,
    rootKey: state.rootKey,
    connect: actions.connectWallet,
    disconnect: actions.disconnectWallet,
    create: actions.createWallet,
    clearError: actions.clearError,
  };
}