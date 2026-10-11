import crypto from 'crypto';

// Known agents registry (Zero-trust: unknown agents are denied by default)
export const KNOWN_AGENTS = {
  'finance-agent-01': {
    name: 'Finance & Billing Agent',
    department: 'Finance',
    trustTier: 'TIER_2', // Can propose financial ops up to medium limits
    allowedActions: ['issue_refund', 'transfer_funds', 'fetch_invoice', 'read_account_summary'],
  },
  'support-bot-alpha': {
    name: 'Customer Support Bot',
    department: 'Support',
    trustTier: 'TIER_1', // Low privileges, mainly read & low-impact tickets
    allowedActions: ['read_account_summary', 'fetch_invoice', 'send_customer_email', 'update_ticket_status'],
  },
  'ops-maintenance-agent': {
    name: 'Cloud Infrastructure Ops',
    department: 'Infrastructure',
    trustTier: 'TIER_3', // Higher technical privileges with strict guardrails
    allowedActions: ['restart_service', 'clear_cache', 'backup_database', 'archive_old_logs'],
  },
};

// Recognized actions catalog with policy definitions
export const ACTION_CATALOG = {
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
    isReversible: false, // Sent emails cannot be recalled
    requiresHumanApproval: false, // Allowed unless blast radius > threshold
    maxRecordsAffected: 1, // Single customer
  },
  'issue_refund': {
    description: 'Refund customer transaction from merchant account',
    category: 'FINANCIAL',
    impactLevel: 'HIGH',
    isReversible: false,
    requiresHumanApproval: true, // Will check financial threshold
    thresholdAmount: 1000, // Amounts > $1,000 must be held for approval
  },
  'transfer_funds': {
    description: 'Direct wire or ACH funds transfer between accounts',
    category: 'FINANCIAL',
    impactLevel: 'HIGH',
    isReversible: false,
    requiresHumanApproval: true,
    thresholdAmount: 500, // Transfers > $500 require human authorization
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

// Forbidden malicious action patterns that must always be BLOCKED
export const FORBIDDEN_PATTERNS = [
  /drop\s+table/i,
  /truncate\s+table/i,
  /delete\s+from\s+\w+\s*(;|$)/i, // Unconditional delete
  /rm\s+-rf/i,
  /export_all_users/i,
  /dump_credentials/i,
  /sudo\s+/i,
  /<script[\s>]/i,
];

/**
 * Creates a deterministic canonical hash of an action payload.
 * Used to lock payload and verify zero argument mutation prior to execution.
 */
export function hashPayload(payload) {
  // Sort keys to ensure canonical JSON representation
  const canonicalString = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

/**
 * Deterministic Policy Evaluator
 * Enforces explicit rules: permissions, thresholds, reversibility, impact, zero-trust
 */
export function evaluateDeterministicPolicy({ agentId, actionType, payload, userContext }) {
  const violations = [];
  const warnings = [];
  let decision = 'ALLOWED';
  let policyReason = 'Action satisfies all deterministic safety policies.';

  // 1. Zero Trust: Check if agent is recognized
  const agent = KNOWN_AGENTS[agentId];
  if (!agent) {
    return {
      decision: 'BLOCKED',
      policyReason: `Zero Trust Violation: Agent '${agentId}' is not registered in the trusted agent directory. Default DENY.`,
      violations: ['UNKNOWN_AGENT_ID'],
      impactLevel: 'UNKNOWN',
      isReversible: false,
      requiresReauthorization: false,
    };
  }

  // 2. Zero Trust: Check if action type exists in catalog
  const actionDef = ACTION_CATALOG[actionType];
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
  if (!agent.allowedActions.includes(actionType)) {
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
  if (actionDef.maxRecordsAffected && recordsAffected > actionDef.maxRecordsAffected) {
    if (recordsAffected > 50) {
      decision = 'BLOCKED';
      policyReason = `Blast Radius Exceeded: Requested ${recordsAffected} records, maximum allowed is ${actionDef.maxRecordsAffected}. Blocked.`;
      violations.push('BLAST_RADIUS_EXCEEDED');
      return {
        decision,
        policyReason,
        violations,
        impactLevel: 'HIGH',
        isReversible: actionDef.isReversible,
      };
    } else {
      // Hold for approval
      decision = 'HELD_FOR_APPROVAL';
      policyReason = `High Blast Radius: Action affects ${recordsAffected} records (threshold: ${actionDef.maxRecordsAffected}). Held for human supervisor review.`;
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

    if (actionDef.thresholdAmount && amount > actionDef.thresholdAmount) {
      decision = 'HELD_FOR_APPROVAL';
      policyReason = `Financial Threshold Triggered: Amount $${amount.toLocaleString()} exceeds automatic limit of $${actionDef.thresholdAmount.toLocaleString()}. Held for 4-eyes supervisor approval.`;
      warnings.push('AMOUNT_EXCEEDS_POLICY_THRESHOLD');
    }
  }

  // 7. General Reversibility & High Impact Catch
  if (!actionDef.isReversible && actionDef.impactLevel === 'HIGH' && decision === 'ALLOWED') {
    decision = 'HELD_FOR_APPROVAL';
    policyReason = `High-Impact Irreversible Action: '${actionType}' cannot be undone once executed. Held for human confirmation.`;
    warnings.push('IRREVERSIBLE_HIGH_IMPACT');
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
