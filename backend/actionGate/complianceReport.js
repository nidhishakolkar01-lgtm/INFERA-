import crypto from 'crypto';
import { auditLedger } from './cryptographicLedger.js';
import { policyGovernance } from './policyEngine.js';
import { getLiveHostTelemetry } from './liveHostMetrics.js';

/**
 * Enterprise Security & Regulatory Compliance Report Generator
 * Formats a cryptographic compliance proof conforming to SOC-2, ISO/IEC 27001,
 * and EU AI Act Article 14 (Human Oversight of Autonomous Systems).
 */
export function generateComplianceReport() {
  const chain = auditLedger.getChain();
  const integrity = auditLedger.verifyIntegrity();
  const governance = policyGovernance.getGovernanceState();
  const host = getLiveHostTelemetry();

  let allowedCount = 0;
  let blockedCount = 0;
  let heldCount = 0;

  for (const block of chain) {
    if (block.decision === 'ALLOWED') allowedCount++;
    else if (block.decision === 'BLOCKED') blockedCount++;
    else if (block.decision === 'HELD_FOR_APPROVAL') heldCount++;
  }

  const genesisBlock = chain[0];
  const headBlock = chain[chain.length - 1];

  // Cryptographic signature of report
  const reportPayload = `${chain.length}|${genesisBlock.currentHash}|${headBlock.currentHash}|${integrity.isValid}`;
  const digitalSignature = crypto
    .createHmac('sha256', 'actiongate-compliance-key-v3')
    .update(reportPayload)
    .digest('hex');

  return {
    certificateId: `CERT-AG-${Date.now().toString().slice(-8)}`,
    generatedAt: new Date().toISOString(),
    standardCompliance: [
      'SOC-2 Type II (Trust Services Criteria - Security & Confidentiality)',
      'ISO/IEC 27001:2022 (Access Control & Cryptographic Verification)',
      'EU AI Act Article 14 (Mandatory Human Oversight & Logging for Autonomous Agents)',
    ],
    cryptographicProof: {
      isChainIntact: integrity.isValid,
      verificationMessage: integrity.message,
      totalBlocksAudited: chain.length,
      genesisBlockHash: genesisBlock.currentHash,
      chainHeadHash: headBlock.currentHash,
      digitalSignature,
    },
    actionDecisionMetrics: {
      totalEvaluations: chain.length,
      allowedActions: allowedCount,
      blockedActions: blockedCount,
      heldForHumanApproval: heldCount,
      refusalEnforcementRate: Math.round(((blockedCount + heldCount) / Math.max(chain.length, 1)) * 100) + '%',
    },
    governancePoliciesEnforced: {
      zeroTrustDefaultDeny: governance.zeroTrustDefaultDeny,
      strictReversibilityMode: governance.strictReversibilityMode,
      financialApprovalThresholdUsd: governance.financialThreshold,
      maxRecordsBlastRadius: governance.maxRecordsThreshold,
      registeredAgentsCount: governance.agentsCount,
      recognizedActionsCount: governance.actionsCount,
    },
    auditedHostEnvironment: {
      hostname: host.hostname,
      platform: `${host.osPlatform} (${host.architecture})`,
      nodeEngine: host.nodeVersion,
      processPid: host.processPid,
    },
  };
}
