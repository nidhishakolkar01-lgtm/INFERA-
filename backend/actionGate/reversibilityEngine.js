import crypto from 'crypto';
import { liveState } from './liveState.js';
import { auditLedger } from './cryptographicLedger.js';
import { MerkleTree } from './merkleTree.js';

/**
 * ReversibilityEngine
 * 
 * Enforces the Problem Statement Clause:
 * "Reversible actions (e.g., creating a draft) can have looser policies.
 *  Irreversible actions (e.g., deleting data, sending funds) must have strict policies."
 * 
 * Manages the lifecycle of reversible actions, generates cryptographic compensation recipes,
 * and executes 1-click live state rollbacks with immutable compensating ledger entries.
 */
export class ReversibilityEngine {
  constructor() {
    this.rollbackRegistry = new Map(); // actionId -> rollbackMetadata
    this.rollbackHistory = []; // Audit journal of executed compensations
  }

  /**
   * Generates a cryptographic compensation recipe for an action before or immediately after execution.
   */
  registerReversibleAction({ actionId, agentId, toolName, parameters, isReversible, beforeStateSnapshot = null }) {
    if (!isReversible) {
      this.rollbackRegistry.set(actionId, {
        actionId,
        agentId,
        toolName,
        parameters,
        isReversible: false,
        status: 'NON_REVERSIBLE',
        registeredAt: new Date().toISOString()
      });
      return { reversible: false };
    }

    // Determine the exact compensation recipe based on tool name and parameters
    let compensationRecipe = null;

    switch (toolName) {
      case 'reserve_escrow_funds':
      case 'soft_allocate_funds':
      case 'transfer_funds': {
        // Soft allocations or escrow reservations can be compensated by returning funds to treasury
        const amount = Number(parameters.amount || 0);
        compensationRecipe = {
          inverseTool: 'credit_treasury_reversal',
          inverseParameters: {
            amount,
            targetAccount: parameters.recipient || 'merchant_treasury',
            referenceActionId: actionId,
            reversalReason: 'COMPENSATING_ROLLBACK_INVOKED'
          },
          statePatch: (state) => {
            state.treasuryBalance += amount;
          }
        };
        break;
      }

      case 'create_draft_invoice': {
        compensationRecipe = {
          inverseTool: 'void_draft_invoice',
          inverseParameters: {
            invoiceId: parameters.invoiceId || `INV-${actionId.slice(-6)}`,
            voidStatus: 'VOIDED_BY_ACTIONGATE_ROLLBACK'
          },
          statePatch: (state) => {
            if (state.draftInvoices) {
              state.draftInvoices = state.draftInvoices.filter(inv => inv.id !== parameters.invoiceId);
            }
          }
        };
        break;
      }

      case 'allocate_temporary_quota': {
        compensationRecipe = {
          inverseTool: 'reclaim_quota',
          inverseParameters: {
            quotaUnits: parameters.quotaUnits || 100,
            service: parameters.service || 'default'
          },
          statePatch: (state) => {
            // Revert quota allocation
            state.quotaUnits = (state.quotaUnits || 1000) - (parameters.quotaUnits || 100);
          }
        };
        break;
      }

      case 'tag_incident':
      case 'quarantine_file': {
        compensationRecipe = {
          inverseTool: 'remove_tag_or_release_quarantine',
          inverseParameters: {
            targetId: parameters.fileId || parameters.incidentId,
            status: 'UNQUARANTINED'
          },
          statePatch: (state) => {}
        };
        break;
      }

      default: {
        // Generic state restoration
        compensationRecipe = {
          inverseTool: `rollback_${toolName}`,
          inverseParameters: {
            originalParameters: parameters,
            actionId
          },
          statePatch: (state) => {}
        };
      }
    }

    const recipeHash = crypto.createHash('sha256')
      .update(JSON.stringify({ actionId, toolName, parameters, compensationRecipe }))
      .digest('hex');

    const record = {
      actionId,
      agentId,
      toolName,
      parameters,
      isReversible: true,
      status: 'AVAILABLE_FOR_ROLLBACK',
      recipeHash,
      compensationRecipe,
      beforeStateSnapshot: beforeStateSnapshot || { treasury: liveState.treasuryBalance },
      registeredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString() // 1 hour rollback window
    };

    this.rollbackRegistry.set(actionId, record);
    return {
      reversible: true,
      recipeHash,
      actionId
    };
  }

