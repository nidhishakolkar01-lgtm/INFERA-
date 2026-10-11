import crypto from 'crypto';
import { hashPayload } from './policyEngine.js';

/**
 * ActionGate Human Approval Store & Anti-Tampering Payload Guard
 * 
 * Rules enforced:
 * 1. 4-Eyes Principle: Requester cannot approve their own action.
 * 2. Cryptographic Payload Lock: Approval applies ONLY to the exact payload approved.
 *    Any post-approval mutation triggers an immediate security alert and revokes authorization.
 */

class ApprovalStore {
  constructor() {
    this.pendingApprovals = new Map();
  }

  // Register an action that requires human supervisor authorization
  createPending({ actionId, agentId, actionType, payload, heldReason, impactLevel, aiRiskScore, decisionPath }) {
    const payloadHash = hashPayload(payload || {});
    const record = {
      actionId,
      agentId,
      actionType,
      payload,
      payloadHash,
      heldReason,
      impactLevel,
      aiRiskScore,
      decisionPath,
      status: 'PENDING_SUPERVISOR_APPROVAL',
      createdAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
    };

    this.pendingApprovals.set(actionId, record);
    return record;
  }

  // Process human approval with strict separation of duties and payload integrity verification
  approve({ actionId, approverId, executionPayload }) {
    const record = this.pendingApprovals.get(actionId);
    if (!record) {
      return {
        success: false,
        error: `Action #${actionId} not found in pending approval queue.`,
      };
    }

    if (record.status !== 'PENDING_SUPERVISOR_APPROVAL') {
      return {
        success: false,
        error: `Action #${actionId} has already been ${record.status}.`,
      };
    }

    // Rule 1: Separation of duties (Requester cannot self-approve)
    if (approverId === record.agentId) {
      return {
        success: false,
        violation: 'SELF_APPROVAL_VIOLATION',
        error: `Security Policy Violation (Separation of Duties): Requesting agent '${record.agentId}' cannot approve its own action. Requires an independent human supervisor.`,
      };
    }

    // Rule 2: Cryptographic Payload Tamper Check
    // Compare hash of payload submitted at execution time vs payload originally held
    const executionHash = hashPayload(executionPayload || record.payload);
    if (executionHash !== record.payloadHash) {
      // TAMPERING DETECTED!
      record.status = 'REVOKED_PAYLOAD_TAMPERED';
      return {
        success: false,
        violation: 'PAYLOAD_TAMPERING_DETECTED',
        error: `CRITICAL INTEGRITY VIOLATION: The action payload was altered after submission! Original Hash: [${record.payloadHash.substring(0, 10)}...] vs Execution Hash: [${executionHash.substring(0, 10)}...]. Action has been revoked and requires full re-authorization.`,
        originalPayload: record.payload,
        tamperedPayload: executionPayload,
      };
    }

    // Authorization Granted
    record.status = 'APPROVED';
    record.approvedBy = approverId;
    record.approvedAt = new Date().toISOString();

    // Generate cryptographic execution ticket
    const authorizationTicket = crypto
      .createHmac('sha256', 'actiongate-secret-key')
      .update(`${actionId}:${record.agentId}:${record.payloadHash}:${approverId}`)
      .digest('hex');

    return {
      success: true,
      actionId,
      status: 'APPROVED',
      approvedBy: approverId,
      authorizationTicket,
      message: `Action #${actionId} successfully authorized by supervisor ${approverId}.`,
    };
  }

  // Reject action
  reject({ actionId, rejectorId, reason }) {
    const record = this.pendingApprovals.get(actionId);
    if (!record) {
      return { success: false, error: `Action #${actionId} not found.` };
    }

    record.status = 'REJECTED';
    record.rejectedBy = rejectorId;
    record.rejectionReason = reason || 'Supervisor rejected the proposed action.';
    record.rejectedAt = new Date().toISOString();

    return {
      success: true,
      actionId,
      status: 'REJECTED',
      rejectedBy: rejectorId,
      reason: record.rejectionReason,
    };
  }

  getPending() {
    return Array.from(this.pendingApprovals.values()).filter(
      (item) => item.status === 'PENDING_SUPERVISOR_APPROVAL'
    );
  }

  getAll() {
    return Array.from(this.pendingApprovals.values());
  }

  reset() {
    this.pendingApprovals.clear();
  }
}

export const approvalStore = new ApprovalStore();
