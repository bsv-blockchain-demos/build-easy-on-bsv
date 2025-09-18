/**
 * TorrentPaymentScripts
 * Simple P2PKH payment scripts for BSV torrent micropayments
 * Focuses on MVP functionality with efficient, straightforward payment processing
 * Integrates with existing TorrentMicropaymentManager for streaming payments
 */

import { P2PKH, LockingScript, Transaction } from '@bsv/sdk';

// ===== INTERFACES AND TYPES =====

export interface PaymentScriptConfig {
  standardBlockSize: number; // Standard block size in bytes (16KB = 16384)
  standardRate: number; // Standard payment rate in satoshis per standard block
  minPaymentAmount: number; // Minimum payment amount in satoshis
  maxPaymentAmount: number; // Maximum payment amount in satoshis
  enableBatching: boolean; // Enable batch payment optimization
  enableValidation: boolean; // Enable payment parameter validation
}

export interface IndividualPayment {
  torrentHash: string; // 40-character hex string
  recipientAddress: string; // BSV address
  blockIndex: number; // Block sequence number
  blockSize: number; // Block size in bytes
  amount: number; // Payment amount in satoshis
  metadata: { [key: string]: any }; // Additional payment metadata
}

export interface BatchPayment {
  payments: IndividualPayment[]; // Individual payments to batch
  recipientAddress: string; // Single recipient for batch
  totalAmount: number; // Total batch amount in satoshis
  batchId: string; // Unique batch identifier
  metadata: { [key: string]: any }; // Batch metadata
}

export interface PaymentValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface ScriptGenerationResult {
  success: boolean;
  script?: LockingScript;
  scriptHex?: string;
  scriptLength?: number;
  estimatedFee?: number;
  error?: string;
}

export interface PaymentExecutionResult {
  success: boolean;
  transactionOutput?: {
    satoshis: number;
    lockingScript: LockingScript;
    description?: string;
  };
  estimatedSize?: number;
  estimatedFee?: number;
  validationErrors?: string[];
  metadata?: { [key: string]: any };
  error?: string;
}

export interface BatchExecutionResult {
  success: boolean;
  transactionOutput?: {
    satoshis: number;
    lockingScript: LockingScript;
    description?: string;
  };
  paymentCount?: number;
  efficiency?: number; // 0-1 representing batch efficiency
  estimatedSize?: number;
  estimatedFee?: number;
  validationErrors?: string[];
  metadata?: { [key: string]: any };
  error?: string;
}

export interface MixedBatchResult {
  success: boolean;
  batches?: {
    recipient: string;
    output: {
      satoshis: number;
      lockingScript: LockingScript;
      description?: string;
    };
    count: number
  }[];
  totalOutputs?: number;
  totalAmount?: number;
  estimatedSize?: number;
  estimatedFee?: number;
  error?: string;
}

// ===== MAIN TORRENT PAYMENT SCRIPTS CLASS =====

export class TorrentPaymentScripts {
  private config: PaymentScriptConfig;

