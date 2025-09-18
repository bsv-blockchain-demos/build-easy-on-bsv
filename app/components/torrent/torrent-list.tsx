'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Download,
  Upload,
  Pause,
  Play,
  Trash2,
  Eye,
  Clock,
  Users,
  HardDrive
} from 'lucide-react';

interface TorrentInfo {
  infoHash: string;
  name: string;
  size: number;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  peers: number;
  seeders: number;
  leechers: number;
  status: 'downloading' | 'seeding' | 'paused' | 'completed' | 'error';
  timeRemaining?: number;
  totalEarned?: number;
  totalSpent?: number;
  dateAdded: Date;
}

interface TorrentListProps {
  torrents: TorrentInfo[];
  type: 'recent' | 'downloads' | 'uploads';
  maxItems?: number;
  showPayments?: boolean;
  showEarnings?: boolean;
}

export function TorrentList({
  torrents,
  type,
  maxItems,
  showPayments = false,
  showEarnings = false
}: TorrentListProps) {
  const [selectedTorrent, setSelectedTorrent] = useState<string | null>(null);

  const displayTorrents = maxItems ? torrents.slice(0, maxItems) : torrents;

  const getStatusColor = (status: TorrentInfo['status']) => {
    switch (status) {
      case 'downloading':
        return 'bg-blue-500';
      case 'seeding':
        return 'bg-green-500';
      case 'completed':
        return 'bg-green-600';
      case 'paused':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusBadge = (status: TorrentInfo['status']) => {
    const colors = {
      downloading: 'default',
      seeding: 'secondary',
      completed: 'secondary',
      paused: 'outline',
      error: 'destructive'
    } as const;

    return (
      <Badge variant={colors[status]} className="capitalize">
        {status}
      </Badge>
    );
  };

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

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  const handleTorrentAction = (infoHash: string, action: 'pause' | 'resume' | 'delete' | 'details') => {
    console.log(`Action ${action} on torrent:`, infoHash);
    // TODO: Integrate with TorrentClient
  };

  if (displayTorrents.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="text-center text-muted-foreground">
            <HardDrive className="mx-auto h-8 w-8 mb-2 opacity-50" />
            <p>No torrents {type === 'recent' ? 'recently active' : type}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {displayTorrents.map((torrent) => (
        <Card key={torrent.infoHash} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate text-sm">{torrent.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  {getStatusBadge(torrent.status)}
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(torrent.size)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 ml-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleTorrentAction(torrent.infoHash, 'details')}
                  className="h-8 w-8"
                >
                  <Eye className="h-4 w-4" />
                </Button>

                {torrent.status === 'paused' ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleTorrentAction(torrent.infoHash, 'resume')}
                    className="h-8 w-8"
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleTorrentAction(torrent.infoHash, 'pause')}
                    className="h-8 w-8"
                  >
                    <Pause className="h-4 w-4" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleTorrentAction(torrent.infoHash, 'delete')}
                  className="h-8 w-8 text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Progress Bar */}
            {torrent.status !== 'error' && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{Math.round(torrent.progress)}% complete</span>
                  {torrent.timeRemaining && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(torrent.timeRemaining)}
                    </span>
                  )}
                </div>
                <Progress value={torrent.progress} className="h-2" />
              </div>
            )}

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="flex items-center gap-1">
                <Download className="h-3 w-3 text-blue-600" />
                <span>{formatSpeed(torrent.downloadSpeed)}</span>
              </div>

              <div className="flex items-center gap-1">
                <Upload className="h-3 w-3 text-green-600" />
                <span>{formatSpeed(torrent.uploadSpeed)}</span>
              </div>

              <div className="flex items-center gap-1">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span>{torrent.peers} peers</span>
              </div>

              <div className="text-muted-foreground">
                S:{torrent.seeders} L:{torrent.leechers}
              </div>
            </div>

            {/* Payment Info */}
            {(showPayments || showEarnings) && (
              <div className="mt-3 pt-3 border-t grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {showPayments && torrent.totalSpent !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Spent:</span>
                    <span className="text-blue-600 font-medium">
                      {torrent.totalSpent.toLocaleString()} sats
                    </span>
                  </div>
                )}

                {showEarnings && torrent.totalEarned !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Earned:</span>
                    <span className="text-green-600 font-medium">
                      {torrent.totalEarned.toLocaleString()} sats
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}