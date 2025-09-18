import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import type { PaymentEvent, PaymentBatch } from '../lib/bsv/payment-event-batcher';

export interface TorrentPeer {
  id: string;
  torrentId: string;
  address: string;
  port: number;
  discoveredAt: number;
  overlay: boolean; // Discovered via BSV overlay
}

export interface TorrentFile {
  infoHash: string;
  name: string;
  size: number;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  peers: TorrentPeer[];
  status: 'downloading' | 'seeding' | 'paused' | 'completed' | 'error';
  totalPaid: number;
  totalEarned: number;
  pieceCount: number;
  pieceSize: number;
  dateAdded: Date;
  overlayStats: {
    peersDiscovered: number;
    lastDiscovery: number;
  };
  paymentStats: {
    totalSent: number;
    totalReceived: number;
    ratePerPiece: number;
    avgPaymentTime: number;
  };
}

export interface WalletState {
  isConnected: boolean;
  balance: number;
  formattedBalance: string;
  address: string | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  isLoading: boolean;
  error: string | null;
}

export interface PaymentMetrics {
  totalPaid: number;
  totalEarned: number;
  activeChannels: number;
  pendingPayments: number;
  dailyVolume: number;
  recentPayments: PaymentEvent[];
  paymentRate: number; // payments per minute
}

export interface OverlayHealth {
  connections: Record<string, boolean>;
  queueDepth: number;
  lastUpdate: number;
  isHealthy: boolean;
}

export interface NetworkStats {
  totalDownloadSpeed: number;
  totalUploadSpeed: number;
  peersConnected: number;
  activeTorrents: number;
  networkLatency: number;
}

export interface AppError {
  id: string;
  type: 'bsv_overlay' | 'torrent' | 'wallet' | 'payment' | 'network';
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  context?: any;
  resolved?: boolean;
}

interface BSVTorrentState {
  // Core data
  torrents: Map<string, TorrentFile>;
  wallet: WalletState;
  paymentMetrics: PaymentMetrics;
  overlayHealth: OverlayHealth;
  networkStats: NetworkStats;
  errors: AppError[];

  // Connection state
  connectionStatus: 'connected' | 'disconnected' | 'offline' | 'reconnecting';
  isInitialized: boolean;

  // UI state
  selectedTorrent: string | null;
  activeTab: 'dashboard' | 'downloads' | 'uploads' | 'payments';
}

interface BSVTorrentActions {
  // Torrent actions
  addTorrent: (torrent: TorrentFile) => void;
  updateTorrent: (infoHash: string, updates: Partial<TorrentFile>) => void;
  removeTorrent: (infoHash: string) => void;
  setTorrentProgress: (infoHash: string, progress: number) => void;
  setTorrentStatus: (infoHash: string, status: TorrentFile['status']) => void;

  // Peer management
  addPeersBatch: (data: { torrentId: string; peers: TorrentPeer[]; timestamp: number }) => void;
  updatePeerCount: (infoHash: string, peerCount: number) => void;

  // Payment actions
  addPaymentsBatch: (batch: PaymentBatch) => void;
  addSinglePayment: (payment: PaymentEvent) => void;
  updatePaymentMetrics: (metrics: Partial<PaymentMetrics>) => void;

  // Wallet actions
  updateWallet: (updates: Partial<WalletState>) => void;
  setWalletBalance: (balance: number) => void;
  setWalletConnectionStatus: (status: WalletState['connectionStatus']) => void;

  // Connection and health
  setConnectionStatus: (status: BSVTorrentState['connectionStatus']) => void;
  updateOverlayHealth: (health: Partial<OverlayHealth>) => void;
  updateNetworkStats: (stats: Partial<NetworkStats>) => void;

  // Error handling
  addError: (error: Omit<AppError, 'id' | 'timestamp'>) => void;
  resolveError: (errorId: string) => void;
  clearErrors: () => void;
  clearErrorsByType: (type: AppError['type']) => void;

  // State management
  syncFullState: (state: any) => void;
  setInitialized: (initialized: boolean) => void;
  getActiveTorrentIds: () => string[];