  constructor(config: PaymentScriptConfig) {
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Validate configuration parameters
   */
  private validateConfig(config: PaymentScriptConfig): void {
    if (config.standardBlockSize <= 0) {
      throw new Error('Invalid configuration: standardBlockSize must be positive');
    }
    if (config.standardRate <= 0) {
      throw new Error('Invalid configuration: standardRate must be positive');
    }
    if (config.minPaymentAmount < 0) {
      throw new Error('Invalid configuration: minPaymentAmount cannot be negative');
    }
    if (config.maxPaymentAmount <= config.minPaymentAmount) {
      throw new Error('Invalid configuration: maxPaymentAmount must be greater than minPaymentAmount');
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): PaymentScriptConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: PaymentScriptConfig): void {
    this.validateConfig(newConfig);
    this.config = newConfig;
  }

  /**
   * Calculate payment amount based on block size
   */
  calculatePaymentAmount(blockSize: number): number {
    if (blockSize <= 0) return 0;

    const ratio = blockSize / this.config.standardBlockSize;
    const baseAmount = Math.floor(this.config.standardRate * ratio);

    // For very small blocks that calculate to zero, only enforce minimum if it's meaningful
    if (baseAmount === 0) {
      // If minimum payment is greater than 1 sat, enforce it even for tiny blocks
      if (this.config.minPaymentAmount > 1) {
        return this.config.minPaymentAmount;
      }
      return 0;
    }

    // Enforce minimum payment amount if calculated amount is very small but greater than 0
    if (baseAmount > 0 && baseAmount < this.config.minPaymentAmount) {
      return this.config.minPaymentAmount;
    }
    if (baseAmount > this.config.maxPaymentAmount) {
      return this.config.maxPaymentAmount;
    }

    return baseAmount;
  }

  /**
   * Generate P2PKH locking script for payment
   */
  generateP2PKHLockingScript(recipientAddress: string): ScriptGenerationResult {
    try {
      const p2pkh = new P2PKH();
      const lockingScript = p2pkh.lock(recipientAddress);
      const scriptHex = lockingScript.toHex();
      const scriptLength = scriptHex.length / 2; // Convert hex to bytes
      const estimatedFee = this.estimateScriptFee(scriptLength);

      return {
        success: true,
        script: lockingScript,
        scriptHex,
        scriptLength,
        estimatedFee
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Invalid address format: ${error.message}`
      };
    }
  }

  /**
   * Validate payment parameters
   */
  validatePayment(payment: IndividualPayment): PaymentValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.config.enableValidation) {
      return { valid: true, errors: [], warnings: ['Validation disabled'] };
    }

    // Validate torrent hash format (40-character hex)
    if (!/^[a-fA-F0-9]{40}$/.test(payment.torrentHash)) {
      errors.push('Invalid torrent hash format (must be 40-character hex string)');
    }

    // Validate address format by attempting script generation
    const scriptResult = this.generateP2PKHLockingScript(payment.recipientAddress);
    if (!scriptResult.success) {
      errors.push('Invalid recipient address format');
    }

    // Validate block parameters
    if (payment.blockIndex < 0) {
      errors.push('Block index must be non-negative');
    }

    if (payment.blockSize <= 0) {
      errors.push('Block size must be positive');
    }

    if (payment.amount <= 0) {
      errors.push('Payment amount must be positive');
    }

    // Validate payment amount limits
    if (payment.amount < this.config.minPaymentAmount) {
      errors.push(`Payment amount (${payment.amount}) is below minimum (${this.config.minPaymentAmount})`);
    }

    if (payment.amount > this.config.maxPaymentAmount) {
      errors.push(`Payment amount (${payment.amount}) is above maximum (${this.config.maxPaymentAmount})`);
    }

    // Validate payment amount matches calculated amount
    const expectedAmount = this.calculatePaymentAmount(payment.blockSize);
    if (payment.amount !== expectedAmount && expectedAmount >= this.config.minPaymentAmount) {
      warnings.push(`Payment amount (${payment.amount}) differs from expected (${expectedAmount})`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate batch payment parameters
   */
  validateBatchPayment(batchPayment: BatchPayment): PaymentValidationResult {
    const errors: string[] = [];

    if (!this.config.enableBatching) {
      return { valid: false, errors: ['Batch processing is disabled'] };
    }

    if (batchPayment.payments.length === 0) {
      errors.push('Batch cannot be empty');
    }

    // Validate all payments have the same recipient
    const recipient = batchPayment.recipientAddress;
    for (const payment of batchPayment.payments) {
      if (payment.recipientAddress !== recipient) {
        errors.push('All payments in batch must have the same recipient');
        break;
      }
    }

    // Validate total amount matches sum of individual payments
    const calculatedTotal = batchPayment.payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (batchPayment.totalAmount !== calculatedTotal) {
      errors.push(`Batch total amount (${batchPayment.totalAmount}) does not match sum of payments (${calculatedTotal})`);
    }

    // Validate individual payments
    if (this.config.enableValidation) {
      for (let i = 0; i < batchPayment.payments.length; i++) {
        const validation = this.validatePayment(batchPayment.payments[i]);
        if (!validation.valid) {
          errors.push(`Payment ${i}: ${validation.errors.join(', ')}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Process individual payment and create transaction output
   */
  async processIndividualPayment(payment: IndividualPayment): Promise<PaymentExecutionResult> {
    try {
      // Validate payment if validation is enabled
      if (this.config.enableValidation) {
        const validation = this.validatePayment(payment);
        if (!validation.valid) {
          return {
            success: false,
            validationErrors: validation.errors,
            error: validation.errors.join('; ')
          };
        }
      }

      // Generate P2PKH locking script
      const scriptResult = this.generateP2PKHLockingScript(payment.recipientAddress);
      if (!scriptResult.success) {
        return {
          success: false,
          error: scriptResult.error
        };
      }

      // Create transaction output data
      const transactionOutput = {
        satoshis: payment.amount,
        lockingScript: scriptResult.script!,
        description: `Payment for block ${payment.blockIndex} of torrent ${payment.torrentHash.substring(0, 8)}...`
      };

      // Estimate transaction size and fee
      const estimatedSize = this.estimateOutputSize(scriptResult.scriptLength!);
      const estimatedFee = this.estimateTransactionFee(estimatedSize);

      return {
        success: true,
        transactionOutput,
        estimatedSize,
        estimatedFee,
        metadata: payment.metadata
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Payment processing failed: ${error.message}`
      };
    }
  }

  /**
   * Process batch payment and create single transaction output
   */
  async processBatchPayment(batchPayment: BatchPayment): Promise<BatchExecutionResult> {
    try {
      // Validate batch payment
      const validation = this.validateBatchPayment(batchPayment);
      if (!validation.valid) {
        return {
          success: false,
          validationErrors: validation.errors,
          error: validation.errors.join('; ')
        };
      }

      // Generate P2PKH locking script for recipient
      const scriptResult = this.generateP2PKHLockingScript(batchPayment.recipientAddress);
      if (!scriptResult.success) {
        return {
          success: false,
          error: scriptResult.error
        };
      }

      // Create single transaction output for batch
      const transactionOutput = {
        satoshis: batchPayment.totalAmount,
        lockingScript: scriptResult.script!,
        description: `Batch payment of ${batchPayment.payments.length} blocks for torrent ${batchPayment.payments[0]?.torrentHash.substring(0, 8)}...`
      };

      // Calculate batch efficiency metrics
      const individualOutputSize = this.estimateOutputSize(scriptResult.scriptLength!) * batchPayment.payments.length;
      const batchOutputSize = this.estimateOutputSize(scriptResult.scriptLength!);
      const efficiency = 1 - (batchOutputSize / individualOutputSize);

      const estimatedFee = this.estimateTransactionFee(batchOutputSize);

      return {
        success: true,
        transactionOutput,
        paymentCount: batchPayment.payments.length,
        efficiency,
        estimatedSize: batchOutputSize,
        estimatedFee,
        metadata: batchPayment.metadata
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Batch processing failed: ${error.message}`
      };
    }
  }

  /**
   * Process mixed batch payment with different recipients
   */
  async processMixedBatchPayment(payments: IndividualPayment[]): Promise<MixedBatchResult> {
    try {
      if (!this.config.enableBatching) {
        return {
          success: false,
          error: 'Batch processing is disabled'
        };
      }

      // Group payments by recipient
      const paymentGroups = new Map<string, IndividualPayment[]>();
      for (const payment of payments) {
        const recipient = payment.recipientAddress;
        if (!paymentGroups.has(recipient)) {
          paymentGroups.set(recipient, []);
        }
        paymentGroups.get(recipient)!.push(payment);
      }

      const batches: {
        recipient: string;
        output: {
          satoshis: number;
          lockingScript: LockingScript;
          description?: string;
        };
        count: number
      }[] = [];
      let totalAmount = 0;
      let totalSize = 0;

      // Process each recipient group as a batch
      for (const [recipient, groupPayments] of paymentGroups) {
        const groupTotal = groupPayments.reduce((sum, payment) => sum + payment.amount, 0);

        const batchPayment: BatchPayment = {
          payments: groupPayments,
          recipientAddress: recipient,
          totalAmount: groupTotal,
          batchId: `mixed-batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          metadata: { recipientGroup: recipient }
        };

        const batchResult = await this.processBatchPayment(batchPayment);
        if (!batchResult.success) {
          return {
            success: false,
            error: `Failed to process batch for recipient ${recipient}: ${batchResult.error}`
          };
        }

        batches.push({
          recipient,
          output: batchResult.transactionOutput!,
          count: groupPayments.length
        });

        totalAmount += groupTotal;
        totalSize += batchResult.estimatedSize!;
      }

      const estimatedFee = this.estimateTransactionFee(totalSize);

      return {
        success: true,
        batches,
        totalOutputs: batches.length,
        totalAmount,
        estimatedSize: totalSize,
        estimatedFee
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Mixed batch processing failed: ${error.message}`
      };
    }
  }

  /**
   * Estimate script fee based on script length
   */
  private estimateScriptFee(scriptLength: number): number {
    // Simple fee estimation: ~0.5 sats per byte
    return Math.ceil(scriptLength * 0.5);
  }

  /**
   * Estimate transaction output size
   */
  private estimateOutputSize(scriptLength: number): number {
    // Output: 8 bytes (value) + varint (script length) + script
    const varintSize = scriptLength < 253 ? 1 : (scriptLength < 65536 ? 3 : 5);
    return 8 + varintSize + scriptLength;
  }

  /**
   * Estimate transaction fee based on size
   */
  private estimateTransactionFee(size: number): number {
    // Standard fee rate: ~0.5 sats per byte
    return Math.ceil(size * 0.5);
  }

  /**
   * Static utility: Validate torrent hash format
   */
  static validateTorrentHash(hash: string): boolean {
    return /^[a-fA-F0-9]{40}$/.test(hash);
  }

  /**
   * Static utility: Calculate payment for standard 16KB block
   */
  static calculateStandardPayment(blockSize: number = 16384, rate: number = 17): number {
    const ratio = blockSize / 16384;
    return Math.floor(rate * ratio);
  }

  /**
   * Static utility: Estimate batch efficiency
   */
  static calculateBatchEfficiency(individualCount: number, batchCount: number): number {
    if (individualCount <= 0 || batchCount <= 0) return 0;
    return Math.max(0, 1 - (batchCount / individualCount));
  }

  /**
   * Static utility: Group payments by recipient
   */
  static groupPaymentsByRecipient(payments: IndividualPayment[]): Map<string, IndividualPayment[]> {
    const groups = new Map<string, IndividualPayment[]>();
    for (const payment of payments) {
      const recipient = payment.recipientAddress;
      if (!groups.has(recipient)) {
        groups.set(recipient, []);
      }
      groups.get(recipient)!.push(payment);
    }
    return groups;
  }

  /**
   * Static utility: Calculate total payment amount
   */
  static calculateTotalAmount(payments: IndividualPayment[]): number {
    return payments.reduce((sum, payment) => sum + payment.amount, 0);
  }

  /**
   * Static utility: Validate payment sequence
   */
  static validatePaymentSequence(payments: IndividualPayment[]): boolean {
    if (payments.length === 0) return true;

    // Sort by block index
    const sorted = [...payments].sort((a, b) => a.blockIndex - b.blockIndex);

    // Check for sequential block indices
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].blockIndex !== sorted[i - 1].blockIndex + 1) {
        return false;
      }
    }

    return true;
  }
}