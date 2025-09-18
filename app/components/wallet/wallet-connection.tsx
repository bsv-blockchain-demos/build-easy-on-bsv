'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Wallet,
  WalletCards,
  ExternalLink,
  Copy,
  CheckCircle,
  AlertCircle,
  Loader2,
  Zap,
  Shield,
  QrCode,
  Settings
} from 'lucide-react';

interface WalletInfo {
  address: string;
  balance: number; // in sats
  publicKey: string;
  isConnected: boolean;
  provider?: string;
}

interface WalletConnectionProps {
  connected: boolean;
  onConnectionChange: (connected: boolean) => void;
  className?: string;
}

export function WalletConnection({ connected, onConnectionChange, className }: WalletConnectionProps) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'panda' | 'handcash' | 'simply-cash' | null>(null);

  // Mock wallet providers
  const walletProviders = [
    {
      id: 'panda' as const,
      name: 'Panda Wallet',
      icon: '🐼',
      description: 'Browser extension wallet for BSV'
    },
    {
      id: 'handcash' as const,
      name: 'HandCash',
      icon: '💳',
      description: 'Mobile and web BSV wallet'
    },
    {
      id: 'simply-cash' as const,
      name: 'Simply Cash',
      icon: '💰',
      description: 'Simple BSV wallet solution'
    }
  ];

  useEffect(() => {
    // Check for existing connection on mount
    const savedWallet = localStorage.getItem('bsv-torrent-wallet');
    if (savedWallet) {
      try {
        const walletData = JSON.parse(savedWallet);
        setWallet(walletData);
        onConnectionChange(true);
      } catch (error) {
        console.error('Failed to parse saved wallet:', error);
        localStorage.removeItem('bsv-torrent-wallet');
      }
    }
  }, [onConnectionChange]);

  const connectWallet = async (provider: 'panda' | 'handcash' | 'simply-cash') => {
    setIsConnecting(true);
    setError(null);
    setSelectedProvider(provider);

    try {
      // Simulate wallet connection
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Mock wallet data
      const mockWallet: WalletInfo = {
        address: '1A2B3C4D5E6F7890ABCDEF1234567890ABCDEF12',
        balance: Math.floor(Math.random() * 100000), // Random balance for demo
        publicKey: '02a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890',
        isConnected: true,
        provider: provider
      };

      setWallet(mockWallet);
      localStorage.setItem('bsv-torrent-wallet', JSON.stringify(mockWallet));
      onConnectionChange(true);
      setShowConnectionDialog(false);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
      setSelectedProvider(null);
    }
  };

  const disconnectWallet = () => {
    setWallet(null);
    localStorage.removeItem('bsv-torrent-wallet');
    onConnectionChange(false);
  };

  const copyAddress = async () => {
    if (wallet?.address) {
      await navigator.clipboard.writeText(wallet.address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const formatAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  };

  const formatBalance = (sats: number): string => {
    if (sats >= 100000000) {
      return `${(sats / 100000000).toFixed(4)} BSV`;
    }
    return `${sats.toLocaleString()} sats`;
  };

  if (connected && wallet) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-green-100 rounded-full">
              <Wallet className="h-4 w-4 text-green-600" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{formatAddress(wallet.address)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyAddress}
                  className="h-6 w-6 p-0"
                >
                  {copiedAddress ? (
                    <CheckCircle className="h-3 w-3 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatBalance(wallet.balance)}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {wallet.provider}
                </Badge>
              </div>
            </div>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Wallet Details</DialogTitle>
                  <DialogDescription>
                    Manage your BSV wallet connection
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={wallet.address}
                        readOnly
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={copyAddress}
                      >
                        {copiedAddress ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Balance</Label>
                    <Input
                      value={formatBalance(wallet.balance)}
                      readOnly
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Input
                      value={wallet.provider || 'Unknown'}
                      readOnly
                    />
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <Shield className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm text-yellow-700">
                      Your private keys are managed by your wallet provider
                    </span>
                  </div>

                  <Button
                    variant="destructive"
                    onClick={disconnectWallet}
                    className="w-full"
                  >
                    Disconnect Wallet
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <Dialog open={showConnectionDialog} onOpenChange={setShowConnectionDialog}>
      <DialogTrigger asChild>
        <Button variant="outline" className={className}>
          <Wallet className="h-4 w-4 mr-2" />
          Connect Wallet
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WalletCards className="h-5 w-5" />
            Connect BSV Wallet
          </DialogTitle>
          <DialogDescription>
            Choose a BSV wallet to connect and start earning or spending on torrents
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="space-y-3">
          {walletProviders.map((provider) => (
            <Card
              key={provider.id}
              className={`cursor-pointer hover:shadow-md transition-shadow ${
                selectedProvider === provider.id ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => !isConnecting && connectWallet(provider.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{provider.icon}</div>
                  <div className="flex-1">
                    <h3 className="font-medium">{provider.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {provider.description}
                    </p>
                  </div>
                  {isConnecting && selectedProvider === provider.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="h-4 w-4" />
            <span>Lightning-fast micropayments</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Your keys, your Bitcoin</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <QrCode className="h-4 w-4" />
            <span>Works with all BSV wallets</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          By connecting a wallet, you agree to our Terms of Service and Privacy Policy
        </p>
      </DialogContent>
    </Dialog>
  );
}