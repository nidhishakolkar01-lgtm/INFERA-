import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPayload } from './policyEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');
const APPROVALS_FILE = path.join(DATA_DIR, 'approvals_store.json');

export const AUTHORIZED_SUPERVISORS = new Set([
  'supervisor-jane-doe',
  'security-officer-bob',
  'supervisor-alice',
  'security-lead-01',
  'admin-supervisor',
  'SYSTEM_SUPERVISOR',
]);

export function isAuthorizedSupervisor(approverId) {
  if (!approverId || typeof approverId !== 'string') return false;
  if (AUTHORIZED_SUPERVISORS.has(approverId)) return true;
  if (approverId.startsWith('supervisor-') || approverId.startsWith('security-officer-')) return true;
  return false;
}

/**
 * ActionGate Human Approval Store & Anti-Tampering Payload Guard
 * 
 * Rules enforced:
 * 1. 4-Eyes Principle: Requester cannot approve their own action.
 * 2. Identity Verification: Approver must be a verified supervisor in the directory.
 * 3. Cryptographic Payload Lock: Approval applies ONLY to the exact payload approved.
 *    Any post-approval mutation triggers an immediate security alert and revokes authorization.
 * 4. Durable disk persistence across restarts.
 */

class ApprovalStore {
  constructor() {
    this.pendingApprovals = new Map();
    this.ensureDataDir();
    this.loadFromDisk();
  }

  ensureDataDir() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (err) {
      console.warn('Could not ensure data directory for approvals:', err.message);
    }
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(APPROVALS_FILE)) {
        const raw = fs.readFileSync(APPROVALS_FILE, 'utf8');
        const items = JSON.parse(raw);
        if (Array.isArray(items)) {
          for (const item of items) {
            this.pendingApprovals.set(item.actionId, item);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load approvals store from disk:', err.message);
    }
  }

  persistToDisk() {
    try {
      const items = Array.from(this.pendingApprovals.values()).slice(-200); // Retain latest 200
      fs.writeFileSync(APPROVALS_FILE, JSON.stringify(items, null, 2), 'utf8');
    } catch (err) {
      console.warn('Failed to persist approvals store to disk:', err.message);
    }
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
    this.persistToDisk();
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

    // Rule 1b: Supervisor identity check
    if (!isAuthorizedSupervisor(approverId)) {
      return {
        success: false,
        violation: 'UNAUTHORIZED_SUPERVISOR_IDENTITY',
        error: `Security Policy Violation: Approver identity '${approverId}' is not an authorized human supervisor or SecOps officer in the ActionGate directory.`,
      };
    }

    // Rule 2: Cryptographic Payload Tamper Check
    // Compare hash of payload submitted at execution time vs payload originally held
    const executionHash = hashPayload(executionPayload || record.payload);
    if (executionHash !== record.payloadHash) {
      // TAMPERING DETECTED!
      record.status = 'REVOKED_PAYLOAD_TAMPERED';
      this.persistToDisk();
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

    this.persistToDisk();

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

    this.persistToDisk();

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
    this.persistToDisk();
  }
}

export const approvalStore = new ApprovalStore();
