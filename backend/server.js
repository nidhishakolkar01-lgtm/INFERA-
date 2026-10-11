import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

import {
  KNOWN_AGENTS,
  ACTION_CATALOG,
  evaluateDeterministicPolicy,
  hashPayload,
  policyGovernance,
} from './actionGate/policyEngine.js';
import { evaluateAiIntent } from './actionGate/aiIntentEvaluator.js';
import { auditLedger } from './actionGate/cryptographicLedger.js';
import { approvalStore } from './actionGate/approvalStore.js';
import { PRESET_SCENARIOS } from './actionGate/scenarios.js';
import { liveState } from './actionGate/liveState.js';
import { runAutonomousAgent } from './actionGate/agentRunner.js';
import { getLiveHostTelemetry } from './actionGate/liveHostMetrics.js';
import { runChaosSimulationStream } from './actionGate/chaosSimulator.js';
import { generateComplianceReport } from './actionGate/complianceReport.js';
import { MerkleTree } from './actionGate/merkleTree.js';
import { jitTokenEngine } from './actionGate/jitTokenEngine.js';
import { adversarialLab } from './actionGate/adversarialLab.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize Gemini Client
let aiKey = process.env.GEMINI_API_KEY || '';
let aiClient = null;

function initGemini(key) {
  if (key && key.trim()) {
    try {
      aiClient = new GoogleGenAI({ apiKey: key.trim() });
      aiKey = key.trim();
      console.log('✅ Google Gemini 2.5 Flash initialized successfully.');
      return true;
    } catch (err) {
      console.warn('Failed to initialize Gemini with key:', err.message);
      aiClient = null;
      return false;
    }
  }
  aiClient = null;
  return false;
}

initGemini(aiKey);

// Global runtime settings
let systemConfig = {
  simulateAiOffline: false,
  zeroTrustEnabled: true,
  strictReversibilityChecks: true,
  maxRecordsThreshold: 10,
};

// ==================== ROUTES ====================

// Root Service Status
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'ActionGate AI Agent Action Authorization Engine',
    documentation: '/api/health',
    frontend: 'https://actiongate-c6587.web.app',
    endpoints: {
      health: '/api/health',
      scenarios: '/api/scenarios',
      policies: '/api/policies',
      telemetry: '/api/system/telemetry',
      ledger: '/api/ledger',
    },
  });
});

// Health & Status
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ActionGate AI Agent Action Authorization Engine',
    geminiConfigured: !!aiClient,
    aiOfflineSimulated: systemConfig.simulateAiOffline,
    activeLedgerBlocks: auditLedger.getChain().length,
    pendingApprovals: approvalStore.getPending().length,
    timestamp: new Date().toISOString(),
  });
});

// System config & Live State
app.get('/api/config', (req, res) => {
  res.json({
    config: systemConfig,
    geminiConfigured: !!aiClient,
    knownAgentsCount: Object.keys(KNOWN_AGENTS).length,
    actionCatalogCount: Object.keys(ACTION_CATALOG).length,
  });
});

app.get('/api/system/state', (req, res) => {
  res.json({
    state: liveState.getState(),
    geminiConfigured: !!aiClient,
  });
});

app.get('/api/system/telemetry', (req, res) => {
  res.json({
    telemetry: getLiveHostTelemetry(),
    geminiConfigured: !!aiClient,
    timestamp: new Date().toISOString(),
  });
});

// Save Gemini API Key directly from UI & persist to .env
app.post('/api/config/set-api-key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'Valid API Key is required.' });
  }

  const success = initGemini(apiKey);
  if (success) {
    try {
      const envPath = path.join(__dirname, '.env');
      fs.writeFileSync(envPath, `PORT=5000\nGEMINI_API_KEY=${apiKey.trim()}\n`);
    } catch (err) {
      console.warn('Could not write to .env:', err.message);
    }
    res.json({
      success: true,
      message: 'Gemini API Key saved and initialized. Live AI reasoning active!',
      geminiConfigured: true,
    });
  } else {
    res.status(400).json({ error: 'Failed to initialize Gemini client with provided key.' });
  }
});

app.post('/api/config/toggle-ai-offline', (req, res) => {
  systemConfig.simulateAiOffline = !systemConfig.simulateAiOffline;
  res.json({
    success: true,
    simulateAiOffline: systemConfig.simulateAiOffline,
    message: systemConfig.simulateAiOffline
      ? '⚡ Simulated AI Offline Mode ENGAGED. System will strictly use deterministic fallback.'
      : '✅ AI Online Mode Restored. Gemini AI Intent Analyzer active.',
  });
});

