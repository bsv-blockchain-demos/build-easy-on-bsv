'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Download,
  Upload,
  Clock,
  CheckCircle,
  AlertCircle,
  ExternalLink
} from 'lucide-react';

interface PaymentTransaction {
  txid: string;
  type: 'payment' | 'earning';
  amount: number; // in sats
  status: 'pending' | 'confirmed' | 'failed';
  torrentName: string;
  peerId?: string;
  timestamp: Date;
  confirmations: number;
  blockHeight?: number;
}

interface PaymentStatusProps {
  earnings: number;
  spent: number;
  connected: boolean;
  className?: string;
}

export function PaymentStatus({ earnings, spent, connected, className }: PaymentStatusProps) {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'earnings'>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Mock transaction data
  useEffect(() => {
    if (connected) {
      const mockTransactions: PaymentTransaction[] = [
        {
          txid: '1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890',
          type: 'payment',
          amount: 85,
          status: 'confirmed',
          torrentName: 'Ubuntu 22.04 Desktop.iso',
          peerId: 'peer_abc123',
          timestamp: new Date(Date.now() - 30000),
          confirmations: 3,
          blockHeight: 820450
        },
        {
          txid: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          type: 'earning',
          amount: 34,
          status: 'confirmed',
          torrentName: 'React Tutorial Video.mp4',
          peerId: 'peer_xyz789',
          timestamp: new Date(Date.now() - 120000),
          confirmations: 6,
          blockHeight: 820448
        },
        {
          txid: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
          type: 'payment',
          amount: 51,
          status: 'pending',
          torrentName: 'Node.js Documentation.pdf',
          peerId: 'peer_def456',
          timestamp: new Date(Date.now() - 10000),
          confirmations: 0
        }
      ];
      setTransactions(mockTransactions);
    }
  }, [connected]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsRefreshing(false);
  };

  const getStatusIcon = (status: PaymentTransaction['status']) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
    }
  };

  const getStatusBadge = (status: PaymentTransaction['status']) => {
    const variants = {
      confirmed: 'secondary' as const,
      pending: 'outline' as const,
      failed: 'destructive' as const
    };

    return (
      <Badge variant={variants[status]} className="text-xs">
        {status}
      </Badge>
    );
  };

  const formatTxid = (txid: string): string => {
    return `${txid.slice(0, 8)}...${txid.slice(-8)}`;
  };

  const formatTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const netBalance = earnings - spent;
  const totalTransactions = transactions.length;
  const pendingTransactions = transactions.filter(tx => tx.status === 'pending').length;

  if (!connected) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-40">
          <div className="text-center text-muted-foreground">
            <Wallet className="mx-auto h-8 w-8 mb-2 opacity-50" />
            <p>Connect your BSV wallet to view payment history</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {netBalance >= 0 ? '+' : ''}{netBalance.toLocaleString()} sats
            </div>
            <p className="text-xs text-muted-foreground">
              {netBalance >= 0 ? 'Profit' : 'Loss'} this session
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              +{earnings.toLocaleString()} sats
            </div>
            <p className="text-xs text-muted-foreground">
              From seeding files
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <TrendingDown className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              -{spent.toLocaleString()} sats
            </div>
            <p className="text-xs text-muted-foreground">
              On downloads
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <RefreshCw className={`h-4 w-4 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTransactions}</div>
            <p className="text-xs text-muted-foreground">
              {pendingTransactions} pending
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'overview' | 'payments' | 'earnings')} className="w-full">
        <div className="flex items-center justify-between">
          <TabsList className="grid w-full grid-cols-3 lg:w-fit">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
          </TabsList>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest payment transactions</CardDescription>
              </CardHeader>
              <CardContent>
                {transactions.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <Clock className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p>No transactions yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transactions.slice(0, 5).map((tx) => (
                      <div key={tx.txid} className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                          {tx.type === 'earning' ? (
                            <Upload className="h-4 w-4 text-green-600" />
                          ) : (
                            <Download className="h-4 w-4 text-blue-600" />
                          )}
                          <div>
                            <p className="text-sm font-medium truncate max-w-[200px]">
                              {tx.torrentName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatTime(tx.timestamp)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-medium ${tx.type === 'earning' ? 'text-green-600' : 'text-blue-600'}`}>
                            {tx.type === 'earning' ? '+' : '-'}{tx.amount} sats
                          </p>
                          {getStatusBadge(tx.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Breakdown</CardTitle>
                <CardDescription>Distribution of earnings vs spending</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Earnings</span>
                    <span className="text-green-600">{earnings.toLocaleString()} sats</span>
                  </div>
                  <Progress value={(earnings / Math.max(earnings + spent, 1)) * 100} className="h-2 bg-muted">
                    <div className="h-full bg-green-600 rounded-full transition-all" />
                  </Progress>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Spending</span>
                    <span className="text-blue-600">{spent.toLocaleString()} sats</span>
                  </div>
                  <Progress value={(spent / Math.max(earnings + spent, 1)) * 100} className="h-2 bg-muted">
                    <div className="h-full bg-blue-600 rounded-full transition-all" />
                  </Progress>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex justify-between">
                    <span className="font-medium">Net Result</span>
                    <span className={`font-bold ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {netBalance >= 0 ? '+' : ''}{netBalance.toLocaleString()} sats
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
              <CardDescription>Payments made for downloaded content</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {transactions.filter(tx => tx.type === 'payment').map((tx) => (
                  <div key={tx.txid} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
                        <Download className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">{tx.torrentName}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{formatTxid(tx.txid)}</span>
                          <Button variant="ghost" size="sm" className="h-4 w-4 p-0">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(tx.status)}
                        <span className="font-medium text-blue-600">-{tx.amount} sats</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(tx.timestamp)} • {tx.confirmations} confirmations
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="earnings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Earning History</CardTitle>
              <CardDescription>Payments received from seeding content</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {transactions.filter(tx => tx.type === 'earning').map((tx) => (
                  <div key={tx.txid} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 bg-green-100 rounded-full">
                        <Upload className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium">{tx.torrentName}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{formatTxid(tx.txid)}</span>
                          <Button variant="ghost" size="sm" className="h-4 w-4 p-0">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(tx.status)}
                        <span className="font-medium text-green-600">+{tx.amount} sats</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(tx.timestamp)} • {tx.confirmations} confirmations
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}