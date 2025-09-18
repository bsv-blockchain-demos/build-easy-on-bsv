'use client';

import React, { ReactNode } from 'react';
import { BSVWalletProvider } from '../contexts/bsv-wallet-context';

interface CombinedProvidersProps {
  children: ReactNode;
}

export function CombinedProviders({ children }: CombinedProvidersProps) {
  return (
    <BSVWalletProvider>
      {children}
    </BSVWalletProvider>
  );
}