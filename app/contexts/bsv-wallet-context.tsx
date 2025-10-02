'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { WalletClient } from '@bsv/sdk';

export interface BSVWalletState {
  // App wallet (server-side) state - THIS IS WHAT SHOWS IN THE UI
  balance: number;
  formattedBalance: string;
  address: string | null;
  publicKey: string | null;
  isLoading: boolean;
  error: string | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';

  // Client wallet (for deposits/withdrawals only) state
  clientWallet: WalletClient | null;
  clientConnected: boolean;
  clientAuthenticated: boolean;
}

export interface BSVWalletActions {
  // App wallet actions
  refreshBalance: () => Promise<void>;

  // Client wallet actions (for deposits/withdrawals)
  connectClientWallet: () => Promise<void>;
  disconnectClientWallet: () => Promise<void>;
  depositToAppWallet: (amountSatoshis: number) => Promise<string>;
  withdrawFromAppWallet: (clientAddress: string, amountSatoshis: number) => Promise<string>;

  // Utility
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
    // App wallet state (from server)
    balance: 0,
    formattedBalance: '0.00000000',
    address: null,
    publicKey: null,
    isLoading: true,
    error: null,
    connectionStatus: 'disconnected',

    // Client wallet state
    clientWallet: null,
    clientConnected: false,
    clientAuthenticated: false,
  });

  const updateState = (updates: Partial<BSVWalletState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  /**
   * Fetch app wallet balance from the server API
   */
  const refreshBalance = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/wallet/balance');

      if (!response.ok) {
        throw new Error('Failed to fetch wallet balance');
      }

      const { success, data } = await response.json();

      // Validate response structure - expect WalletBalance object
      if (!success || !data || typeof data.totalSatoshis !== 'number') {
        console.error('[AppWallet] Invalid balance response:', { success, data });
        throw new Error('Invalid balance response');
      }

      const balanceSatoshis = data.totalSatoshis;
      const formattedBalance = data.formattedBalance || (balanceSatoshis / 100000000).toFixed(8);

      console.log(`[AppWallet] Balance: ${balanceSatoshis} satoshis (${formattedBalance} BSV)`);
      console.log(`[AppWallet] Available: ${data.availableSatoshis} sats, Pending: ${data.pendingSatoshis} sats`);

      updateState({
        balance: balanceSatoshis,
        formattedBalance,
        connectionStatus: 'connected'
      });

    } catch (error) {
      console.error('[AppWallet] Failed to fetch balance:', error);
      updateState({
        error: error instanceof Error ? error.message : 'Failed to fetch balance',
        connectionStatus: 'error'
      });
    }
  }, []);

  /**
   * Connect to user's BRC-100 compliant client wallet (for deposits/withdrawals)
   */
  const connectClientWallet = useCallback(async (): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null });

      // Try different substrates in order of preference
      const substrates = [
        { name: 'auto', config: 'auto' as const },
        { name: 'window.CWI', config: 'window.CWI' as const },
        { name: 'Cicada', config: 'Cicada' as const },
        { name: 'json-api', config: 'json-api' as const }
      ];

      let clientWallet = null;
      let lastError = null;
      const errors = [];

      for (const substrate of substrates) {
        try {
          console.log(`[ClientWallet] Trying substrate: ${substrate.name}`);
          clientWallet = new WalletClient(substrate.config, 'localhost');

          await clientWallet.connectToSubstrate();
          console.log(`[ClientWallet] Connected to substrate: ${substrate.name}`);

          const authResult = await clientWallet.isAuthenticated();
          const isAuthenticated = authResult.authenticated;

          if (isAuthenticated) {
            const { publicKey } = await clientWallet.getPublicKey({ identityKey: true });
            console.log(`[ClientWallet] Authenticated with pubkey: ${publicKey?.substring(0, 16)}...`);

            updateState({
              clientWallet,
              clientConnected: true,
              clientAuthenticated: true,
              isLoading: false,
            });

            console.log(`[ClientWallet] Successfully connected with substrate: ${substrate.name}`);
            return;
          } else {
            errors.push(`${substrate.name}: Not authenticated`);
          }
        } catch (error) {
          console.error(`[ClientWallet] Substrate ${substrate.name} failed:`, error instanceof Error ? error.message : error);
          errors.push(`${substrate.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          lastError = error;
          continue;
        }
      }

      throw new Error(`Failed to connect to any wallet substrate. Last error: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`);

    } catch (error) {
      console.error('[ClientWallet] Connection failed:', error);
      updateState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to connect client wallet',
      });
    }
  }, []);

  /**
   * Disconnect from client wallet
   */
  const disconnectClientWallet = useCallback(async (): Promise<void> => {
    try {
      updateState({
        clientWallet: null,
        clientConnected: false,
        clientAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('[ClientWallet] Disconnect failed:', error);
      updateState({
        error: error instanceof Error ? error.message : 'Failed to disconnect client wallet',
      });
    }
  }, []);

  /**
   * Deposit from client wallet to app wallet
   */
  const depositToAppWallet = useCallback(async (amountSatoshis: number): Promise<string> => {
    if (!state.clientWallet || !state.clientConnected) {
      throw new Error('Client wallet not connected');
    }

    try {
      // Get payment request from app wallet
      const response = await fetch('/api/wallet/payment-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountSatoshis,
          purpose: 'torrent_download',
          description: `Deposit ${amountSatoshis} satoshis to app wallet`
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create payment request');
      }

      const { data: paymentRequest } = await response.json();

      // Create transaction from client wallet
      const action = await state.clientWallet.createAction({
        description: `Deposit ${amountSatoshis} satoshis to BSV Torrent`,
        outputs: [{
          lockingScript: paymentRequest.paymentAddress,
          satoshis: amountSatoshis,
          outputDescription: 'Deposit to app wallet'
        }]
      });

      if (!action.txid) {
        throw new Error('Transaction failed - no txid');
      }

      console.log(`[ClientWallet] Deposited ${amountSatoshis} sats, txid: ${action.txid}`);

      // Refresh app wallet balance after deposit
      await refreshBalance();

      return action.txid;

    } catch (error) {
      console.error('[ClientWallet] Deposit failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Deposit failed';
      updateState({ error: errorMessage });
      throw new Error(errorMessage);
    }
  }, [state.clientWallet, state.clientConnected, refreshBalance]);

  /**
   * Withdraw from app wallet to client wallet address
   */
  const withdrawFromAppWallet = useCallback(async (clientAddress: string, amountSatoshis: number): Promise<string> => {
    try {
      const response = await fetch('/api/wallet/send-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientAddress: clientAddress,
          amountSatoshis,
          purpose: 'withdrawal',
          description: `Withdraw ${amountSatoshis} satoshis to ${clientAddress}`
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send withdrawal');
      }

      const { success, data } = await response.json();

      if (!success || !data.txid) {
        throw new Error('Withdrawal failed - no txid');
      }

      console.log(`[AppWallet] Withdrew ${amountSatoshis} sats to ${clientAddress}, txid: ${data.txid}`);

      // Refresh app wallet balance after withdrawal
      await refreshBalance();

      return data.txid;

    } catch (error) {
      console.error('[AppWallet] Withdrawal failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Withdrawal failed';
      updateState({ error: errorMessage });
      throw new Error(errorMessage);
    }
  }, [refreshBalance]);

  /**
   * Clear error state
   */
  const clearError = useCallback((): void => {
    updateState({ error: null });
  }, []);

  // Fetch app wallet balance on mount and every 30 seconds
  useEffect(() => {
    // Initial balance fetch
    refreshBalance();

    // Set up periodic refresh
    const interval = setInterval(refreshBalance, 30000);

    return () => clearInterval(interval);
  }, [refreshBalance]);

  // Fetch app wallet info (address, pubkey) on mount
  useEffect(() => {
    const fetchWalletInfo = async () => {
      try {
        const response = await fetch('/api/wallet/initialize', {
          method: 'POST'
        });

        if (response.ok) {
          const { success, data } = await response.json();
          if (success && data) {
            updateState({
              address: data.publicKey || null,
              publicKey: data.publicKey || null,
              isLoading: false
            });
          }
        }
      } catch (error) {
        console.error('[AppWallet] Failed to fetch wallet info:', error);
        updateState({ isLoading: false });
      }
    };

    fetchWalletInfo();
  }, []);

  const actions: BSVWalletActions = {
    refreshBalance,
    connectClientWallet,
    disconnectClientWallet,
    depositToAppWallet,
    withdrawFromAppWallet,
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

// Convenience hook for app wallet state
export function useAppWallet() {
  const { state, actions } = useBSVWallet();
  return {
    balance: state.balance,
    formattedBalance: state.formattedBalance,
    address: state.address,
    publicKey: state.publicKey,
    isLoading: state.isLoading,
    error: state.error,
    connectionStatus: state.connectionStatus,
    refreshBalance: actions.refreshBalance,
    clearError: actions.clearError,
  };
}

// Convenience hook for client wallet state (deposits/withdrawals)
export function useClientWallet() {
  const { state, actions } = useBSVWallet();
  return {
    clientConnected: state.clientConnected,
    clientAuthenticated: state.clientAuthenticated,
    connectClientWallet: actions.connectClientWallet,
    disconnectClientWallet: actions.disconnectClientWallet,
    depositToAppWallet: actions.depositToAppWallet,
    withdrawFromAppWallet: actions.withdrawFromAppWallet,
  };
}