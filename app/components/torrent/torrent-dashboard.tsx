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
  Trash2
} from 'lucide-react';
import { TorrentList } from './torrent-list';
import { UploadTorrent } from './upload-torrent';
import { PaymentStatus } from '../payment/payment-status';
import { WalletConnection } from '../wallet/wallet-connection';

interface TorrentDashboardProps {
  className?: string;
}

export function TorrentDashboard({ className }: TorrentDashboardProps) {
  const [activeTorrents, setActiveTorrents] = useState([]);
  const [walletConnected, setWalletConnected] = useState(false);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Mock data for demonstration
  const dashboardStats = {
    activeDownloads: 3,
    activeUploads: 2,
    totalEarned: totalEarnings,
    totalSpent: totalSpent,
    networkSpeed: '1.2 MB/s',
    peersConnected: 15
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
          <WalletConnection
            connected={walletConnected}
            onConnectionChange={setWalletConnected}
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
              Earning {totalEarnings} sats
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
                  torrents={activeTorrents}
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
            torrents={activeTorrents}
            type="downloads"
            showPayments={true}
          />
        </TabsContent>

        <TabsContent value="uploads" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold">Uploads & Seeding</h2>
            <UploadTorrent
              onUpload={(file) => console.log('Upload:', file)}
              connected={walletConnected}
            />
          </div>
          <TorrentList
            torrents={activeTorrents}
            type="uploads"
            showEarnings={true}
          />
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold">Payment History</h2>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-green-600">
                +{totalEarnings} sats earned
              </Badge>
              <Badge variant="outline" className="text-blue-600">
                -{totalSpent} sats spent
              </Badge>
            </div>
          </div>
          <PaymentStatus
            earnings={totalEarnings}
            spent={totalSpent}
            connected={walletConnected}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}