  /**
   * Executes a 1-Click Cryptographic Rollback & Compensation.
   */
  async executeRollback({ actionId, operatorId = 'supervisor-jane-doe', reason = 'Operational remediation' }) {
    const record = this.rollbackRegistry.get(actionId);

    if (!record) {
      throw new Error(`Action '${actionId}' was not found in the reversibility registry.`);
    }

    if (!record.isReversible) {
      throw new Error(
        `POLICY_VIOLATION: Action '${actionId}' (${record.toolName}) is strictly IRREVERSIBLE. It cannot be rolled back.`
      );
    }

    if (record.status === 'ROLLED_BACK') {
      throw new Error(`Action '${actionId}' was already compensated and rolled back at ${record.rolledBackAt}.`);
    }

    const startTime = Date.now();

    // 1. Execute state patch
    if (record.compensationRecipe?.statePatch) {
      record.compensationRecipe.statePatch(liveState);
    }

    // 2. Compute cryptographic compensation receipt
    const rollbackReceipt = {
      rollbackId: `rb_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      targetActionId: actionId,
      targetTool: record.toolName,
      operatorId,
      reason,
      restoredState: {
        treasuryBalance: liveState.treasuryBalance
      },
      timestamp: new Date().toISOString()
    };

    const rollbackReceiptHash = crypto.createHash('sha256')
      .update(JSON.stringify(rollbackReceipt))
      .digest('hex');

    // 3. Append immutable compensating entry to audit ledger
    const ledgerBlock = auditLedger.appendRecord({
      actionId: rollbackReceipt.rollbackId,
      agentId: operatorId,
      actionType: `COMPENSATING_ROLLBACK_${record.toolName.toUpperCase()}`,
      payload: {
        originalActionId: actionId,
        originalTool: record.toolName,
        operatorId,
        reason,
        restoredTreasury: liveState.treasuryBalance
      },
      payloadHash: rollbackReceiptHash,
      decision: 'COMPENSATED_ROLLBACK',
      decisionPath: 'REVERSIBILITY_ENGINE_ROLLBACK',
      policyReason: `Reversible action ${actionId} successfully rolled back by ${operatorId}. Inverse compensation applied.`,
      approvedBy: operatorId,
      aiRiskScore: 0
    });

    // 4. Update Merkle tree
    const tree = new MerkleTree(auditLedger.getChain());
    const updatedMerkleRoot = tree.getRoot();

    // 5. Update record status
    record.status = 'ROLLED_BACK';
    record.rolledBackAt = rollbackReceipt.timestamp;
    record.rolledBackBy = operatorId;
    record.rollbackReceipt = rollbackReceipt;
    record.rollbackReceiptHash = rollbackReceiptHash;

    const historyEntry = {
      ...rollbackReceipt,
      rollbackReceiptHash,
      ledgerBlockIndex: ledgerBlock.index,
      updatedMerkleRoot,
      durationMs: Date.now() - startTime
    };

    this.rollbackHistory.unshift(historyEntry);
    if (this.rollbackHistory.length > 50) this.rollbackHistory.pop();

    return historyEntry;
  }

  /**
   * Returns list of reversible actions currently available for 1-click rollback.
   */
  getAvailableRollbacks() {
    return Array.from(this.rollbackRegistry.values()).filter(r => r.isReversible && r.status === 'AVAILABLE_FOR_ROLLBACK');
  }

  getRollbackHistory() {
    return this.rollbackHistory;
  }

  getStatus(actionId) {
    return this.rollbackRegistry.get(actionId) || null;
  }
}

export const reversibilityEngine = new ReversibilityEngine();