  // UI actions
  setSelectedTorrent: (infoHash: string | null) => void;
  setActiveTab: (tab: BSVTorrentState['activeTab']) => void;

  // Computed getters
  getTorrentByHash: (infoHash: string) => TorrentFile | undefined;
  getActiveTorrents: () => TorrentFile[];
  getCompletedTorrents: () => TorrentFile[];
  getSeedingTorrents: () => TorrentFile[];
  getDownloadingTorrents: () => TorrentFile[];
  getTotalStats: () => {
    totalDownloaded: number;
    totalUploaded: number;
    totalEarnings: number;
    totalSpent: number;
  };
}

export const useBSVTorrentStore = create<BSVTorrentState & { actions: BSVTorrentActions }>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    torrents: new Map(),
    wallet: {
      isConnected: false,
      balance: 0,
      formattedBalance: '0.00000000',
      address: null,
      connectionStatus: 'disconnected',
      isLoading: false,
      error: null,
    },
    paymentMetrics: {
      totalPaid: 0,
      totalEarned: 0,
      activeChannels: 0,
      pendingPayments: 0,
      dailyVolume: 0,
      recentPayments: [],
      paymentRate: 0,
    },
    overlayHealth: {
      connections: {},
      queueDepth: 0,
      lastUpdate: 0,
      isHealthy: false,
    },
    networkStats: {
      totalDownloadSpeed: 0,
      totalUploadSpeed: 0,
      peersConnected: 0,
      activeTorrents: 0,
      networkLatency: 0,
    },
    errors: [],
    connectionStatus: 'disconnected',
    isInitialized: false,
    selectedTorrent: null,
    activeTab: 'dashboard',

    actions: {
      // Torrent actions
      addTorrent: (torrent) => set(state => ({
        torrents: new Map(state.torrents).set(torrent.infoHash, torrent)
      })),

      updateTorrent: (infoHash, updates) => set(state => {
        const newTorrents = new Map(state.torrents);
        const existing = newTorrents.get(infoHash);
        if (existing) {
          newTorrents.set(infoHash, { ...existing, ...updates });
        }
        return { torrents: newTorrents };
      }),

      removeTorrent: (infoHash) => set(state => {
        const newTorrents = new Map(state.torrents);
        newTorrents.delete(infoHash);
        return { torrents: newTorrents };
      }),

      setTorrentProgress: (infoHash, progress) => set(state => {
        const newTorrents = new Map(state.torrents);
        const torrent = newTorrents.get(infoHash);
        if (torrent) {
          newTorrents.set(infoHash, { ...torrent, progress });
        }
        return { torrents: newTorrents };
      }),

      setTorrentStatus: (infoHash, status) => set(state => {
        const newTorrents = new Map(state.torrents);
        const torrent = newTorrents.get(infoHash);
        if (torrent) {
          newTorrents.set(infoHash, { ...torrent, status });
        }
        return { torrents: newTorrents };
      }),

      // Peer management
      addPeersBatch: (data) => set(state => {
        const newTorrents = new Map(state.torrents);
        const torrent = newTorrents.get(data.torrentId);

        if (torrent) {
          // Merge new peers, avoiding duplicates
          const existingPeerIds = new Set(torrent.peers.map(p => p.id));
          const newPeers = data.peers.filter(peer => !existingPeerIds.has(peer.id));

          newTorrents.set(data.torrentId, {
            ...torrent,
            peers: [...torrent.peers, ...newPeers],
            overlayStats: {
              ...torrent.overlayStats,
              peersDiscovered: torrent.overlayStats.peersDiscovered + newPeers.length,
              lastDiscovery: data.timestamp
            }
          });
        }

        return { torrents: newTorrents };
      }),

      updatePeerCount: (infoHash, peerCount) => set(state => {
        const newNetworkStats = { ...state.networkStats, peersConnected: peerCount };
        return { networkStats: newNetworkStats };
      }),

      // Payment actions
      addPaymentsBatch: (batch) => set(state => {
        const newTorrents = new Map(state.torrents);

        // Group payments by torrent
        const paymentsByTorrent = batch.events.reduce((acc, payment) => {
          if (!acc[payment.torrentId]) acc[payment.torrentId] = [];
          acc[payment.torrentId].push(payment);
          return acc;
        }, {} as Record<string, PaymentEvent[]>);

        // Update each affected torrent
        Object.entries(paymentsByTorrent).forEach(([torrentId, payments]) => {
          const torrent = newTorrents.get(torrentId);
          if (torrent) {
            const sentAmount = payments.filter(p => p.direction === 'sent')
              .reduce((sum, p) => sum + p.amount, 0);
            const receivedAmount = payments.filter(p => p.direction === 'received')
              .reduce((sum, p) => sum + p.amount, 0);

            newTorrents.set(torrentId, {
              ...torrent,
              totalPaid: torrent.totalPaid + sentAmount,
              totalEarned: torrent.totalEarned + receivedAmount,
              paymentStats: {
                ...torrent.paymentStats,
                totalSent: torrent.paymentStats.totalSent + sentAmount,
                totalReceived: torrent.paymentStats.totalReceived + receivedAmount
              }
            });
          }
        });

        // Update global payment metrics
        const newPaymentMetrics = {
          ...state.paymentMetrics,
          totalPaid: state.paymentMetrics.totalPaid + batch.metrics.totalAmount,
          totalEarned: state.paymentMetrics.totalEarned + batch.metrics.totalAmount,
          recentPayments: [...batch.events, ...state.paymentMetrics.recentPayments].slice(0, 100),
          paymentRate: batch.metrics.throughput
        };

        return { torrents: newTorrents, paymentMetrics: newPaymentMetrics };
      }),

      addSinglePayment: (payment) => set(state => {
        const newRecentPayments = [payment, ...state.paymentMetrics.recentPayments].slice(0, 100);
        return {
          paymentMetrics: {
            ...state.paymentMetrics,
            recentPayments: newRecentPayments
          }
        };
      }),

      updatePaymentMetrics: (metrics) => set(state => ({
        paymentMetrics: { ...state.paymentMetrics, ...metrics }
      })),

      // Wallet actions
      updateWallet: (updates) => set(state => ({
        wallet: { ...state.wallet, ...updates }
      })),

      setWalletBalance: (balance) => set(state => ({
        wallet: {
          ...state.wallet,
          balance,
          formattedBalance: (balance / 100000000).toFixed(8)
        }
      })),

      setWalletConnectionStatus: (connectionStatus) => set(state => ({
        wallet: { ...state.wallet, connectionStatus }
      })),

      // Connection and health
      setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

      updateOverlayHealth: (health) => set(state => {
        const updatedHealth = {
          ...state.overlayHealth,
          ...health
        };

        // Calculate isHealthy based on all connections
        const connections = health.connections || state.overlayHealth.connections;
        updatedHealth.isHealthy = Object.values(connections).every(status => status === true);

        return { overlayHealth: updatedHealth };
      }),

      updateNetworkStats: (stats) => set(state => ({
        networkStats: { ...state.networkStats, ...stats }
      })),

      // Error handling
      addError: (error) => set(state => ({
        errors: [{
          ...error,
          id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
          timestamp: Date.now()
        }, ...state.errors].slice(0, 50) // Keep last 50 errors
      })),

      resolveError: (errorId) => set(state => ({
        errors: state.errors.map(error =>
          error.id === errorId ? { ...error, resolved: true } : error
        )
      })),

      clearErrors: () => set({ errors: [] }),

      clearErrorsByType: (type) => set(state => ({
        errors: state.errors.filter(error => error.type !== type)
      })),

      // State management
      syncFullState: (syncState) => set(state => {
        const newTorrents = new Map();

        Object.entries(syncState.torrents || {}).forEach(([id, torrent]) => {
          newTorrents.set(id, torrent as TorrentFile);
        });

        return {
          torrents: newTorrents,
          overlayHealth: syncState.overlayHealth || state.overlayHealth,
          paymentMetrics: syncState.paymentMetrics || state.paymentMetrics
        };
      }),

      setInitialized: (isInitialized) => set({ isInitialized }),

      getActiveTorrentIds: () => {
        const state = get();
        return Array.from(state.torrents.keys()).filter(id => {
          const torrent = state.torrents.get(id);
          return torrent && torrent.status !== 'completed' && torrent.status !== 'error';
        });
      },

      // UI actions
      setSelectedTorrent: (selectedTorrent) => set({ selectedTorrent }),
      setActiveTab: (activeTab) => set({ activeTab }),

      // Computed getters
      getTorrentByHash: (infoHash) => get().torrents.get(infoHash),

      getActiveTorrents: () => {
        const state = get();
        const torrents = Array.from(state.torrents.values());
        return torrents.filter(t => t.status !== 'completed' && t.status !== 'error');
      },

      getCompletedTorrents: () => {
        const state = get();
        const torrents = Array.from(state.torrents.values());
        return torrents.filter(t => t.status === 'completed');
      },

      getSeedingTorrents: () => {
        const state = get();
        const torrents = Array.from(state.torrents.values());
        return torrents.filter(t => t.status === 'seeding');
      },

      getDownloadingTorrents: () => {
        const state = get();
        const torrents = Array.from(state.torrents.values());
        return torrents.filter(t => t.status === 'downloading');
      },

      getTotalStats: () => {
        const state = get();
        const torrents = Array.from(state.torrents.values());
        return torrents.reduce((acc, torrent) => ({
          totalDownloaded: acc.totalDownloaded + (torrent.size * torrent.progress),
          totalUploaded: acc.totalUploaded + torrent.totalEarned / 17 * 16384, // Estimate upload from earnings
          totalEarnings: acc.totalEarnings + torrent.totalEarned,
          totalSpent: acc.totalSpent + torrent.totalPaid
        }), { totalDownloaded: 0, totalUploaded: 0, totalEarnings: 0, totalSpent: 0 });
      }
    }
  }))
);

