/**
 * TorrentScriptTemplates Test Suite
 * Comprehensive TDD test suite for custom BSV script templates for torrent payments
 */

import { PrivateKey, PublicKey, Transaction, LockingScript, UnlockingScript, OP } from '@bsv/sdk';
import { jest } from '@jest/globals';
import {
  TorrentScriptTemplates,
  StreamingMicropaymentTemplate,
  MultiSigEscrowTemplate,
  TimeLockedPaymentTemplate,
  ReputationBasedTemplate,
  PeerIncentiveTemplate,
  StreamingMicropaymentParams,
  MultiSigEscrowParams,
  TimeLockedPaymentParams,
  ReputationBasedParams,
  PeerIncentiveParams,
  ScriptExecutionResult,
  PaymentCondition,
  ReputationThreshold,
  TimeConstraint
} from '../../../lib/scripts/torrent-script-templates';
import BSVTestUtils from '../../utils/bsv-test-utils';

describe('TorrentScriptTemplates', () => {
  let testPrivateKey: PrivateKey;
  let testPublicKey: PublicKey;
  let peerPrivateKey: PrivateKey;
  let peerPublicKey: PublicKey;
  let templates: TorrentScriptTemplates;

  beforeEach(() => {
    testPrivateKey = BSVTestUtils.generateTestPrivateKey('test-user');
    testPublicKey = testPrivateKey.toPublicKey();
    peerPrivateKey = BSVTestUtils.generateTestPrivateKey('test-peer');
    peerPublicKey = peerPrivateKey.toPublicKey();
    templates = new TorrentScriptTemplates();
  });

  describe('StreamingMicropaymentTemplate', () => {
    let streamingTemplate: StreamingMicropaymentTemplate;
    let streamingParams: StreamingMicropaymentParams;

    beforeEach(() => {
      streamingParams = {
        recipientPubKey: testPublicKey,
        paymentPerBlock: 17, // 17 sats per 16KB
        blockSize: 16384, // 16KB standard block
        torrentHash: 'a'.repeat(40),
        blockIndex: 0,
        channelId: 'test-channel-123',
        minConfirmations: 1
      };
      streamingTemplate = new StreamingMicropaymentTemplate(streamingParams);
    });

    describe('Constructor', () => {
      it('should create streaming micropayment template with valid parameters', () => {
        expect(streamingTemplate).toBeInstanceOf(StreamingMicropaymentTemplate);
        expect(streamingTemplate.getParams()).toEqual(streamingParams);
      });

      it('should throw error for invalid payment amount', () => {
        expect(() => {
          new StreamingMicropaymentTemplate({
            ...streamingParams,
            paymentPerBlock: 0
          });
        }).toThrow('Payment per block must be positive');
      });

      it('should throw error for invalid block size', () => {
        expect(() => {
          new StreamingMicropaymentTemplate({
            ...streamingParams,
            blockSize: 0
          });
        }).toThrow('Block size must be positive');
      });

      it('should throw error for invalid torrent hash', () => {
        expect(() => {
          new StreamingMicropaymentTemplate({
            ...streamingParams,
            torrentHash: 'invalid-hash'
          });
        }).toThrow('Invalid torrent hash format');
      });
    });

    describe('Script Generation', () => {
      it('should generate valid locking script for streaming payments', () => {
        const lockingScript = streamingTemplate.lock();

        expect(lockingScript).toBeInstanceOf(LockingScript);
        expect(lockingScript.toHex()).toBeDefined();
        expect(lockingScript.chunks.length).toBeGreaterThan(0);
      });

      it('should include payment verification in locking script', () => {
        const lockingScript = streamingTemplate.lock();
        const scriptHex = lockingScript.toHex();

        // Should contain recipient public key hash
        expect(scriptHex).toContain(testPublicKey.toHash().toString('hex').slice(0, 20));

        // Should contain payment amount verification
        expect(lockingScript.chunks.some(chunk =>
          chunk.op === streamingParams.paymentPerBlock
        )).toBe(true);
      });

      it('should generate valid unlocking script', () => {
        const unlockingTemplate = streamingTemplate.unlock(testPrivateKey, streamingParams);

        expect(unlockingTemplate.sign).toBeDefined();
        expect(unlockingTemplate.estimateLength).toBeDefined();
        expect(typeof unlockingTemplate.estimateLength).toBe('function');
      });

      it('should estimate reasonable script length', async () => {
        const unlockingTemplate = streamingTemplate.unlock(testPrivateKey, streamingParams);
        const estimatedLength = await unlockingTemplate.estimateLength();

        expect(estimatedLength).toBeGreaterThan(0);
        expect(estimatedLength).toBeLessThan(1000); // Reasonable upper bound
      });
    });

    describe('Script Execution', () => {
      it('should create executable transaction input/output pair', async () => {
        const tx = new Transaction();

        // Add output with locking script
        tx.addOutput({
          lockingScript: streamingTemplate.lock(),
          satoshis: streamingParams.paymentPerBlock
        });

        // Create input that spends this output
        const unlockingTemplate = streamingTemplate.unlock(testPrivateKey, streamingParams);
        const unlockingScript = await unlockingTemplate.sign(tx, 0);

        expect(unlockingScript).toBeInstanceOf(UnlockingScript);
      });

      it('should validate correct payment amount', () => {
        const result = streamingTemplate.validatePayment({
          amount: streamingParams.paymentPerBlock,
          blockIndex: streamingParams.blockIndex,
          channelId: streamingParams.channelId
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject incorrect payment amount', () => {
        const result = streamingTemplate.validatePayment({
          amount: streamingParams.paymentPerBlock - 1,
          blockIndex: streamingParams.blockIndex,
          channelId: streamingParams.channelId
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Insufficient payment amount');
      });

      it('should validate block progression', () => {
        const result = streamingTemplate.validateBlockProgression(0, 1);
        expect(result).toBe(true);

        const invalidResult = streamingTemplate.validateBlockProgression(1, 0);
        expect(invalidResult).toBe(false);
      });
    });

    describe('Channel Integration', () => {
      it('should support channel balance tracking', () => {
        const initialBalance = 1000;
        streamingTemplate.initializeChannel(streamingParams.channelId, initialBalance);

        expect(streamingTemplate.getChannelBalance(streamingParams.channelId)).toBe(initialBalance);
      });

      it('should deduct payments from channel balance', () => {
        const initialBalance = 1000;
        streamingTemplate.initializeChannel(streamingParams.channelId, initialBalance);

        streamingTemplate.processChannelPayment(streamingParams.channelId, streamingParams.paymentPerBlock);

        expect(streamingTemplate.getChannelBalance(streamingParams.channelId))
          .toBe(initialBalance - streamingParams.paymentPerBlock);
      });

      it('should reject payment when insufficient balance', () => {
        const initialBalance = 10; // Less than payment amount
        streamingTemplate.initializeChannel(streamingParams.channelId, initialBalance);

        expect(() => {
          streamingTemplate.processChannelPayment(streamingParams.channelId, streamingParams.paymentPerBlock);
        }).toThrow('Insufficient channel balance');
      });
    });
  });

  describe('MultiSigEscrowTemplate', () => {
    let escrowTemplate: MultiSigEscrowTemplate;
    let escrowParams: MultiSigEscrowParams;
    let mediatorPrivateKey: PrivateKey;
    let mediatorPublicKey: PublicKey;

    beforeEach(() => {
      mediatorPrivateKey = BSVTestUtils.generateTestPrivateKey('mediator');
      mediatorPublicKey = mediatorPrivateKey.toPublicKey();

      escrowParams = {
        payerPubKey: testPublicKey,
        payeePubKey: peerPublicKey,
        mediatorPubKey: mediatorPublicKey,
        amount: 100000, // 100,000 sats for large file
        timeout: 86400, // 24 hours
        torrentHash: 'b'.repeat(40),
        fileSize: 104857600, // 100MB
        requiredSignatures: 2
      };
      escrowTemplate = new MultiSigEscrowTemplate(escrowParams);
    });

    describe('Constructor', () => {
      it('should create multi-sig escrow template with valid parameters', () => {
        expect(escrowTemplate).toBeInstanceOf(MultiSigEscrowTemplate);
        expect(escrowTemplate.getParams()).toEqual(escrowParams);
      });

      it('should throw error for invalid signature requirement', () => {
        expect(() => {
          new MultiSigEscrowTemplate({
            ...escrowParams,
            requiredSignatures: 4 // More than available keys
          });
        }).toThrow('Required signatures cannot exceed available keys');
      });

      it('should throw error for zero amount', () => {
        expect(() => {
          new MultiSigEscrowTemplate({
            ...escrowParams,
            amount: 0
          });
        }).toThrow('Escrow amount must be positive');
      });
    });

    describe('Script Generation', () => {
      it('should generate multi-signature locking script', () => {
        const lockingScript = escrowTemplate.lock();

        expect(lockingScript).toBeInstanceOf(LockingScript);

        // Should contain all three public keys
        const scriptHex = lockingScript.toHex();
        expect(scriptHex).toContain(testPublicKey.toString());
        expect(scriptHex).toContain(peerPublicKey.toString());
        expect(scriptHex).toContain(mediatorPublicKey.toString());
      });

      it('should create unlock template for successful completion', () => {
        const unlockingTemplate = escrowTemplate.unlockOnCompletion(
          testPrivateKey,
          peerPrivateKey
        );

        expect(unlockingTemplate.sign).toBeDefined();
        expect(unlockingTemplate.estimateLength).toBeDefined();
      });

      it('should create unlock template for timeout refund', () => {
        const unlockingTemplate = escrowTemplate.unlockOnTimeout(
          testPrivateKey,
          mediatorPrivateKey
        );

        expect(unlockingTemplate.sign).toBeDefined();
      });

      it('should create unlock template for dispute resolution', () => {
        const unlockingTemplate = escrowTemplate.unlockOnDispute(
          mediatorPrivateKey,
          peerPrivateKey, // Mediator decides in favor of payee
          true
        );

        expect(unlockingTemplate.sign).toBeDefined();
      });
    });

    describe('Escrow State Management', () => {
      it('should track escrow creation', () => {
        const escrowId = escrowTemplate.createEscrow();

        expect(escrowId).toBeDefined();
        expect(escrowTemplate.getEscrowState(escrowId).status).toBe('created');
      });

      it('should update escrow state on funding', () => {
        const escrowId = escrowTemplate.createEscrow();
        escrowTemplate.fundEscrow(escrowId, 'funding-txid');

        expect(escrowTemplate.getEscrowState(escrowId).status).toBe('funded');
        expect(escrowTemplate.getEscrowState(escrowId).fundingTxId).toBe('funding-txid');
      });

      it('should complete escrow successfully', () => {
        const escrowId = escrowTemplate.createEscrow();
        escrowTemplate.fundEscrow(escrowId, 'funding-txid');
        escrowTemplate.completeEscrow(escrowId, 'completion-txid');

        expect(escrowTemplate.getEscrowState(escrowId).status).toBe('completed');
      });

      it('should handle escrow timeout', () => {
        const escrowId = escrowTemplate.createEscrow();
        escrowTemplate.fundEscrow(escrowId, 'funding-txid');

        // Simulate timeout
        const timeoutResult = escrowTemplate.checkTimeout(escrowId);
        expect(timeoutResult.timedOut).toBe(false); // Should not be timed out immediately

        // Simulate passage of time
        escrowTemplate.simulateTimeoutForTesting(escrowId);
        const timeoutResult2 = escrowTemplate.checkTimeout(escrowId);
        expect(timeoutResult2.timedOut).toBe(true);
      });
    });

    describe('File Transfer Validation', () => {
      it('should validate file transfer completion', () => {
        const validation = escrowTemplate.validateFileTransfer({
          expectedSize: escrowParams.fileSize,
          actualSize: escrowParams.fileSize,
          checksumExpected: 'expected-checksum',
          checksumActual: 'expected-checksum'
        });

        expect(validation.valid).toBe(true);
      });

      it('should reject file transfer with size mismatch', () => {
        const validation = escrowTemplate.validateFileTransfer({
          expectedSize: escrowParams.fileSize,
          actualSize: escrowParams.fileSize / 2,
          checksumExpected: 'expected-checksum',
          checksumActual: 'expected-checksum'
        });

        expect(validation.valid).toBe(false);
        expect(validation.errors).toContain('File size mismatch');
      });

      it('should reject file transfer with checksum mismatch', () => {
        const validation = escrowTemplate.validateFileTransfer({
          expectedSize: escrowParams.fileSize,
          actualSize: escrowParams.fileSize,
          checksumExpected: 'expected-checksum',
          checksumActual: 'wrong-checksum'
        });

        expect(validation.valid).toBe(false);
        expect(validation.errors).toContain('Checksum mismatch');
      });
    });
  });

  describe('TimeLockedPaymentTemplate', () => {
    let timeLockedTemplate: TimeLockedPaymentTemplate;
    let timeLockedParams: TimeLockedPaymentParams;

    beforeEach(() => {
      timeLockedParams = {
        recipientPubKey: testPublicKey,
        amount: 50000,
        lockTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        torrentHash: 'c'.repeat(40),
        commitmentType: 'download_completion',
        penaltyAmount: 5000,
        refundPubKey: peerPublicKey
      };
      timeLockedTemplate = new TimeLockedPaymentTemplate(timeLockedParams);
    });

    describe('Constructor', () => {
      it('should create time-locked payment template', () => {
        expect(timeLockedTemplate).toBeInstanceOf(TimeLockedPaymentTemplate);
        expect(timeLockedTemplate.getParams()).toEqual(timeLockedParams);
      });

      it('should throw error for past lock time', () => {
        expect(() => {
          new TimeLockedPaymentTemplate({
            ...timeLockedParams,
            lockTime: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
          });
        }).toThrow('Lock time must be in the future');
      });

      it('should throw error for invalid penalty amount', () => {
        expect(() => {
          new TimeLockedPaymentTemplate({
            ...timeLockedParams,
            penaltyAmount: timeLockedParams.amount + 1 // Penalty exceeds amount
          });
        }).toThrow('Penalty amount cannot exceed payment amount');
      });
    });

    describe('Time Lock Mechanics', () => {
      it('should generate time-locked locking script', () => {
        const lockingScript = timeLockedTemplate.lock();

        expect(lockingScript).toBeInstanceOf(LockingScript);

        // Should contain CHECKLOCKTIMEVERIFY operation
        expect(lockingScript.chunks.some(chunk =>
          chunk.op === OP.OP_CHECKLOCKTIMEVERIFY
        )).toBe(true);
      });

      it('should create early unlock template with penalty', () => {
        const unlockingTemplate = timeLockedTemplate.unlockEarly(testPrivateKey);

        expect(unlockingTemplate.sign).toBeDefined();
        expect(unlockingTemplate.estimateLength).toBeDefined();
      });

      it('should create normal unlock template after timeout', () => {
        const unlockingTemplate = timeLockedTemplate.unlockAfterTimeout(testPrivateKey);

        expect(unlockingTemplate.sign).toBeDefined();
      });

      it('should validate time constraints', () => {
        const currentTime = Math.floor(Date.now() / 1000);

        // Should not be unlockable before lock time
        expect(timeLockedTemplate.canUnlockNow(currentTime)).toBe(false);

        // Should be unlockable after lock time
        expect(timeLockedTemplate.canUnlockNow(timeLockedParams.lockTime + 1)).toBe(true);
      });
    });

    describe('Commitment Tracking', () => {
      it('should track download commitment progress', () => {
        const commitmentId = timeLockedTemplate.createCommitment();

        expect(commitmentId).toBeDefined();
        expect(timeLockedTemplate.getCommitmentStatus(commitmentId)).toBe('active');
      });

      it('should update commitment on progress', () => {
        const commitmentId = timeLockedTemplate.createCommitment();
        timeLockedTemplate.updateProgress(commitmentId, 50); // 50% complete

        expect(timeLockedTemplate.getProgress(commitmentId)).toBe(50);
      });

      it('should complete commitment successfully', () => {
        const commitmentId = timeLockedTemplate.createCommitment();
        timeLockedTemplate.updateProgress(commitmentId, 100);
        timeLockedTemplate.completeCommitment(commitmentId);

        expect(timeLockedTemplate.getCommitmentStatus(commitmentId)).toBe('completed');
      });

      it('should calculate penalty for early withdrawal', () => {
        const commitmentId = timeLockedTemplate.createCommitment();
        timeLockedTemplate.updateProgress(commitmentId, 30); // 30% complete

        const penalty = timeLockedTemplate.calculatePenalty(commitmentId);
        expect(penalty).toBeGreaterThan(0);
        expect(penalty).toBeLessThanOrEqual(timeLockedParams.penaltyAmount);
      });
    });
  });

  describe('ReputationBasedTemplate', () => {
    let reputationTemplate: ReputationBasedTemplate;
    let reputationParams: ReputationBasedParams;

    beforeEach(() => {
      reputationParams = {
        recipientPubKey: testPublicKey,
        basePayment: 20,
        reputationMultiplier: 1.5,
        minReputation: 50,
        maxReputation: 100,
        currentReputation: 75,
        torrentHash: 'd'.repeat(40),
        performanceMetrics: {
          uploadSpeed: 1000000, // 1 MB/s
          reliability: 0.95,
          latency: 50 // ms
        }
      };
      reputationTemplate = new ReputationBasedTemplate(reputationParams);
    });

    describe('Constructor', () => {
      it('should create reputation-based payment template', () => {
        expect(reputationTemplate).toBeInstanceOf(ReputationBasedTemplate);
        expect(reputationTemplate.getParams()).toEqual(reputationParams);
      });

      it('should throw error for invalid reputation range', () => {
        expect(() => {
          new ReputationBasedTemplate({
            ...reputationParams,
            minReputation: 80,
            maxReputation: 70 // Max less than min
          });
        }).toThrow('Maximum reputation must be greater than minimum');
      });

      it('should throw error for reputation outside range', () => {
        expect(() => {
          new ReputationBasedTemplate({
            ...reputationParams,
            currentReputation: 110 // Above max
          });
        }).toThrow('Current reputation must be within specified range');
      });
    });

    describe('Reputation Calculation', () => {
      it('should calculate payment based on reputation', () => {
        const payment = reputationTemplate.calculatePayment();
        const expectedPayment = Math.floor(
          reputationParams.basePayment *
          (reputationParams.currentReputation / 100) *
          reputationParams.reputationMultiplier
        );

        expect(payment).toBe(expectedPayment);
      });

      it('should apply performance bonuses', () => {
        const bonuses = reputationTemplate.calculatePerformanceBonuses();

        expect(bonuses.speedBonus).toBeGreaterThan(0);
        expect(bonuses.reliabilityBonus).toBeGreaterThan(0);
        expect(bonuses.latencyPenalty).toBeGreaterThanOrEqual(0);
      });

      it('should generate reputation-aware locking script', () => {
        const lockingScript = reputationTemplate.lock();

        expect(lockingScript).toBeInstanceOf(LockingScript);

        // Should include reputation verification
        const scriptHex = lockingScript.toHex();
        expect(scriptHex.length).toBeGreaterThan(0);
      });

      it('should validate reputation thresholds', () => {
        const validation = reputationTemplate.validateReputation({
          currentReputation: 80,
          requiredMinimum: 50,
          performanceScore: 0.9
        });

        expect(validation.valid).toBe(true);
        expect(validation.qualifiesForBonus).toBe(true);
      });

      it('should reject payment for low reputation', () => {
        const validation = reputationTemplate.validateReputation({
          currentReputation: 30, // Below minimum
          requiredMinimum: 50,
          performanceScore: 0.9
        });

        expect(validation.valid).toBe(false);
        expect(validation.errors).toContain('Reputation below minimum threshold');
      });
    });

    describe('Performance Metrics', () => {
      it('should track peer performance over time', () => {
        reputationTemplate.recordPerformance({
          timestamp: Date.now(),
          uploadSpeed: 2000000,
          reliability: 0.98,
          latency: 30
        });

        const metrics = reputationTemplate.getPerformanceHistory();
        expect(metrics.length).toBe(1);
        expect(metrics[0].uploadSpeed).toBe(2000000);
      });

      it('should calculate rolling averages', () => {
        // Record multiple performance samples
        for (let i = 0; i < 5; i++) {
          reputationTemplate.recordPerformance({
            timestamp: Date.now() - (i * 1000),
            uploadSpeed: 1000000 + (i * 100000),
            reliability: 0.9 + (i * 0.01),
            latency: 50 - (i * 5)
          });
        }

        const averages = reputationTemplate.getRollingAverages(5);
        expect(averages.avgUploadSpeed).toBeGreaterThan(0);
        expect(averages.avgReliability).toBeGreaterThan(0);
        expect(averages.avgLatency).toBeGreaterThan(0);
      });

      it('should update reputation based on performance', () => {
        const initialReputation = reputationParams.currentReputation;

        // Record excellent performance
        reputationTemplate.recordPerformance({
          timestamp: Date.now(),
          uploadSpeed: 5000000, // 5 MB/s
          reliability: 1.0,
          latency: 10
        });

        reputationTemplate.updateReputationFromPerformance();
        const newReputation = reputationTemplate.getCurrentReputation();

        expect(newReputation).toBeGreaterThan(initialReputation);
      });
    });
  });

  describe('PeerIncentiveTemplate', () => {
    let incentiveTemplate: PeerIncentiveTemplate;
    let incentiveParams: PeerIncentiveParams;

    beforeEach(() => {
      incentiveParams = {
        discovererPubKey: testPublicKey,
        peerPubKey: peerPublicKey,
        baseIncentive: 100,
        discoveryType: 'overlay_network',
        networkContribution: 0.8,
        torrentHash: 'e'.repeat(40),
        discoveryTimestamp: Date.now(),
        validityPeriod: 86400000, // 24 hours
        qualityScore: 0.9
      };
      incentiveTemplate = new PeerIncentiveTemplate(incentiveParams);
    });

    describe('Constructor', () => {
      it('should create peer incentive template', () => {
        expect(incentiveTemplate).toBeInstanceOf(PeerIncentiveTemplate);
        expect(incentiveTemplate.getParams()).toEqual(incentiveParams);
      });

      it('should throw error for invalid quality score', () => {
        expect(() => {
          new PeerIncentiveTemplate({
            ...incentiveParams,
            qualityScore: 1.5 // Above 1.0
          });
        }).toThrow('Quality score must be between 0 and 1');
      });

      it('should throw error for invalid validity period', () => {
        expect(() => {
          new PeerIncentiveTemplate({
            ...incentiveParams,
            validityPeriod: -1000
          });
        }).toThrow('Validity period must be positive');
      });
    });

    describe('Discovery Incentives', () => {
      it('should calculate discovery incentive based on quality', () => {
        const incentive = incentiveTemplate.calculateDiscoveryIncentive();
        const expectedIncentive = Math.floor(
          incentiveParams.baseIncentive *
          incentiveParams.qualityScore *
          incentiveParams.networkContribution
        );

        expect(incentive).toBe(expectedIncentive);
      });

      it('should generate discovery proof locking script', () => {
        const lockingScript = incentiveTemplate.lock();

        expect(lockingScript).toBeInstanceOf(LockingScript);

        // Should include discoverer and peer public keys
        const scriptHex = lockingScript.toHex();
        expect(scriptHex.length).toBeGreaterThan(0);
      });

      it('should validate discovery authenticity', () => {
        const validation = incentiveTemplate.validateDiscovery({
          discovererSignature: 'mock-signature',
          peerConfirmation: 'mock-confirmation',
          timestamp: incentiveParams.discoveryTimestamp,
          networkPath: ['node1', 'node2', 'node3']
        });

        expect(validation.authentic).toBe(true);
      });

      it('should reject expired discovery claims', () => {
        const expiredTemplate = new PeerIncentiveTemplate({
          ...incentiveParams,
          discoveryTimestamp: Date.now() - (48 * 60 * 60 * 1000) // 48 hours ago
        });

        const validation = expiredTemplate.validateDiscovery({
          discovererSignature: 'mock-signature',
          peerConfirmation: 'mock-confirmation',
          timestamp: incentiveParams.discoveryTimestamp - (48 * 60 * 60 * 1000),
          networkPath: ['node1', 'node2']
        });

        expect(validation.authentic).toBe(false);
        expect(validation.errors).toContain('Discovery claim has expired');
      });
    });

    describe('Network Contribution Tracking', () => {
      it('should track overlay network contributions', () => {
        incentiveTemplate.recordNetworkContribution({
          type: 'peer_introduction',
          timestamp: Date.now(),
          contributionValue: 0.2,
          verificationProof: 'mock-proof'
        });

        const contributions = incentiveTemplate.getNetworkContributions();
        expect(contributions.length).toBe(1);
        expect(contributions[0].type).toBe('peer_introduction');
      });

      it('should calculate cumulative contribution score', () => {
        // Record multiple contributions
        incentiveTemplate.recordNetworkContribution({
          type: 'peer_introduction',
          timestamp: Date.now(),
          contributionValue: 0.3,
          verificationProof: 'proof1'
        });

        incentiveTemplate.recordNetworkContribution({
          type: 'content_seeding',
          timestamp: Date.now(),
          contributionValue: 0.5,
          verificationProof: 'proof2'
        });

        const cumulativeScore = incentiveTemplate.getCumulativeContributionScore();
        expect(cumulativeScore).toBe(0.8); // 0.3 + 0.5
      });

      it('should apply time decay to old contributions', () => {
        // Record old contribution
        incentiveTemplate.recordNetworkContribution({
          type: 'peer_introduction',
          timestamp: Date.now() - (30 * 24 * 60 * 60 * 1000), // 30 days ago
          contributionValue: 0.5,
          verificationProof: 'old-proof'
        });

        const decayedScore = incentiveTemplate.getDecayedContributionScore();
        expect(decayedScore).toBeLessThan(0.5); // Should be reduced due to time decay
      });
    });

    describe('Incentive Distribution', () => {
      it('should create distribution transaction', async () => {
        const tx = new Transaction();

        // Add output for incentive payment
        const incentiveAmount = incentiveTemplate.calculateDiscoveryIncentive();
        tx.addOutput({
          lockingScript: incentiveTemplate.lock(),
          satoshis: incentiveAmount
        });

        expect(tx.outputs.length).toBe(1);
        expect(tx.outputs[0].satoshis).toBe(incentiveAmount);
      });

      it('should validate incentive claims', () => {
        const claimValidation = incentiveTemplate.validateIncentiveClaim({
          claimant: testPublicKey.toString(),
          discoveryProof: 'mock-discovery-proof',
          networkProof: 'mock-network-proof',
          timestamp: Date.now()
        });

        expect(claimValidation.valid).toBe(true);
      });

      it('should prevent double-claiming incentives', () => {
        // Process first claim
        incentiveTemplate.processIncentiveClaim('claim-id-1');

        // Attempt second claim with same ID
        expect(() => {
          incentiveTemplate.processIncentiveClaim('claim-id-1');
        }).toThrow('Incentive already claimed');
      });
    });
  });

  describe('Integration with TorrentMicropaymentManager', () => {
    let mockMicropaymentManager: any;

    beforeEach(() => {
      mockMicropaymentManager = {
        processBlockPayment: jest.fn().mockResolvedValue({
          txid: 'mock-txid',
          amount: 17,
          blockIndex: 0,
          confirmed: true,
          success: true
        }),
        createStreamingChannel: jest.fn().mockResolvedValue({
          channelId: 'test-channel',
          maxBalance: 1000,
          ratePerBlock: 17,
          status: 'open'
        })
      };
    });

    it('should integrate streaming template with micropayment manager', async () => {
      const streamingParams: StreamingMicropaymentParams = {
        recipientPubKey: testPublicKey,
        paymentPerBlock: 17,
        blockSize: 16384,
        torrentHash: 'a'.repeat(40),
        blockIndex: 0,
        channelId: 'test-channel',
        minConfirmations: 1
      };

      const template = new StreamingMicropaymentTemplate(streamingParams);

      // Simulate integration
      const result = await mockMicropaymentManager.processBlockPayment({
        torrentHash: streamingParams.torrentHash,
        userPubKey: streamingParams.recipientPubKey.toString(),
        blockIndex: streamingParams.blockIndex,
        blockSize: streamingParams.blockSize,
        ratePerBlock: streamingParams.paymentPerBlock
      });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(17);
    });

    it('should create payment channel with script template', async () => {
      const channel = await mockMicropaymentManager.createStreamingChannel({
        torrentHash: 'test-hash',
        userPubKey: testPublicKey.toString(),
        expectedBlocks: 100,
        ratePerBlock: 17,
        maxChannelBalance: 1700
      });

      expect(channel.channelId).toBeDefined();
      expect(channel.ratePerBlock).toBe(17);
    });
  });

  describe('Performance and Security', () => {
    it('should handle high-frequency micropayments efficiently', async () => {
      const streamingParams: StreamingMicropaymentParams = {
        recipientPubKey: testPublicKey,
        paymentPerBlock: 17,
        blockSize: 16384,
        torrentHash: 'f'.repeat(40),
        blockIndex: 0,
        channelId: 'performance-test',
        minConfirmations: 1
      };

      const template = new StreamingMicropaymentTemplate(streamingParams);

      const result = await BSVTestUtils.measurePerformance(async () => {
        // Simulate processing 100 micropayments
        const payments = [];
        for (let i = 0; i < 100; i++) {
          payments.push(template.validatePayment({
            amount: 17,
            blockIndex: i,
            channelId: streamingParams.channelId
          }));
        }
        return payments;
      }, 1);

      expect(result.averageTime).toBeLessThan(1000); // Should complete in under 1 second
      expect(result.result.length).toBe(100);
    });

    it('should validate script security properties', () => {
      const streamingTemplate = new StreamingMicropaymentTemplate({
        recipientPubKey: testPublicKey,
        paymentPerBlock: 17,
        blockSize: 16384,
        torrentHash: 'a'.repeat(40),
        blockIndex: 0,
        channelId: 'security-test',
        minConfirmations: 1
      });

      const securityCheck = streamingTemplate.validateScriptSecurity();

      expect(securityCheck.hasReplayProtection).toBe(true);
      expect(securityCheck.hasAmountValidation).toBe(true);
      expect(securityCheck.hasTimeoutProtection).toBe(true);
      expect(securityCheck.vulnerabilities).toHaveLength(0);
    });

    it('should resist common attack vectors', () => {
      const escrowTemplate = new MultiSigEscrowTemplate({
        payerPubKey: testPublicKey,
        payeePubKey: peerPublicKey,
        mediatorPubKey: BSVTestUtils.generateTestPrivateKey('mediator').toPublicKey(),
        amount: 100000,
        timeout: 86400,
        torrentHash: 'b'.repeat(40),
        fileSize: 104857600,
        requiredSignatures: 2
      });

      const attackResistance = escrowTemplate.validateAttackResistance();

      expect(attackResistance.resistsReplayAttacks).toBe(true);
      expect(attackResistance.resistsDoubleSpending).toBe(true);
      expect(attackResistance.resistsGriefingAttacks).toBe(true);
      expect(attackResistance.resistsTimingAttacks).toBe(true);
    });
  });
});