// ==================== POLICY STUDIO & GOVERNANCE ROUTES ====================
app.get('/api/policies', (req, res) => {
  res.json(policyGovernance.getGovernanceState());
});

app.post('/api/policies/update', (req, res) => {
  const updated = policyGovernance.updateSettings(req.body);
  res.json({ success: true, updatedSettings: updated });
});

app.post('/api/policies/register-agent', (req, res) => {
  try {
    const newAgent = policyGovernance.registerAgent(req.body);
    res.json({ success: true, agent: newAgent });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/policies/reset', (req, res) => {
  policyGovernance.reset();
  res.json({ success: true, message: 'Policy settings reset to defaults.' });
});

// ==================== MULTI-AGENT CHAOS STREAM ====================
app.post('/api/simulation/chaos-stream', async (req, res) => {
  try {
    const streamResult = await runChaosSimulationStream({
      aiClient: systemConfig.simulateAiOffline ? null : aiClient,
      simulateAiOffline: systemConfig.simulateAiOffline,
    });
    res.json(streamResult);
  } catch (err) {
    res.status(500).json({ error: 'Failed to run chaos simulation', details: err.message });
  }
});

// ==================== COMPLIANCE CERTIFICATE ====================
app.get('/api/ledger/compliance-report', (req, res) => {
  const report = generateComplianceReport();
  res.json(report);
});

// Preset Demo Scenarios
app.get('/api/scenarios', (req, res) => {
  res.json({
    scenarios: PRESET_SCENARIOS,
    knownAgents: KNOWN_AGENTS,
    actionCatalog: ACTION_CATALOG,
  });
});

// ==================== REAL AUTONOMOUS AGENT RUNNER ====================
// Real agent analyzes user prompt, plans actions, and triggers ActionGate gateway
app.post('/api/agent/run', async (req, res) => {
  try {
    const { agentId, userInstruction } = req.body;

    if (!agentId || !userInstruction) {
      return res.status(400).json({ error: 'agentId and userInstruction are required.' });
    }

    // 1. Run Autonomous Agent Planning (Gemini generates thought & action)
    const agentPlan = await runAutonomousAgent({
      agentId,
      userInstruction,
      aiClient: systemConfig.simulateAiOffline ? null : aiClient,
      liveSystemState: liveState.getState(),
    });

    const actionId = `ACT-${Date.now().toString().slice(-6)}`;
    const actionType = agentPlan.proposedActionType;
    const payload = agentPlan.proposedPayload;
    const payloadHash = hashPayload(payload);

    // 2. ActionGate Intercepts & Evaluates Deterministic Policy
    const policyResult = evaluateDeterministicPolicy({
      agentId,
      actionType,
      payload,
    });

    // 3. ActionGate Evaluates AI Intent & Semantic Risk
    const aiResult = await evaluateAiIntent({
      agentId,
      actionType,
      payload,
      agentRationale: agentPlan.chainOfThought,
      aiClient: systemConfig.simulateAiOffline ? null : aiClient,
      simulateAiOffline: systemConfig.simulateAiOffline,
    });

    // 4. Synthesize Final Binding Outcome
    let finalDecision = policyResult.decision;
    let finalReason = policyResult.policyReason;

    if (policyResult.decision === 'ALLOWED') {
      if (aiResult.riskTier === 'CRITICAL' || aiResult.semanticRiskScore >= 80) {
        finalDecision = 'BLOCKED';
        finalReason = `Security Escalation: Blocked by AI intent analysis (${aiResult.reasoningSummary}).`;
      } else if (aiResult.riskTier === 'HIGH' || !aiResult.intentMatch) {
        finalDecision = 'HELD_FOR_APPROVAL';
        finalReason = `Elevated Semantic Risk: Stated rationale does not match payload actions. Held for supervisor review.`;
      }
    }

    // 5. If ALLOWED, actually execute the action on real system state!
    let liveExecutionResult = null;
    if (finalDecision === 'ALLOWED') {
      liveExecutionResult = liveState.executeAction(actionType, payload, agentId);
    }

    // 6. If HELD, queue for human supervisor
    let pendingApprovalRecord = null;
    if (finalDecision === 'HELD_FOR_APPROVAL') {
      pendingApprovalRecord = approvalStore.createPending({
        actionId,
        agentId,
        actionType,
        payload,
        heldReason: finalReason,
        impactLevel: policyResult.impactLevel,
        aiRiskScore: aiResult.semanticRiskScore,
        decisionPath: aiResult.decisionPath,
      });
    }

    // 7. Cryptographic Audit Ledger
    const ledgerBlock = auditLedger.appendRecord({
      actionId,
      agentId,
      actionType,
      payload,
      payloadHash,
      decision: finalDecision,
      decisionPath: aiResult.decisionPath,
      policyReason: finalReason,
      aiRiskScore: aiResult.semanticRiskScore,
      approvedBy: finalDecision === 'ALLOWED' ? 'AUTO_POLICY_GATEWAY' : null,
    });

    res.json({
      success: true,
      actionId,
      agentPlan,
      finalDecision,
      finalReason,
      policyResult,
      aiResult,
      decisionPath: aiResult.decisionPath,
      ledgerBlock: {
        index: ledgerBlock.index,
        currentHash: ledgerBlock.currentHash,
        previousHash: ledgerBlock.previousHash,
      },
      pendingApproval: pendingApprovalRecord,
      liveExecutionResult,
      currentState: liveState.getState(),
    });
  } catch (error) {
    console.error('Error running autonomous agent:', error);
    res.status(500).json({ error: 'Failed to run agent', details: error.message });
  }
});

// Manual / Direct Action Evaluation Gateway
app.post('/api/actions/evaluate', async (req, res) => {
  try {
    const { agentId, actionType, payload = {}, agentRationale = '' } = req.body;

    if (!agentId || !actionType) {
      return res.status(400).json({ error: 'agentId and actionType are required parameters.' });
    }

    const actionId = `ACT-${Date.now().toString().slice(-6)}`;
    const payloadHash = hashPayload(payload);

    // 1. Evaluate Deterministic Policy Rules
    const policyResult = evaluateDeterministicPolicy({
      agentId,
      actionType,
      payload,
      userContext: req.body.userContext,
    });

    // 2. Evaluate AI Intent & Risk
    const aiResult = await evaluateAiIntent({
      agentId,
      actionType,
      payload,
      agentRationale,
      aiClient: systemConfig.simulateAiOffline ? null : aiClient,
      simulateAiOffline: systemConfig.simulateAiOffline,
    });

    // 3. Synthesize Final Outcome
    let finalDecision = policyResult.decision;
    let finalReason = policyResult.policyReason;

    if (policyResult.decision === 'ALLOWED') {
      if (aiResult.riskTier === 'CRITICAL' || aiResult.semanticRiskScore >= 80) {
        finalDecision = 'BLOCKED';
        finalReason = `Security Escalation: Blocked by AI intent analysis (${aiResult.reasoningSummary}).`;
      } else if (aiResult.riskTier === 'HIGH' || !aiResult.intentMatch) {
        finalDecision = 'HELD_FOR_APPROVAL';
        finalReason = `Elevated Semantic Risk: Stated rationale does not match payload actions. Held for supervisor review.`;
      }
    }

    // 4. If ALLOWED, execute on live state!
    let liveExecutionResult = null;
    if (finalDecision === 'ALLOWED') {
      liveExecutionResult = liveState.executeAction(actionType, payload, agentId);
    }

    // 5. Handle Pending Human Approvals
    let pendingApprovalRecord = null;
    if (finalDecision === 'HELD_FOR_APPROVAL') {
      pendingApprovalRecord = approvalStore.createPending({
        actionId,
        agentId,
        actionType,
        payload,
        heldReason: finalReason,
        impactLevel: policyResult.impactLevel,
        aiRiskScore: aiResult.semanticRiskScore,
        decisionPath: aiResult.decisionPath,
      });
    }

    // 6. Append to Cryptographic SHA-256 Audit Ledger
    const ledgerBlock = auditLedger.appendRecord({
      actionId,
      agentId,
      actionType,
      payload,
      payloadHash,
      decision: finalDecision,
      decisionPath: aiResult.decisionPath,
      policyReason: finalReason,
      aiRiskScore: aiResult.semanticRiskScore,
      approvedBy: finalDecision === 'ALLOWED' ? 'AUTO_POLICY_GATEWAY' : null,
    });

    res.json({
      success: true,
      actionId,
      finalDecision,
      finalReason,
      policyResult,
      aiResult,
      decisionPath: aiResult.decisionPath,
      ledgerBlock: {
        index: ledgerBlock.index,
        currentHash: ledgerBlock.currentHash,
        previousHash: ledgerBlock.previousHash,
      },
      pendingApproval: pendingApprovalRecord,
      liveExecutionResult,
      currentState: liveState.getState(),
    });
  } catch (error) {
    console.error('Error evaluating action in ActionGate:', error);
    res.status(500).json({ error: 'Internal evaluation error', details: error.message });
  }
});

// Human In The Loop: Pending Approvals Queue
app.get('/api/actions/pending', (req, res) => {
  res.json({
    pending: approvalStore.getPending(),
    history: approvalStore.getAll(),
  });
});

// Human In The Loop: Authorize Action & Execute Live
app.post('/api/actions/approve', (req, res) => {
  const { actionId, approverId = 'supervisor-jane-doe', executionPayload } = req.body;

  if (!actionId) {
    return res.status(400).json({ error: 'actionId is required.' });
  }

  const result = approvalStore.approve({
    actionId,
    approverId,
    executionPayload,
  });

  // Record approval in ledger and EXECUTE on real live state!
  if (result.success) {
    const targetAction = approvalStore.getAll().find((a) => a.actionId === actionId);
    let liveExecutionResult = null;
    if (targetAction) {
      liveExecutionResult = liveState.executeAction(
        targetAction.actionType,
        executionPayload || targetAction.payload,
        approverId
      );
    }

    auditLedger.appendRecord({
      actionId,
      agentId: approverId,
      actionType: 'SUPERVISOR_ACTION_APPROVAL',
      payload: executionPayload || {},
      payloadHash: hashPayload(executionPayload || {}),
      decision: 'ALLOWED',
      decisionPath: 'HUMAN_SUPERVISOR_AUTHORIZATION',
      policyReason: `Authorized by human supervisor ${approverId} after 4-eyes review. Executed on live state.`,
      approvedBy: approverId,
    });

    return res.json({
      ...result,
      liveExecutionResult,
      currentState: liveState.getState(),
    });
  } else {
    // If payload was tampered with, record security refusal in ledger!
    auditLedger.appendRecord({
      actionId,
      agentId: approverId,
      actionType: 'TAMPER_DETECTION_REFUSAL',
      payload: executionPayload || {},
      payloadHash: hashPayload(executionPayload || {}),
      decision: 'BLOCKED',
      decisionPath: 'PAYLOAD_TAMPER_PROTECTION',
      policyReason: result.error,
      approvedBy: null,
    });

    return res.json(result);
  }
});

// Human In The Loop: Reject Action
app.post('/api/actions/reject', (req, res) => {
  const { actionId, rejectorId = 'supervisor-jane-doe', reason } = req.body;
  const result = approvalStore.reject({ actionId, rejectorId, reason });

  if (result.success) {
    auditLedger.appendRecord({
      actionId,
      agentId: rejectorId,
      actionType: 'SUPERVISOR_ACTION_REJECTION',
      payload: {},
      payloadHash: 'none',
      decision: 'BLOCKED',
      decisionPath: 'HUMAN_SUPERVISOR_REJECTION',
      policyReason: `Rejected by human supervisor ${rejectorId}: ${reason || 'Denied'}`,
      approvedBy: null,
    });
  }

  res.json(result);
});

// ==================== CRYPTOGRAPHIC LEDGER ROUTES ====================

app.get('/api/ledger', (req, res) => {
  res.json({
    chain: auditLedger.getChain(),
    totalBlocks: auditLedger.getChain().length,
  });
});

app.post('/api/ledger/verify', (req, res) => {
  const auditResult = auditLedger.verifyIntegrity();
  res.json(auditResult);
});

// Live Judge Demo: Simulate unauthorized database manipulation
app.post('/api/ledger/simulate-tamper', (req, res) => {
  const { blockIndex = 1, maliciousDecision = 'ALLOWED', fakeReason = 'Tampered by DB injection' } = req.body;
  try {
    const result = auditLedger.simulateTamper(blockIndex, {
      decision: maliciousDecision,
      policyReason: fakeReason,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/ledger/reset', (req, res) => {
  auditLedger.reset();
  approvalStore.reset();
  liveState.reset();
  res.json({ success: true, message: 'Ledger, approvals, and live system state reset.' });
});

// ==================== MERKLE TREE CRYPTOGRAPHIC AUDIT ROUTES ====================

app.get('/api/merkle/tree', (req, res) => {
  const chain = auditLedger.getChain();
  const tree = new MerkleTree(chain);
  res.json({
    merkleRoot: tree.getRoot(),
    totalLeaves: chain.length,
    structure: tree.getTreeStructure(),
  });
});

app.get('/api/merkle/proof/:leafIndex', (req, res) => {
  const leafIndex = parseInt(req.params.leafIndex, 10);
  const chain = auditLedger.getChain();
  if (isNaN(leafIndex) || leafIndex < 0 || leafIndex >= chain.length) {
    return res.status(400).json({ error: `Invalid leaf index. Valid range: 0 to ${chain.length - 1}` });
  }
  const tree = new MerkleTree(chain);
  const proof = tree.getProof(leafIndex);
  res.json({
    ...proof,
    targetBlock: chain[leafIndex],
  });
});

app.post('/api/merkle/verify', (req, res) => {
  const { leafHash, proof, merkleRoot } = req.body;
  if (!leafHash || !proof || !merkleRoot) {
    return res.status(400).json({ error: 'Missing required parameters: leafHash, proof, merkleRoot' });
  }
  const isValid = MerkleTree.verifyProof(leafHash, proof, merkleRoot);
  res.json({
    verified: isValid,
    status: isValid ? 'CRYPTOGRAPHICALLY_VERIFIED' : 'PROOF_INVALID_OR_TAMPERED',
    leafHash,
    merkleRoot,
    verifiedAt: new Date().toISOString(),
  });
});

// ==================== JIT EPHEMERAL ACTION LEASE ROUTES ====================

app.get('/api/jit/metrics', (req, res) => {
  res.json(jitTokenEngine.getMetrics());
});

app.get('/api/jit/logs', (req, res) => {
  res.json({ logs: jitTokenEngine.getSecurityLog() });
});

app.post('/api/jit/issue', (req, res) => {
  const { actionId, agentId, toolName, parameters, authorizedBy, ttlMs } = req.body;
  const token = jitTokenEngine.issueToken({
    actionId: actionId || `act_${Date.now()}`,
    agentId: agentId || 'agent-unknown',
    toolName: toolName || 'unknown_tool',
    parameters: parameters || {},
    authorizedBy: authorizedBy || 'ACTIONGATE_ENGINE',
    ttlMs: ttlMs ? parseInt(ttlMs, 10) : null,
  });
  res.json(token);
});

app.post('/api/jit/execute', (req, res) => {
  const { token, toolName, parameters } = req.body;
  const result = jitTokenEngine.consumeToken({ token, toolName, parameters });
  if (!result.valid) {
    return res.status(result.code || 403).json(result);
  }
  res.json(result);
});

app.post('/api/jit/simulate-replay', (req, res) => {
  const { tokenId } = req.body;
  const result = jitTokenEngine.simulateReplayAttack(tokenId);
  res.json(result);
});

// ==================== ADVERSARIAL RED-TEAM INJECTION LAB ROUTES ====================

app.get('/api/redteam/vectors', (req, res) => {
  res.json({
    vectors: adversarialLab.getVectors(),
  });
});

app.get('/api/redteam/history', (req, res) => {
  res.json({
    history: adversarialLab.getHistory(),
  });
});

app.post('/api/redteam/evaluate', async (req, res) => {
  const { userPrompt, poisonedContext, agentAttemptedTool, agentAttemptedParameters, agentId } = req.body;
  try {
    const evaluation = await adversarialLab.evaluateAdversarialAction({
      userPrompt: userPrompt || '',
      poisonedContext: poisonedContext || '',
      agentAttemptedTool: agentAttemptedTool || '',
      agentAttemptedParameters: agentAttemptedParameters || {},
      agentId: agentId || 'agent-redteam-evaluator',
    });
    res.json(evaluation);
  } catch (err) {
    console.error('Adversarial evaluation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Resilient Server Startup with Automatic Port Fallback & Graceful Windows Cleanup
function startServer(portToTry, retriesLeft = 3) {
  const server = app.listen(portToTry, () => {
    console.log(`ActionGate Server running on http://localhost:${portToTry}`);
    console.log(`Zero-Trust Agent Authorization Engine Ready.`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️ Port ${portToTry} is already in use by another process.`);
      if (retriesLeft > 0) {
        const nextPort = portToTry + 1;
        console.log(`⚡ Attempting fallback port ${nextPort}...`);
        startServer(nextPort, retriesLeft - 1);
      } else {
        console.error(`❌ All fallback ports occupied. Run 'npm run kill-port' to free port 5000.`);
        process.exit(1);
      }
    } else {
      console.error('Fatal server startup error:', err);
      process.exit(1);
    }
  });

  const cleanExit = () => {
    server.close(() => {
      console.log(`ActionGate Server on port ${portToTry} closed gracefully.`);
      process.exit(0);
    });
  };

  process.on('SIGINT', cleanExit);
  process.on('SIGTERM', cleanExit);
}

startServer(PORT);