// Selector hooks for optimized component updates
export const useConnectionStatus = () =>
  useBSVTorrentStore(state => state.connectionStatus);

export const useWalletState = () =>
  useBSVTorrentStore(state => state.wallet);

export const useTorrentPeers = (torrentId: string) => {
  const torrent = useBSVTorrentStore(state => state.torrents.get(torrentId));

  return useMemo(() => {
    return torrent?.peers || [];
  }, [torrent]);
};

export const useTorrentPayments = (torrentId: string) => {
  const recentPayments = useBSVTorrentStore(state => state.paymentMetrics.recentPayments);

  return useMemo(() => {
    return recentPayments.filter(p => p.torrentId === torrentId);
  }, [recentPayments, torrentId]);
};

export const useOverlayHealth = () =>
  useBSVTorrentStore(state => state.overlayHealth);

export const usePaymentMetrics = () =>
  useBSVTorrentStore(state => state.paymentMetrics);

export const useNetworkStats = () =>
  useBSVTorrentStore(state => state.networkStats);

export const useErrors = () => {
  const errors = useBSVTorrentStore(state => state.errors);

  return useMemo(() => {
    return errors.filter(e => !e.resolved);
  }, [errors]);
};

export const useTorrents = () => {
  const torrents = useBSVTorrentStore(state => state.torrents);

  return useMemo(() => {
    return Array.from(torrents.values());
  }, [torrents]);
};

export const useActiveTorrents = () => {
  const torrents = useBSVTorrentStore(state => state.torrents);

  return useMemo(() => {
    return Array.from(torrents.values()).filter(t =>
      t.status === 'downloading' || t.status === 'seeding'
    );
  }, [torrents]);
};

export const useTotalStats = () => {
  const totalEarned = useBSVTorrentStore(state => state.paymentMetrics.totalEarned);
  const totalPaid = useBSVTorrentStore(state => state.paymentMetrics.totalPaid);
  const torrents = useBSVTorrentStore(state => state.torrents);

  return useMemo(() => {
    const torrentValues = Array.from(torrents.values());
    return {
      totalDownloaded: torrentValues.reduce((sum, t) => sum + (t.size * t.progress), 0),
      totalUploaded: torrentValues.reduce((sum, t) => sum + (t.totalEarned / 17 * 16384), 0), // Estimate upload from earnings
      totalEarnings: totalEarned,
      totalSpent: totalPaid,
    };
  }, [totalEarned, totalPaid, torrents]);
};