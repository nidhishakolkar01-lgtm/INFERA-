import crypto from 'crypto';

// Default Trusted Agents Registry
const DEFAULT_KNOWN_AGENTS = {
  'finance-agent-01': {
    name: 'Finance & Billing Agent',
    department: 'Finance',
    trustTier: 'TIER_2',
    allowedActions: ['issue_refund', 'transfer_funds', 'reserve_escrow_funds', 'fetch_invoice', 'read_account_summary'],
  },
  'support-bot-alpha': {
    name: 'Customer Support Bot',
    department: 'Support',
    trustTier: 'TIER_1',
    allowedActions: ['read_account_summary', 'fetch_invoice', 'send_customer_email', 'update_ticket_status'],
  },
  'ops-maintenance-agent': {
    name: 'Cloud Infrastructure Ops',
    department: 'Infrastructure',
    trustTier: 'TIER_3',
    allowedActions: ['restart_service', 'clear_cache', 'backup_database', 'archive_old_logs', 'read_system_telemetry'],
  },
};

// Default Recognized Actions Catalog
const DEFAULT_ACTION_CATALOG = {
  'reserve_escrow_funds': {
    description: 'Soft reserve escrow funds for pending settlement',
    category: 'FINANCIAL',
    impactLevel: 'LOW',
    isReversible: true,
    requiresHumanApproval: false,
    maxRecordsAffected: 1,
  },
  'read_system_telemetry': {
    description: 'Read real-time CPU, memory, and host process metrics',
    category: 'READ',
    impactLevel: 'LOW',
    isReversible: true,
    requiresHumanApproval: false,
    maxRecordsAffected: 1,
  },
  'read_account_summary': {
    description: 'Fetch customer profile and non-sensitive balance summary',
    category: 'READ',
    impactLevel: 'LOW',
    isReversible: true,
    requiresHumanApproval: false,
    maxRecordsAffected: 1,
  },
  'fetch_invoice': {
    description: 'Retrieve PDF/record of a historical customer invoice',
    category: 'READ',
    impactLevel: 'LOW',
    isReversible: true,
    requiresHumanApproval: false,
    maxRecordsAffected: 5,
  },
  'send_customer_email': {
    description: 'Send direct customer correspondence email',
    category: 'EXTERNAL_COMMS',
    impactLevel: 'MEDIUM',
    isReversible: false,
    requiresHumanApproval: false,
    maxRecordsAffected: 1,
  },
  'issue_refund': {
    description: 'Refund customer transaction from merchant account',
    category: 'FINANCIAL',
    impactLevel: 'HIGH',
    isReversible: false,
    requiresHumanApproval: true,
  },
  'transfer_funds': {
    description: 'Direct wire or ACH funds transfer between accounts',
    category: 'FINANCIAL',
    impactLevel: 'HIGH',
    isReversible: false,
    requiresHumanApproval: true,
  },
  'update_ticket_status': {
    description: 'Update support ticket workflow state',
    category: 'WORKFLOW',
    impactLevel: 'LOW',
    isReversible: true,
    requiresHumanApproval: false,
    maxRecordsAffected: 1,
  },
  'restart_service': {
    description: 'Gracefully restart a secondary worker service',
    category: 'INFRASTRUCTURE',
    impactLevel: 'MEDIUM',
    isReversible: true,
    requiresHumanApproval: false,
  },
  'clear_cache': {
    description: 'Flush Redis application cache key namespaces',
    category: 'INFRASTRUCTURE',
    impactLevel: 'LOW',
    isReversible: true,
    requiresHumanApproval: false,
  },
  'backup_database': {
    description: 'Trigger point-in-time database snapshot',
    category: 'INFRASTRUCTURE',
    impactLevel: 'LOW',
    isReversible: true,
    requiresHumanApproval: false,
  },
  'archive_old_logs': {
    description: 'Compress and move 90+ day old application logs to cold storage',
    category: 'INFRASTRUCTURE',
    impactLevel: 'MEDIUM',
    isReversible: true,
    requiresHumanApproval: false,
  },
};

