'use client';

import { useState } from 'react';
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
  Copy,
  CheckCircle,
  AlertCircle,
  Loader2,
  Zap,
  Shield,
  Plus,
  ExternalLink
} from 'lucide-react';
import { useBSVWallet } from '../../contexts/bsv-wallet-context';

interface WalletConnectionProps {
  connected: boolean;
  onConnectionChange: (connected: boolean) => void;
  className?: string;
}

export function WalletConnection({ connected, onConnectionChange, className }: WalletConnectionProps) {
  // Use real BSV wallet context
  const { state: walletState, actions: walletActions } = useBSVWallet();

  // Local UI state
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendAmount, setSendAmount] = useState('');
  const [sendAddress, setSendAddress] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);

  const handleConnect = async () => {
    try {
      if (!walletState.wallet) {
        await walletActions.createWallet();
      } else {
        await walletActions.connectWallet();
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  const handleDisconnect = async () => {
    try {
      await walletActions.disconnectWallet();
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };

  const handleSendBSV = async () => {
    if (!sendAddress || !sendAmount) return;

    setIsSending(true);
    setSendError(null);

    try {
      const amountSatoshis = Math.floor(parseFloat(sendAmount) * 100000000);
      const txid = await walletActions.requestTransaction(sendAddress, amountSatoshis);

      console.log('Transaction sent:', txid);

      // Reset form
      setSendAmount('');
      setSendAddress('');
      setShowSendDialog(false);

    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Transaction failed');
    } finally {
      setIsSending(false);
    }
  };

  const copyAddress = async () => {
    if (walletState.address) {
      await navigator.clipboard.writeText(walletState.address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const formatAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  };

  const getStatusBadge = () => {
    switch (walletState.connectionStatus) {
      case 'connected':
        return <Badge variant="secondary" className="text-green-600"><CheckCircle className="w-3 h-3 mr-1" />Connected</Badge>;
      case 'connecting':
        return <Badge variant="outline"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Connecting</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="outline">Disconnected</Badge>;
    }
  };

  if (walletState.isConnected && walletState.address) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {getStatusBadge()}

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Wallet className="w-4 h-4 mr-2" />
              {walletState.formattedBalance} BSV
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>BSV Wallet</DialogTitle>
              <DialogDescription>
                Manage your Bitcoin SV wallet for BSV Torrent payments
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Wallet Address</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted p-2 rounded">
                      {formatAddress(walletState.address)}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={copyAddress}
                      className="h-8 w-8"
                    >
                      {copiedAddress ? (
                        <CheckCircle className="h-3 w-3 text-green-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{walletState.formattedBalance} BSV</div>
                  <p className="text-sm text-muted-foreground">
                    {walletState.balance.toLocaleString()} satoshis
                  </p>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
                  <DialogTrigger asChild>
                    <Button className="flex-1">
                      <Zap className="w-4 h-4 mr-2" />
                      Send BSV
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Send BSV</DialogTitle>
                      <DialogDescription>
                        Send Bitcoin SV to another address
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="send-address">Recipient Address</Label>
                        <Input
                          id="send-address"
                          placeholder="1A2B3C4D5E6F7890ABCDEF1234567890ABCDEF12"
                          value={sendAddress}
                          onChange={(e) => setSendAddress(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="send-amount">Amount (BSV)</Label>
                        <Input
                          id="send-amount"
                          type="number"
                          step="0.00000001"
                          placeholder="0.001"
                          value={sendAmount}
                          onChange={(e) => setSendAmount(e.target.value)}
                        />
                      </div>

                      {sendError && (
                        <div className="flex items-center gap-2 text-sm text-red-600">
                          <AlertCircle className="w-4 h-4" />
                          {sendError}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => setShowSendDialog(false)}
                          disabled={isSending}
                        >
                          Cancel
                        </Button>
                        <Button
                          className="flex-1"
                          onClick={handleSendBSV}
                          disabled={isSending || !sendAddress || !sendAmount}
                        >
                          {isSending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            'Send BSV'
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button variant="outline" onClick={handleDisconnect} className="flex-1">
                  Disconnect
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {getStatusBadge()}

      <Dialog open={showConnectionDialog} onOpenChange={setShowConnectionDialog}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Connect Wallet
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Connect BSV Wallet</DialogTitle>
            <DialogDescription>
              Create or connect a Bitcoin SV wallet for BSV Torrent payments
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {walletState.error && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                {walletState.error}
              </div>
            )}

            <Card className="cursor-pointer hover:bg-accent" onClick={handleConnect}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  BSV Torrent Wallet
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {!walletState.wallet
                    ? 'Create a new BSV wallet for torrent payments'
                    : 'Connect to your existing BSV wallet'
                  }
                </p>
              </CardContent>
            </Card>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Your wallet is stored securely in your browser</p>
              <p>• Private keys never leave your device</p>
              <p>• Server wallet handles complex BSV operations</p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowConnectionDialog(false)}
                disabled={walletState.isLoading}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleConnect}
                disabled={walletState.isLoading}
              >
                {walletState.isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {walletState.connectionStatus === 'connecting' ? 'Connecting...' : 'Creating...'}
                  </>
                ) : (
                  !walletState.wallet ? 'Create Wallet' : 'Connect Wallet'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}