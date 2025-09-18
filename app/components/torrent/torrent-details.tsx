'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import {
  Download,
  Upload,
  Pause,
  Play,
  Trash2,
  Copy,
  ExternalLink,
  Users,
  Clock,
  HardDrive,
  Wifi,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  FileText,
  Hash
} from 'lucide-react';

interface TorrentDetailsProps {
  infoHash: string;
  onClose: () => void;
  className?: string;
}

interface DetailedTorrentInfo {
  infoHash: string;
  name: string;
  size: number;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  downloaded: number;
  uploaded: number;
  peers: number;
  seeders: number;
  leechers: number;
  status: 'downloading' | 'seeding' | 'paused' | 'completed' | 'error';
  timeRemaining?: number;
  timeElapsed: number;
  files: TorrentFile[];
  trackers: TorrentTracker[];
  payments: TorrentPayment[];
  totalEarned?: number;
  totalSpent?: number;
  dateAdded: Date;
  shareRatio: number;
  availability: number;
}

interface TorrentFile {
  name: string;
  size: number;
  progress: number;
  priority: 'skip' | 'low' | 'normal' | 'high';
  selected: boolean;
}

interface TorrentTracker {
  url: string;
  status: 'working' | 'error' | 'updating';
  peers: number;
  lastUpdate: Date;
}

interface TorrentPayment {
  txid: string;
  type: 'payment' | 'earning';
  amount: number;
  peerId: string;
  fileIndex?: number;
  chunkIndex: number;
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'failed';
}

