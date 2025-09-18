/**
 * TorrentPaymentScripts Test Suite
 * Comprehensive tests for P2PKH payment scripts used in BSV torrent system
 * Focuses on MVP functionality with simple, efficient payment processing
 */

import { PrivateKey, PublicKey, Transaction, P2PKH } from '@bsv/sdk';
import {
  TorrentPaymentScripts,
  PaymentScriptConfig,
  IndividualPayment,
  BatchPayment,
  PaymentValidationResult,
  ScriptGenerationResult,
  PaymentExecutionResult
} from '../../../lib/scripts/torrent-payment-scripts';

describe('TorrentPaymentScripts', () => {
  let paymentScripts: TorrentPaymentScripts;
  let testPrivateKey: PrivateKey;
  let testPublicKey: PublicKey;
  let testAddress: string;
  let recipientPrivateKey: PrivateKey;
  let recipientPublicKey: PublicKey;
  let recipientAddress: string;
  let mockTransaction: Transaction;

  beforeEach(() => {
    // Create test keys
    testPrivateKey = PrivateKey.fromRandom();
    testPublicKey = testPrivateKey.toPublicKey();
    testAddress = testPublicKey.toAddress();

    recipientPrivateKey = PrivateKey.fromRandom();
    recipientPublicKey = recipientPrivateKey.toPublicKey();
    recipientAddress = recipientPublicKey.toAddress();

    // Initialize payment scripts
    const config: PaymentScriptConfig = {
      standardBlockSize: 16384, // 16KB
      standardRate: 17, // 17 sats per 16KB
      minPaymentAmount: 1, // 1 sat minimum
      maxPaymentAmount: 1000000, // 1M sats maximum
      enableBatching: true,
      enableValidation: true
    };

    paymentScripts = new TorrentPaymentScripts(config);

    // Mock transaction for testing
    mockTransaction = new Transaction();
  });

  describe('Initialization and Configuration', () => {
    it('should initialize with valid configuration', () => {
      expect(paymentScripts).toBeDefined();
      expect(paymentScripts.getConfig()).toBeDefined();
      expect(paymentScripts.getConfig().standardBlockSize).toBe(16384);
      expect(paymentScripts.getConfig().standardRate).toBe(17);
    });

    it('should throw error with invalid configuration', () => {
      expect(() => {
        new TorrentPaymentScripts({
          standardBlockSize: 0,
          standardRate: -1,
          minPaymentAmount: 1,
          maxPaymentAmount: 1000000,
          enableBatching: true,
          enableValidation: true
        });
      }).toThrow('Invalid configuration');
    });

    it('should handle configuration updates', () => {
      const newConfig: PaymentScriptConfig = {
        standardBlockSize: 32768, // 32KB
        standardRate: 34, // 34 sats per 32KB
        minPaymentAmount: 2,
        maxPaymentAmount: 2000000,
        enableBatching: false,
        enableValidation: false
      };

      paymentScripts.updateConfig(newConfig);
      expect(paymentScripts.getConfig().standardBlockSize).toBe(32768);
      expect(paymentScripts.getConfig().standardRate).toBe(34);
    });
  });

  describe('Payment Amount Calculations', () => {
    it('should calculate correct payment for standard block size', () => {
      const payment = paymentScripts.calculatePaymentAmount(16384);
      expect(payment).toBe(17);
    });

    it('should calculate correct payment for different block sizes', () => {
      // Half size block
      const halfPayment = paymentScripts.calculatePaymentAmount(8192);
      expect(halfPayment).toBe(8); // Math.floor(17 * 0.5)

      // Double size block
      const doublePayment = paymentScripts.calculatePaymentAmount(32768);
      expect(doublePayment).toBe(34); // 17 * 2

      // Quarter size block
      const quarterPayment = paymentScripts.calculatePaymentAmount(4096);
      expect(quarterPayment).toBe(4); // Math.floor(17 * 0.25)
    });

    it('should handle edge cases in payment calculation', () => {
      // Zero block size
      expect(paymentScripts.calculatePaymentAmount(0)).toBe(0);

      // Very small block
      expect(paymentScripts.calculatePaymentAmount(1)).toBe(0); // Math.floor(17 * (1/16384))

      // Very large block
      const largePayment = paymentScripts.calculatePaymentAmount(1000000);
      expect(largePayment).toBeGreaterThan(1000);
    });

    it('should respect minimum and maximum payment limits', () => {
      const config: PaymentScriptConfig = {
        standardBlockSize: 16384,
        standardRate: 17,
        minPaymentAmount: 5,
        maxPaymentAmount: 50,
        enableBatching: true,
        enableValidation: true
      };

      const limitedPaymentScripts = new TorrentPaymentScripts(config);

      // Should enforce minimum
      const smallPayment = limitedPaymentScripts.calculatePaymentAmount(1);
      expect(smallPayment).toBe(5);

      // Should enforce maximum
      const largePayment = limitedPaymentScripts.calculatePaymentAmount(1000000);
      expect(largePayment).toBe(50);
    });
  });

  describe('P2PKH Script Generation', () => {
    it('should generate valid P2PKH locking script', () => {
      const result = paymentScripts.generateP2PKHLockingScript(recipientAddress);

      expect(result.success).toBe(true);
      expect(result.script).toBeDefined();
      expect(result.scriptHex).toBeDefined();
      expect(result.scriptLength).toBeGreaterThan(0);
      expect(result.estimatedFee).toBeGreaterThan(0);
    });

    it('should handle invalid address in script generation', () => {
      const result = paymentScripts.generateP2PKHLockingScript('invalid-address');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid address');
    });

    it('should generate consistent scripts for same address', () => {
      const result1 = paymentScripts.generateP2PKHLockingScript(recipientAddress);
      const result2 = paymentScripts.generateP2PKHLockingScript(recipientAddress);

      expect(result1.scriptHex).toBe(result2.scriptHex);
      expect(result1.scriptLength).toBe(result2.scriptLength);
    });

    it('should estimate reasonable script lengths', () => {
      const result = paymentScripts.generateP2PKHLockingScript(recipientAddress);

      expect(result.scriptLength).toBeGreaterThan(20); // Minimum expected for P2PKH
      expect(result.scriptLength).toBeLessThan(50); // Maximum expected for P2PKH
    });
  });

  describe('Individual Payment Processing', () => {
    it('should process individual streaming micropayment', async () => {
      const payment: IndividualPayment = {
        torrentHash: '1234567890abcdef1234567890abcdef12345678',
        recipientAddress: recipientAddress,
        blockIndex: 0,
        blockSize: 16384,
        amount: 17,
        metadata: {
          paymentType: 'streaming',
          channelId: 'test-channel-001'
        }
      };

      const result = await paymentScripts.processIndividualPayment(payment);

      expect(result.success).toBe(true);
      expect(result.transactionOutput).toBeDefined();
      expect(result.transactionOutput!.satoshis).toBe(17);
      expect(result.transactionOutput!.lockingScript).toBeDefined();
      expect(result.estimatedSize).toBeGreaterThan(0);
      expect(result.estimatedFee).toBeGreaterThan(0);
    });

    it('should process peer-to-peer content payment', async () => {
      const payment: IndividualPayment = {
        torrentHash: '1234567890abcdef1234567890abcdef12345678',
        recipientAddress: recipientAddress,
        blockIndex: 5,
        blockSize: 32768, // 32KB block
        amount: 34, // Double the standard rate
        metadata: {
          paymentType: 'p2p',
          contentType: 'video',
          qualityScore: 0.95
        }
      };

      const result = await paymentScripts.processIndividualPayment(payment);

      expect(result.success).toBe(true);
      expect(result.transactionOutput!.satoshis).toBe(34);
      expect(result.metadata).toEqual(payment.metadata);
    });

    it('should validate payment parameters', async () => {
      const invalidPayment: IndividualPayment = {
        torrentHash: 'invalid-hash',
        recipientAddress: 'invalid-address',
        blockIndex: -1,
        blockSize: 0,
        amount: -5,
        metadata: {}
      };

      const result = await paymentScripts.processIndividualPayment(invalidPayment);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThan(0);
    });

    it('should handle payment amounts outside configured limits', async () => {
      const config: PaymentScriptConfig = {
        standardBlockSize: 16384,
        standardRate: 17,
        minPaymentAmount: 10,
        maxPaymentAmount: 25,
        enableBatching: true,
        enableValidation: true
      };

      const limitedPaymentScripts = new TorrentPaymentScripts(config);

      // Payment below minimum
      const lowPayment: IndividualPayment = {
        torrentHash: '1234567890abcdef1234567890abcdef12345678',
        recipientAddress: recipientAddress,
        blockIndex: 0,
        blockSize: 1000, // Very small block
        amount: 5, // Below minimum
        metadata: {}
      };

      const lowResult = await limitedPaymentScripts.processIndividualPayment(lowPayment);
      expect(lowResult.success).toBe(false);
      expect(lowResult.error).toContain('below minimum');

      // Payment above maximum
      const highPayment: IndividualPayment = {
        torrentHash: '1234567890abcdef1234567890abcdef12345678',
        recipientAddress: recipientAddress,
        blockIndex: 0,
        blockSize: 50000, // Large block
        amount: 100, // Above maximum
        metadata: {}
      };

      const highResult = await limitedPaymentScripts.processIndividualPayment(highPayment);
      expect(highResult.success).toBe(false);
      expect(highResult.error).toContain('above maximum');
    });
  });

  describe('Batch Payment Processing', () => {
    it('should process batch payments efficiently', async () => {
      const payments: IndividualPayment[] = [
        {
          torrentHash: '1234567890abcdef1234567890abcdef12345678',
          recipientAddress: recipientAddress,
          blockIndex: 0,
          blockSize: 16384,
          amount: 17,
          metadata: { paymentType: 'streaming' }
        },
        {
          torrentHash: '1234567890abcdef1234567890abcdef12345678',
          recipientAddress: recipientAddress,
          blockIndex: 1,
          blockSize: 16384,
          amount: 17,
          metadata: { paymentType: 'streaming' }
        },
        {
          torrentHash: '1234567890abcdef1234567890abcdef12345678',
          recipientAddress: recipientAddress,
          blockIndex: 2,
          blockSize: 16384,
          amount: 17,
          metadata: { paymentType: 'streaming' }
        }
      ];

      const batchPayment: BatchPayment = {
        payments: payments,
        recipientAddress: recipientAddress,
        totalAmount: 51, // 17 * 3
        batchId: 'batch-001',
        metadata: {
          batchType: 'streaming',
          optimization: 'enabled'
        }
      };

      const result = await paymentScripts.processBatchPayment(batchPayment);

      expect(result.success).toBe(true);
      expect(result.transactionOutput).toBeDefined();
      expect(result.transactionOutput!.satoshis).toBe(51);
      expect(result.paymentCount).toBe(3);
      expect(result.efficiency).toBeGreaterThan(0);
      expect(result.estimatedSize).toBeLessThan(result.paymentCount * 50); // Should be more efficient than individual payments
    });

    it('should handle mixed recipient batch payments', async () => {
      const recipient2Address = PrivateKey.fromRandom().toPublicKey().toAddress();

      const payments: IndividualPayment[] = [
        {
          torrentHash: '1234567890abcdef1234567890abcdef12345678',
          recipientAddress: recipientAddress,
          blockIndex: 0,
          blockSize: 16384,
          amount: 17,
          metadata: {}
        },
        {
          torrentHash: '1234567890abcdef1234567890abcdef12345678',
          recipientAddress: recipient2Address,
          blockIndex: 1,
          blockSize: 16384,
          amount: 17,
          metadata: {}
        }
      ];

      const result = await paymentScripts.processMixedBatchPayment(payments);

      expect(result.success).toBe(true);
      expect(result.batches).toBeDefined();
      expect(result.batches!.length).toBe(2); // Should create separate batches for different recipients
      expect(result.totalOutputs).toBe(2);
      expect(result.totalAmount).toBe(34);
    });

    it('should optimize batch payments for fee efficiency', async () => {
      const payments: IndividualPayment[] = Array.from({ length: 10 }, (_, i) => ({
        torrentHash: '1234567890abcdef1234567890abcdef12345678',
        recipientAddress: recipientAddress,
        blockIndex: i,
        blockSize: 16384,
        amount: 17,
        metadata: { paymentType: 'streaming' }
      }));

      const batchPayment: BatchPayment = {
        payments: payments,
        recipientAddress: recipientAddress,
        totalAmount: 170, // 17 * 10
        batchId: 'batch-optimization-test',
        metadata: {}
      };

      const result = await paymentScripts.processBatchPayment(batchPayment);

      expect(result.success).toBe(true);
      expect(result.efficiency).toBeGreaterThan(0.8); // Should be quite efficient
      expect(result.estimatedFee).toBeLessThan(payments.length * 10); // Should have lower total fees than individual payments
    });
  });

  describe('Payment Validation', () => {
    it('should validate individual payment parameters', () => {
      const validPayment: IndividualPayment = {
        torrentHash: '1234567890abcdef1234567890abcdef12345678',
        recipientAddress: recipientAddress,
        blockIndex: 0,
        blockSize: 16384,
        amount: 17,
        metadata: {}
      };

      const result = paymentScripts.validatePayment(validPayment);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid torrent hash', () => {
      const invalidPayment: IndividualPayment = {
        torrentHash: 'invalid-hash',
        recipientAddress: recipientAddress,
        blockIndex: 0,
        blockSize: 16384,
        amount: 17,
        metadata: {}
      };

      const result = paymentScripts.validatePayment(invalidPayment);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('torrent hash'))).toBe(true);
    });

    it('should detect invalid address format', () => {
      const invalidPayment: IndividualPayment = {
        torrentHash: '1234567890abcdef1234567890abcdef12345678',
        recipientAddress: 'invalid-address',
        blockIndex: 0,
        blockSize: 16384,
        amount: 17,
        metadata: {}
      };

      const result = paymentScripts.validatePayment(invalidPayment);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('address'))).toBe(true);
    });

    it('should detect invalid block parameters', () => {
      const invalidPayment: IndividualPayment = {
        torrentHash: '1234567890abcdef1234567890abcdef12345678',
        recipientAddress: recipientAddress,
        blockIndex: -1,
        blockSize: 0,
        amount: -5,
        metadata: {}
      };

      const result = paymentScripts.validatePayment(invalidPayment);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(2);
    });

    it('should validate batch payment consistency', () => {
      const payments: IndividualPayment[] = [
        {
          torrentHash: '1234567890abcdef1234567890abcdef12345678',
          recipientAddress: recipientAddress,
          blockIndex: 0,
          blockSize: 16384,
          amount: 17,
          metadata: {}
        },
        {
          torrentHash: '1234567890abcdef1234567890abcdef12345678',
          recipientAddress: recipientAddress,
          blockIndex: 1,
          blockSize: 16384,
          amount: 17,
          metadata: {}
        }
      ];

      const batchPayment: BatchPayment = {
        payments: payments,
        recipientAddress: recipientAddress,
        totalAmount: 34,
        batchId: 'test-batch',
        metadata: {}
      };

      const result = paymentScripts.validateBatchPayment(batchPayment);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect batch payment amount mismatch', () => {
      const payments: IndividualPayment[] = [
        {
          torrentHash: '1234567890abcdef1234567890abcdef12345678',
          recipientAddress: recipientAddress,
          blockIndex: 0,
          blockSize: 16384,
          amount: 17,
          metadata: {}
        }
      ];

      const batchPayment: BatchPayment = {
        payments: payments,
        recipientAddress: recipientAddress,
        totalAmount: 50, // Incorrect total
        batchId: 'test-batch',
        metadata: {}
      };

      const result = paymentScripts.validateBatchPayment(batchPayment);

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('total amount'))).toBe(true);
    });
  });

  describe('Integration with TorrentMicropaymentManager', () => {
    it('should generate compatible payment outputs', async () => {
      const payment: IndividualPayment = {
        torrentHash: '1234567890abcdef1234567890abcdef12345678',
        recipientAddress: recipientAddress,
        blockIndex: 0,
        blockSize: 16384,
        amount: 17,
        metadata: {}
      };

      const result = await paymentScripts.processIndividualPayment(payment);

      expect(result.success).toBe(true);
      expect(result.transactionOutput).toBeDefined();

      // Should be compatible with existing P2PKH usage in TorrentMicropaymentManager
      const p2pkhScript = new P2PKH().lock(recipientAddress);
      expect(result.transactionOutput!.lockingScript.toHex()).toBe(p2pkhScript.toHex());
    });

    it('should support streaming payment workflow', async () => {
      const streamingPayments: IndividualPayment[] = Array.from({ length: 5 }, (_, i) => ({
        torrentHash: '1234567890abcdef1234567890abcdef12345678',
        recipientAddress: recipientAddress,
        blockIndex: i,
        blockSize: 16384,
        amount: 17,
        metadata: {
          paymentType: 'streaming',
          channelId: 'stream-001',
          sequenceNumber: i
        }
      }));

      const results = await Promise.all(
        streamingPayments.map(payment => paymentScripts.processIndividualPayment(payment))
      );

      // All payments should succeed
      expect(results.every(result => result.success)).toBe(true);

      // Should maintain sequence
      results.forEach((result, index) => {
        expect(result.metadata?.sequenceNumber).toBe(index);
      });
    });
  });

  describe('Performance and Efficiency', () => {
    it('should handle high-throughput payment processing', async () => {
      const startTime = Date.now();

      const payments: IndividualPayment[] = Array.from({ length: 100 }, (_, i) => ({
        torrentHash: '1234567890abcdef1234567890abcdef12345678',
        recipientAddress: recipientAddress,
        blockIndex: i,
        blockSize: 16384,
        amount: 17,
        metadata: {}
      }));

      const results = await Promise.all(
        payments.map(payment => paymentScripts.processIndividualPayment(payment))
      );

      const processingTime = Date.now() - startTime;

      expect(results.length).toBe(100);
      expect(results.every(result => result.success)).toBe(true);
      expect(processingTime).toBeLessThan(1000); // Should process within 1 second
    });

    it('should demonstrate batch efficiency benefits', async () => {
      const individualPayments: IndividualPayment[] = Array.from({ length: 10 }, (_, i) => ({
        torrentHash: '1234567890abcdef1234567890abcdef12345678',
        recipientAddress: recipientAddress,
        blockIndex: i,
        blockSize: 16384,
        amount: 17,
        metadata: {}
      }));

      // Process individually
      const individualResults = await Promise.all(
        individualPayments.map(payment => paymentScripts.processIndividualPayment(payment))
      );

      const totalIndividualSize = individualResults.reduce((sum, result) =>
        sum + (result.estimatedSize || 0), 0
      );

      // Process as batch
      const batchPayment: BatchPayment = {
        payments: individualPayments,
        recipientAddress: recipientAddress,
        totalAmount: 170,
        batchId: 'efficiency-test',
        metadata: {}
      };

      const batchResult = await paymentScripts.processBatchPayment(batchPayment);

      expect(batchResult.success).toBe(true);
      expect(batchResult.estimatedSize).toBeLessThan(totalIndividualSize);
      expect(batchResult.efficiency).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle configuration with validation disabled', async () => {
      const config: PaymentScriptConfig = {
        standardBlockSize: 16384,
        standardRate: 17,
        minPaymentAmount: 1,
        maxPaymentAmount: 1000000,
        enableBatching: true,
        enableValidation: false
      };

      const unvalidatedPaymentScripts = new TorrentPaymentScripts(config);

      const invalidPayment: IndividualPayment = {
        torrentHash: 'invalid',
        recipientAddress: 'invalid',
        blockIndex: -1,
        blockSize: 0,
        amount: -5,
        metadata: {}
      };

      // Should not validate when validation is disabled
      const result = await unvalidatedPaymentScripts.processIndividualPayment(invalidPayment);
      expect(result.success).toBe(false); // Will still fail due to invalid address in script generation
    });

    it('should handle empty batch payments', async () => {
      const emptyBatch: BatchPayment = {
        payments: [],
        recipientAddress: recipientAddress,
        totalAmount: 0,
        batchId: 'empty-batch',
        metadata: {}
      };

      const result = await paymentScripts.processBatchPayment(emptyBatch);

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should handle configuration with batching disabled', async () => {
      const config: PaymentScriptConfig = {
        standardBlockSize: 16384,
        standardRate: 17,
        minPaymentAmount: 1,
        maxPaymentAmount: 1000000,
        enableBatching: false,
        enableValidation: true
      };

      const noBatchPaymentScripts = new TorrentPaymentScripts(config);

      const payments: IndividualPayment[] = [
        {
          torrentHash: '1234567890abcdef1234567890abcdef12345678',
          recipientAddress: recipientAddress,
          blockIndex: 0,
          blockSize: 16384,
          amount: 17,
          metadata: {}
        }
      ];

      const batchPayment: BatchPayment = {
        payments: payments,
        recipientAddress: recipientAddress,
        totalAmount: 17,
        batchId: 'test-batch',
        metadata: {}
      };

      const result = await noBatchPaymentScripts.processBatchPayment(batchPayment);

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });
  });
});