export const FORBIDDEN_PATTERNS = [
  /drop\s+table/i,
  /truncate\s+table/i,
  /delete\s+from\s+\w+\s*(;|$)/i,
  /rm\s+-rf/i,
  /export_all_users/i,
  /dump_credentials/i,
  /sudo\s+/i,
  /<script[\s>]/i,
];

export function hashPayload(payload) {
  const canonicalString = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

/**
 * Dynamic Policy Governance Engine
 * Manages runtime configurable thresholds, live agent directory, and deterministic safety rules.
 */
class PolicyGovernanceEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.financialThreshold = 1000; // $1,000 threshold holds for approval
    this.maxRecordsThreshold = 1;
    this.strictReversibilityMode = true; // Any irreversible action held for approval
    this.zeroTrustDefaultDeny = true;
    this.agents = JSON.parse(JSON.stringify(DEFAULT_KNOWN_AGENTS));
    this.actions = JSON.parse(JSON.stringify(DEFAULT_ACTION_CATALOG));
  }

  updateSettings({ financialThreshold, maxRecordsThreshold, strictReversibilityMode, zeroTrustDefaultDeny }) {
    if (financialThreshold !== undefined) this.financialThreshold = Number(financialThreshold);
    if (maxRecordsThreshold !== undefined) this.maxRecordsThreshold = Number(maxRecordsThreshold);
    if (strictReversibilityMode !== undefined) this.strictReversibilityMode = Boolean(strictReversibilityMode);
    if (zeroTrustDefaultDeny !== undefined) this.zeroTrustDefaultDeny = Boolean(zeroTrustDefaultDeny);

    return this.getGovernanceState();
  }

  registerAgent({ agentId, name, department, trustTier = 'TIER_1', allowedActions = [] }) {
    if (!agentId || !name) throw new Error('agentId and name are required');
    this.agents[agentId] = {
      name,
      department: department || 'General',
      trustTier,
      allowedActions,
      registeredAt: new Date().toISOString(),
    };
    return this.agents[agentId];
  }

  getGovernanceState() {
    return {
      financialThreshold: this.financialThreshold,
      maxRecordsThreshold: this.maxRecordsThreshold,
      strictReversibilityMode: this.strictReversibilityMode,
      zeroTrustDefaultDeny: this.zeroTrustDefaultDeny,
      agentsCount: Object.keys(this.agents).length,
      actionsCount: Object.keys(this.actions).length,
      agents: this.agents,
      actions: this.actions,
    };
  }

  evaluate({ agentId, actionType, payload }) {
    const violations = [];
    const warnings = [];
    let decision = 'ALLOWED';
    let policyReason = 'Action satisfies all deterministic safety policies.';

    // 1. Zero Trust: Check if agent is recognized
    const agent = this.agents[agentId];
    if (!agent) {
      if (this.zeroTrustDefaultDeny) {
        return {
          decision: 'BLOCKED',
          policyReason: `Zero Trust Violation: Agent '${agentId}' is not registered in the trusted agent directory. Default DENY.`,
          violations: ['UNKNOWN_AGENT_ID'],
          impactLevel: 'UNKNOWN',
          isReversible: false,
          requiresReauthorization: false,
        };
      }
    }

    // 2. Zero Trust: Check if action type exists in catalog
    const actionDef = this.actions[actionType];
    if (!actionDef) {
      return {
        decision: 'BLOCKED',
        policyReason: `Zero Trust Violation: Action '${actionType}' is unrecognized. Default DENY.`,
        violations: ['UNRECOGNIZED_ACTION_TYPE'],
        impactLevel: 'UNKNOWN',
        isReversible: false,
        requiresReauthorization: false,
      };
    }

    // 3. Permission Check: Is this agent permitted to invoke this specific action?
    if (agent && !agent.allowedActions.includes(actionType)) {
      return {
        decision: 'BLOCKED',
        policyReason: `Permission Denied: Agent '${agent.name}' (${agentId}) is not authorized to execute '${actionType}'.`,
        violations: ['AGENT_ACTION_DISALLOWED'],
        impactLevel: actionDef.impactLevel,
        isReversible: actionDef.isReversible,
        requiresReauthorization: false,
      };
    }

    // 4. Malicious Pattern / Destructive Command Detection
    const payloadStr = JSON.stringify(payload || {});
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(payloadStr) || pattern.test(actionType)) {
        return {
          decision: 'BLOCKED',
          policyReason: `Security Violation: Payload contains forbidden destructive or exfiltration pattern matching: ${pattern.toString()}`,
          violations: ['FORBIDDEN_DESTRUCTIVE_PATTERN'],
          impactLevel: 'CRITICAL',
          isReversible: false,
          requiresReauthorization: false,
        };
      }
    }

    // 5. Blast Radius Check (Number of records affected)
    const recordsAffected = Number(payload?.recordsCount || payload?.recipientsCount || 1);
    const effectiveMaxRecords = actionDef.maxRecordsAffected || this.maxRecordsThreshold;
    if (recordsAffected > effectiveMaxRecords) {
      if (recordsAffected > 50) {
        decision = 'BLOCKED';
        policyReason = `Blast Radius Exceeded: Requested ${recordsAffected} records, configured policy maximum is ${effectiveMaxRecords}. Blocked.`;
        violations.push('BLAST_RADIUS_EXCEEDED');
        return {
          decision,
          policyReason,
          violations,
          impactLevel: 'HIGH',
          isReversible: actionDef.isReversible,
        };
      } else {
        decision = 'HELD_FOR_APPROVAL';
        policyReason = `High Blast Radius: Action affects ${recordsAffected} records (configured threshold: ${effectiveMaxRecords}). Held for human supervisor review.`;
        warnings.push('RECORD_COUNT_ABOVE_THRESHOLD');
      }
    }

    // 6. Financial Threshold & Irreversibility Rules
    const amount = Number(payload?.amount || 0);
    if (actionDef.category === 'FINANCIAL') {
      if (amount <= 0) {
        return {
          decision: 'BLOCKED',
          policyReason: `Invalid financial amount: ${amount}. Must be greater than 0.`,
          violations: ['INVALID_AMOUNT'],
          impactLevel: 'LOW',
          isReversible: actionDef.isReversible,
        };
      }

      if (amount > this.financialThreshold) {
        decision = 'HELD_FOR_APPROVAL';
        policyReason = `Financial Threshold Triggered: Amount $${amount.toLocaleString()} exceeds active policy threshold of $${this.financialThreshold.toLocaleString()}. Held for 4-eyes supervisor approval.`;
        warnings.push('AMOUNT_EXCEEDS_POLICY_THRESHOLD');
      }
    }

    // 7. Strict Reversibility Mode
    if (this.strictReversibilityMode && !actionDef.isReversible && decision === 'ALLOWED') {
      decision = 'HELD_FOR_APPROVAL';
      policyReason = `Strict Reversibility Policy: Action '${actionType}' is irreversible. Held for human confirmation.`;
      warnings.push('IRREVERSIBLE_ACTION_HELD');
    }

    return {
      decision,
      policyReason,
      violations,
      warnings,
      impactLevel: actionDef.impactLevel,
      isReversible: actionDef.isReversible,
      actionCategory: actionDef.category,
      payloadHash: hashPayload(payload || {}),
    };
  }
}

export const policyGovernance = new PolicyGovernanceEngine();

// Backward compatibility helper
export const KNOWN_AGENTS = policyGovernance.agents;
export const ACTION_CATALOG = policyGovernance.actions;
export function evaluateDeterministicPolicy(params) {
  return policyGovernance.evaluate(params);
}
