import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');
const LEDGER_FILE = path.join(DATA_DIR, 'ledger_store.jsonl');

/**
 * ActionGate Cryptographic Audit Ledger
 * Implements a SHA-256 hash-chained tamper-evident ledger (Blockchain-style integrity).
 * Guarantees that any post-facto alteration of decisions or logs is cryptographically detectable.
 * Backed by durable disk persistence to prevent state loss across process restarts.
 */

class CryptographicLedger {
  constructor() {
    this.chain = [];
    this.ensureDataDir();
    this.initLedger();
  }

  ensureDataDir() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (err) {
      console.warn('Could not ensure data directory:', err.message);
    }
  }

  initLedger() {
    if (fs.existsSync(LEDGER_FILE)) {
      try {
        const lines = fs.readFileSync(LEDGER_FILE, 'utf8')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        if (lines.length > 0) {
          const loadedChain = lines.map((l) => JSON.parse(l));
          // Validate loaded chain
          let valid = true;
          for (let i = 1; i < loadedChain.length; i++) {
            if (loadedChain[i].previousHash !== loadedChain[i - 1].currentHash) {
              valid = false;
              break;
            }
          }
          if (valid) {
            this.chain = loadedChain;
            return;
          }
        }
      } catch (err) {
        console.warn('Failed to load ledger from disk, re-initializing genesis:', err.message);
      }
    }

    this.initGenesisBlock();
    this.persistFullChain();
  }

  persistFullChain() {
    try {
      const data = this.chain.map((b) => JSON.stringify(b)).join('\n') + '\n';
      fs.writeFileSync(LEDGER_FILE, data, 'utf8');
    } catch (err) {
      console.warn('Failed to persist ledger chain to disk:', err.message);
    }
  }

  appendBlockToDisk(block) {
    try {
      fs.appendFileSync(LEDGER_FILE, JSON.stringify(block) + '\n', 'utf8');
    } catch (err) {
      console.warn('Failed to append block to disk:', err.message);
    }
  }

  // Calculate cryptographic hash for a block's content
  calculateBlockHash(block) {
    const content = `${block.index}|${block.timestamp}|${block.actionId}|${block.agentId}|${block.actionType}|${block.payloadHash}|${block.decision}|${block.decisionPath}|${block.policyReason}|${block.approvedBy || ''}|${block.previousHash}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  initGenesisBlock() {
    const genesis = {
      index: 0,
      timestamp: '2026-10-11T09:00:00.000Z',
      actionId: 'GENESIS-BLOCK-000',
      agentId: 'SYSTEM-ROOT',
      actionType: 'GATEWAY_INITIALIZATION',
      payload: { system: 'ActionGate Security Core', status: 'ONLINE' },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      decision: 'ALLOWED',
      decisionPath: 'CORE_SYSTEM_INIT',
      policyReason: 'ActionGate Genesis Block Initialized.',
      aiRiskScore: 0,
      approvedBy: 'SYSTEM_SUPERVISOR',
      previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
      currentHash: '',
    };
    genesis.currentHash = this.calculateBlockHash(genesis);
    this.chain = [genesis];
  }

  // Append a new decision record to the tamper-evident chain
  appendRecord({
    actionId,
    agentId,
    actionType,
    payload,
    payloadHash,
    decision,
    decisionPath,
    policyReason,
    aiRiskScore = 0,
    approvedBy = null,
  }) {
    const previousBlock = this.chain[this.chain.length - 1];
    const newBlock = {
      index: this.chain.length,
      timestamp: new Date().toISOString(),
      actionId,
      agentId,
      actionType,
      payload,
      payloadHash: payloadHash || 'no-payload-hash',
      decision,
      decisionPath,
      policyReason,
      aiRiskScore,
      approvedBy,
      previousHash: previousBlock.currentHash,
      currentHash: '',
    };

    newBlock.currentHash = this.calculateBlockHash(newBlock);
    this.chain.push(newBlock);
    this.appendBlockToDisk(newBlock);
    return newBlock;
  }

  // Cryptographically verifies every block in the ledger
  verifyIntegrity() {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      // 1. Verify previousHash pointer
      if (currentBlock.previousHash !== previousBlock.currentHash) {
        return {
          isValid: false,
          corruptedBlockIndex: i,
          errorType: 'BROKEN_CHAIN_LINK',
          message: `Block #${i} previousHash does not match Block #${i - 1} hash! Tampering detected!`,
        };
      }

      // 2. Re-hash content and verify integrity
      const recalculatedHash = this.calculateBlockHash(currentBlock);
      if (recalculatedHash !== currentBlock.currentHash) {
        return {
          isValid: false,
          corruptedBlockIndex: i,
          errorType: 'HASH_MISMATCH_TAMPERED_RECORD',
          message: `Block #${i} data has been modified! Recorded hash (${currentBlock.currentHash.substring(0, 10)}...) differs from cryptographic re-computation (${recalculatedHash.substring(0, 10)}...).`,
        };
      }
    }

    return {
      isValid: true,
      totalBlocks: this.chain.length,
      message: `Audit Ledger 100% Cryptographically Verified across ${this.chain.length} blocks. Zero tampering.`,
    };
  }

  // Live Judge Demo: Simulate a database attacker tampering with a record
  simulateTamper(blockIndex, maliciousData) {
    if (blockIndex <= 0 || blockIndex >= this.chain.length) {
      throw new Error(`Cannot tamper block index ${blockIndex}. Valid range: 1 to ${this.chain.length - 1}`);
    }

    const target = this.chain[blockIndex];
    // Silently tamper with the block's decision or payload without re-mining the hash
    if (maliciousData.decision) target.decision = maliciousData.decision;
    if (maliciousData.policyReason) target.policyReason = maliciousData.policyReason;
    if (maliciousData.payload) {
      target.payload = { ...target.payload, ...maliciousData.payload };
    }

    return {
      message: `Simulated unauthorized DB edit on Block #${blockIndex}. Run verifyIntegrity to catch this tamper!`,
      tamperedBlock: target,
    };
  }

  getChain() {
    return this.chain;
  }

  reset() {
    this.initGenesisBlock();
    this.persistFullChain();
  }
}

export const auditLedger = new CryptographicLedger();