export function TorrentDetails({ infoHash, onClose, className }: TorrentDetailsProps) {
  const [torrent, setTorrent] = useState<DetailedTorrentInfo | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'files' | 'trackers' | 'payments'>('overview');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading torrent details
    const loadTorrentDetails = async () => {
      setIsLoading(true);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Mock detailed torrent data
      const mockTorrent: DetailedTorrentInfo = {
        infoHash,
        name: 'Ubuntu 22.04 Desktop amd64.iso',
        size: 4700000000, // ~4.7GB
        progress: 73.5,
        downloadSpeed: 1024 * 1024 * 2.3, // 2.3 MB/s
        uploadSpeed: 1024 * 512, // 512 KB/s
        downloaded: 3455000000,
        uploaded: 890000000,
        peers: 23,
        seeders: 45,
        leechers: 18,
        status: 'downloading',
        timeRemaining: 892, // seconds
        timeElapsed: 2847,
        shareRatio: 0.26,
        availability: 4.2,
        totalSpent: 425,
        dateAdded: new Date(Date.now() - 2847000),
        files: [
          {
            name: 'ubuntu-22.04-desktop-amd64.iso',
            size: 4700000000,
            progress: 73.5,
            priority: 'normal',
            selected: true
          }
        ],
        trackers: [
          {
            url: 'bsv-overlay://peer-discovery',
            status: 'working',
            peers: 23,
            lastUpdate: new Date(Date.now() - 30000)
          },
          {
            url: 'udp://tracker.example.com:1337',
            status: 'working',
            peers: 12,
            lastUpdate: new Date(Date.now() - 45000)
          }
        ],
        payments: [
          {
            txid: '1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890',
            type: 'payment',
            amount: 17,
            peerId: 'peer_abc123',
            chunkIndex: 2154,
            timestamp: new Date(Date.now() - 120000),
            status: 'confirmed'
          },
          {
            txid: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            type: 'payment',
            amount: 17,
            peerId: 'peer_xyz789',
            chunkIndex: 2155,
            timestamp: new Date(Date.now() - 90000),
            status: 'confirmed'
          }
        ]
      };

      setTorrent(mockTorrent);
      setIsLoading(false);
    };

    loadTorrentDetails();
  }, [infoHash]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return `${formatBytes(bytesPerSecond)}/s`;
  };

  const formatTime = (seconds: number): string => {
    if (!seconds || seconds === Infinity) return '∞';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  const formatTxid = (txid: string): string => {
    return `${txid.slice(0, 8)}...${txid.slice(-8)}`;
  };

  const handleTorrentAction = (action: 'pause' | 'resume' | 'delete') => {
    console.log(`Action ${action} on torrent:`, infoHash);
    // TODO: Integrate with TorrentClient
  };

  const copyInfoHash = async () => {
    await navigator.clipboard.writeText(infoHash);
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p>Loading torrent details...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!torrent) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="mx-auto h-8 w-8 mb-2 opacity-50" />
            <p>Torrent not found</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl break-words">{torrent.name}</CardTitle>
              <CardDescription className="flex items-center gap-4 mt-2">
                <span>Size: {formatBytes(torrent.size)}</span>
                <span>Ratio: {torrent.shareRatio.toFixed(2)}</span>
                <span>Added: {torrent.dateAdded.toLocaleDateString()}</span>
              </CardDescription>
            </div>

            <div className="flex items-center gap-2 ml-4">
              {torrent.status === 'paused' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTorrentAction('resume')}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Resume
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTorrentAction('pause')}
                >
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTorrentAction('delete')}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>

              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Progress Bar */}
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span>{torrent.progress.toFixed(1)}% complete</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTime(torrent.timeRemaining || 0)} remaining
              </span>
            </div>
            <Progress value={torrent.progress} className="h-3" />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-sm font-medium">{formatSpeed(torrent.downloadSpeed)}</p>
                <p className="text-xs text-muted-foreground">Download</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-sm font-medium">{formatSpeed(torrent.uploadSpeed)}</p>
                <p className="text-xs text-muted-foreground">Upload</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{torrent.peers} connected</p>
                <p className="text-xs text-muted-foreground">S:{torrent.seeders} L:{torrent.leechers}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{torrent.availability.toFixed(1)}x</p>
                <p className="text-xs text-muted-foreground">Availability</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'overview' | 'files' | 'trackers' | 'payments')} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="trackers">Trackers</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Transfer Info */}
            <Card>
              <CardHeader>
                <CardTitle>Transfer Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Downloaded:</span>
                  <span className="font-mono">{formatBytes(torrent.downloaded)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uploaded:</span>
                  <span className="font-mono">{formatBytes(torrent.uploaded)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Share Ratio:</span>
                  <span className="font-mono">{torrent.shareRatio.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time Active:</span>
                  <span className="font-mono">{formatTime(torrent.timeElapsed)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="secondary" className="capitalize">
                    {torrent.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Torrent Info */}
            <Card>
              <CardHeader>
                <CardTitle>Torrent Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">Info Hash:</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 text-xs bg-muted p-2 rounded font-mono break-all">
                      {torrent.infoHash}
                    </code>
                    <Button variant="outline" size="sm" onClick={copyInfoHash}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Size:</span>
                  <span className="font-mono">{formatBytes(torrent.size)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Files:</span>
                  <span>{torrent.files.length}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pieces:</span>
                  <span>~{Math.ceil(torrent.size / (16 * 1024))}</span>
                </div>

                {torrent.totalSpent !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">BSV Spent:</span>
                    <span className="text-blue-600 font-medium">
                      {torrent.totalSpent.toLocaleString()} sats
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="files" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Files</CardTitle>
              <CardDescription>
                Manage individual file priorities and selection
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {torrent.files.map((file, index) => (
                  <div key={index} className="flex items-center gap-4 p-3 border rounded-lg">
                    <input
                      type="checkbox"
                      checked={file.selected}
                      onChange={() => {
                        // TODO: Handle file selection
                      }}
                      className="checkbox"
                    />

                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{formatBytes(file.size)}</span>
                        <span>{file.progress.toFixed(1)}% complete</span>
                      </div>
                      <Progress value={file.progress} className="h-1 mt-2" />
                    </div>

                    <select
                      value={file.priority}
                      onChange={(e) => {
                        // TODO: Handle priority change
                      }}
                      className="px-2 py-1 border rounded text-sm"
                    >
                      <option value="skip">Skip</option>
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trackers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Trackers & Peer Discovery</CardTitle>
              <CardDescription>
                BSV overlay services and traditional trackers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {torrent.trackers.map((tracker, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        tracker.status === 'working' ? 'bg-green-500' :
                        tracker.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                      }`} />
                      <div>
                        <p className="font-mono text-sm">{tracker.url}</p>
                        <p className="text-xs text-muted-foreground">
                          Last update: {tracker.lastUpdate.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm">
                        <p className="font-medium">{tracker.peers} peers</p>
                        <p className="text-muted-foreground capitalize">{tracker.status}</p>
                      </div>
                      <Button variant="outline" size="sm">
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>BSV Payment History</CardTitle>
              <CardDescription>
                Micropayments for downloaded chunks (17 sats per 16KB)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {torrent.payments.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <FileText className="mx-auto h-8 w-8 mb-2 opacity-50" />
                  <p>No payments yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {torrent.payments.map((payment) => (
                    <div key={payment.txid} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
                          <Download className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            Chunk #{payment.chunkIndex}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatTxid(payment.txid)}</span>
                            <Button variant="ghost" size="sm" className="h-3 w-3 p-0">
                              <ExternalLink className="h-2 w-2" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-medium text-blue-600">
                          -{payment.amount} sats
                        </p>
                        <div className="flex items-center gap-1">
                          {payment.status === 'confirmed' ? (
                            <CheckCircle className="h-3 w-3 text-green-600" />
                          ) : (
                            <Clock className="h-3 w-3 text-yellow-600" />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {payment.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}