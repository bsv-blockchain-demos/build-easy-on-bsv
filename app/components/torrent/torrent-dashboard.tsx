'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Download,
  Upload,
  Wallet,
  Settings,
  Activity,
  Plus,
  Pause,
  Play,
  Trash2,
  Wifi,
  WifiOff
} from 'lucide-react';
import { TorrentList } from './torrent-list';
import { UploadTorrent } from './upload-torrent';
import { PaymentStatus } from '../payment/payment-status';
import { WalletConnection } from '../wallet/wallet-connection';
import { useBSVWallet } from '../../contexts/bsv-wallet-context';
import {
  useBSVTorrentStore,
  useWalletState,
  usePaymentMetrics,
  useNetworkStats,
  useTorrents,
  useActiveTorrents,
  useTotalStats,
  useConnectionStatus
} from '../../stores/bsv-torrent-store';
import { getWebSocketClient } from '../../lib/websocket-client';

interface TorrentDashboardProps {
  className?: string;
}

export function TorrentDashboard({ className }: TorrentDashboardProps) {
  // BSV Wallet integration
  const { state: walletState } = useBSVWallet();

  // Zustand store integration
  const connectionStatus = useConnectionStatus();
  const paymentMetrics = usePaymentMetrics();
  const networkStats = useNetworkStats();
  const torrents = useTorrents();
  const activeTorrents = useActiveTorrents();
  const totalStats = useTotalStats();

  // Local UI state
  const [activeTab, setActiveTab] = useState('dashboard');
  const [wsClient] = useState(() => getWebSocketClient());

  // Initialize WebSocket subscriptions
  useEffect(() => {
    wsClient.subscribeToWallet();
    wsClient.subscribeToPayments();

    return () => {
      wsClient.unsubscribeFromWallet();
      wsClient.unsubscribeFromPayments();
    };
  }, [wsClient]);

  // Calculate real dashboard stats
  const downloadingTorrents = torrents.filter(t => t.status === 'downloading');
  const seedingTorrents = torrents.filter(t => t.status === 'seeding');

  const dashboardStats = {
    activeDownloads: downloadingTorrents.length,
    activeUploads: seedingTorrents.length,
    totalEarned: totalStats.totalEarnings,
    totalSpent: totalStats.totalSpent,
    networkSpeed: `${(networkStats.totalDownloadSpeed / 1024 / 1024).toFixed(1)} MB/s`,
    peersConnected: networkStats.peersConnected
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getConnectionStatusBadge = () => {
    const isWalletConnected = walletState.isConnected;
    const isWebSocketConnected = wsClient.isConnected();

    if (isWalletConnected && isWebSocketConnected) {
      return <Badge variant="secondary" className="text-green-600"><Wifi className="w-3 h-3 mr-1" />Connected</Badge>;
    } else if (isWalletConnected || isWebSocketConnected) {
      return <Badge variant="outline" className="text-yellow-600"><Wifi className="w-3 h-3 mr-1" />Partial</Badge>;
    } else {
      return <Badge variant="destructive"><WifiOff className="w-3 h-3 mr-1" />Disconnected</Badge>;
    }
  };

  // Convert TorrentFile to TorrentInfo for TorrentList component compatibility
  const convertToTorrentInfo = (torrentFiles: any[]) => {
    return torrentFiles.map(torrent => ({
      infoHash: torrent.infoHash,
      name: torrent.name,
      size: torrent.size,
      progress: torrent.progress,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      peers: torrent.peers?.length || 0,
      seeders: Math.floor(torrent.peers?.filter((p: any) => p.overlay).length * 0.7) || 0, // Estimate
      leechers: Math.floor(torrent.peers?.filter((p: any) => !p.overlay).length * 0.3) || 0, // Estimate
      status: torrent.status,
      timeRemaining: torrent.status === 'downloading' && torrent.downloadSpeed > 0
        ? ((torrent.size * (1 - torrent.progress)) / torrent.downloadSpeed)
        : undefined,
      totalEarned: torrent.totalEarned,
      totalSpent: torrent.totalPaid,
      dateAdded: torrent.dateAdded
    }));
  };

  return (
    <div className={`w-full max-w-6xl mx-auto p-6 space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">BSV Torrent</h1>
          <p className="text-muted-foreground">
            Decentralized file sharing powered by Bitcoin SV micropayments
          </p>
        </div>
        <div className="flex items-center gap-4">
          {getConnectionStatusBadge()}
          <div className="text-right">
            <div className="text-sm font-medium">
              {walletState.formattedBalance} BSV
            </div>
            <div className="text-xs text-muted-foreground">
              {walletState.address ? `${walletState.address.slice(0, 8)}...` : 'No wallet'}
            </div>
          </div>
          <WalletConnection
            connected={walletState.isConnected}
            onConnectionChange={() => {}} // This will be handled by the context
          />
          <Button variant="outline" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Downloads</CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.activeDownloads}</div>
            <p className="text-xs text-muted-foreground">
              Downloading at {dashboardStats.networkSpeed}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Uploads</CardTitle>
            <Upload className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.activeUploads}</div>
            <p className="text-xs text-muted-foreground">
              Earning {dashboardStats.totalEarned.toLocaleString()} sats
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
            <Wallet className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {dashboardStats.totalEarned.toLocaleString()} sats
            </div>
            <p className="text-xs text-muted-foreground">
              From {dashboardStats.activeUploads} files seeding
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <Wallet className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {dashboardStats.totalSpent.toLocaleString()} sats
            </div>
            <p className="text-xs text-muted-foreground">
              On {dashboardStats.activeDownloads} downloads
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard">
            <Activity className="w-4 h-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="downloads">
            <Download className="w-4 h-4 mr-2" />
            Downloads
          </TabsTrigger>
          <TabsTrigger value="uploads">
            <Upload className="w-4 h-4 mr-2" />
            Uploads
          </TabsTrigger>
          <TabsTrigger value="payments">
            <Wallet className="w-4 h-4 mr-2" />
            Payments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  Latest downloads and uploads
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TorrentList
                  torrents={convertToTorrentInfo(activeTorrents)}
                  type="recent"
                  maxItems={5}
                />
              </CardContent>
            </Card>

            {/* Network Status */}
            <Card>
              <CardHeader>
                <CardTitle>Network Status</CardTitle>
                <CardDescription>
                  Connection and performance metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span>Peers Connected</span>
                  <Badge variant="secondary">{dashboardStats.peersConnected}</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Network Speed</span>
                  <span className="font-mono">{dashboardStats.networkSpeed}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Upload Bandwidth</span>
                    <span>75%</span>
                  </div>
                  <Progress value={75} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Download Bandwidth</span>
                    <span>60%</span>
                  </div>
                  <Progress value={60} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="downloads" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold">Downloads</h2>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Torrent
            </Button>
          </div>
          <TorrentList
            torrents={convertToTorrentInfo(downloadingTorrents)}
            type="downloads"
            showPayments={true}
          />
        </TabsContent>

        <TabsContent value="uploads" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold">Uploads & Seeding</h2>
            <UploadTorrent
              onUpload={async (file) => console.log('Upload:', file)}
              connected={walletState.isConnected}
            />
          </div>
          <TorrentList
            torrents={convertToTorrentInfo(seedingTorrents)}
            type="uploads"
            showEarnings={true}
          />
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold">Payment History</h2>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-green-600">
                +{dashboardStats.totalEarned.toLocaleString()} sats earned
              </Badge>
              <Badge variant="outline" className="text-blue-600">
                -{dashboardStats.totalSpent.toLocaleString()} sats spent
              </Badge>
            </div>
          </div>
          <PaymentStatus
            earnings={dashboardStats.totalEarned}
            spent={dashboardStats.totalSpent}
            connected={walletState.isConnected}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}