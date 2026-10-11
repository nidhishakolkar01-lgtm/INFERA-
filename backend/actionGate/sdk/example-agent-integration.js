import { ActionGateClient } from './actiongate-sdk.js';

/**
 * Example: Integrating ActionGate with an Autonomous Agent
 * Demonstrates:
 * 1. Safe benign tool invocation (Allowed & Executed)
 * 2. High-value transfer (Held for Human 4-Eyes Quorum)
 * 3. Malicious destructive injection tool (Blocked at Point of Action)
 */
async function runSdkIntegrationDemo() {
  console.log('================================================================');
  console.log('🤖 ACTIONGATE AGENT SDK DROP-IN INTERCEPTOR DEMO');
  console.log('================================================================\n');

  const gate = new ActionGateClient({
    endpoint: 'http://localhost:5000',
    agentId: 'ops-maintenance-agent',
    agentName: 'DevOps Autonomous Agent'
  });

  // 1. Define raw un-guarded tools (simulating database, cloud APIs, shell)
  async function rawRestartService(params) {
    console.log(`   [RAW HARDWARE CALL] Executing service restart: ${params.serviceName}`);
    return { restarted: true, node: 'prod-worker-01', timestamp: new Date().toISOString() };
  }

  async function rawTransferFunds(params) {
    console.log(`   [RAW BANKING API] Moving $${params.amount} to ${params.recipient}`);
    return { transactionId: 'TX-9901', transferred: true };
  }

  // 2. Wrap them with ActionGate in 1 line
  const guardedRestart = gate.wrapTool('restart_service', rawRestartService);
  const guardedTransfer = gate.wrapTool('transfer_funds', rawTransferFunds);

  // Scenario A: Safe allowed tool call
  console.log('▶ [SCENARIO A] Agent attempts legitimate maintenance operation:');
  try {
    const resA = await guardedRestart({ serviceName: 'worker_node' }, { rationale: 'Restarting unhealthy pod after memory alert' });
    console.log('   Result:', JSON.stringify(resA, null, 2));
    console.log('   ✅ SCENARIO A: Executed cleanly under ActionGate guard.\n');
  } catch (err) {
    console.error('   ❌ Unexpected error in A:', err.message);
  }

  // Scenario B: Privilege escalation / unauthorized tool call
  console.log('▶ [SCENARIO B] Maintenance agent attempts unauthorized financial transfer:');
  try {
    await guardedTransfer({ recipient: '0xAttacker', amount: 4500 }, { rationale: 'Emergency payment' });
  } catch (err) {
    console.log(`   🛡️ ActionGate Intercepted & Blocked!`);
    console.log(`      Error: ${err.message}\n`);
  }

  // Scenario C: Authorized agent with high-value action (Held for 4-Eyes Quorum)
  const financeGate = new ActionGateClient({
    endpoint: 'http://localhost:5000',
    agentId: 'finance-agent-01',
    agentName: 'Finance Settlement Agent'
  });
  const financeGuardedTransfer = financeGate.wrapTool('transfer_funds', rawTransferFunds);

  console.log('▶ [SCENARIO C] Authorized Finance Agent proposes $4,500 wire transfer:');
  const resC = await financeGuardedTransfer({ recipient: 'vendor_escrow', amount: 4500 }, { rationale: 'Monthly server hosting settlement' });
  if (resC.status === 'HELD_FOR_HUMAN_APPROVAL') {
    console.log('   ⚠️ ActionGate Intercepted! Held for 4-Eyes Human Quorum:');
    console.log(`      Reason: ${resC.reason}`);
    console.log(`      Action ID: ${resC.actionId}\n`);
  } else {
    console.log('   Result:', resC);
  }

  // Scenario D: Anti-Siphon Velocity Circuit Breaker Defense
  console.log('▶ [SCENARIO D] Testing Anti-Siphon Circuit Breaker (Rapid micro-transactions):');
  console.log('   Simulating rapid transactions to exceed rolling velocity cap ($5,000/min)...');
  async function rawReserveEscrow(params) {
    return { reserved: true, amount: params.amount, recipient: params.recipient };
  }
  const financeEscrow = financeGate.wrapTool('reserve_escrow_funds', rawReserveEscrow);

  let lastSuccessfulActionId = null;
  for (let i = 1; i <= 7; i++) {
    try {
      const res = await financeEscrow({ recipient: `escrow_${i}`, amount: 900 });
      lastSuccessfulActionId = res.actionId;
      console.log(`   Tx #${i} ($900): ✅ Allowed & Executed (Action ID: ${res.actionId})`);
    } catch (err) {
      console.log(`   🚨 Tx #${i} ($900): CIRCUIT BREAKER TRIPPED & LOCKED!`);
      console.log(`      Defense: ${err.message}\n`);
      break;
    }
  }

  // Scenario E: 1-Click Cryptographic Rollback of Reversible Action
  if (lastSuccessfulActionId) {
    console.log(`▶ [SCENARIO E] 1-Click Cryptographic Rollback of Reversible Action (${lastSuccessfulActionId}):`);
    const rollbackRes = await fetch('http://localhost:5000/api/actions/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionId: lastSuccessfulActionId,
        operatorId: 'supervisor-jane-doe',
        reason: 'Compensating rollback triggered by operator'
      })
    }).then(r => r.json());

    if (rollbackRes.success) {
      console.log('   ✅ Cryptographic Rollback Succeeded!');
      console.log(`      Rollback Receipt Hash: ${rollbackRes.rollbackReceiptHash}`);
      console.log(`      Compensating Ledger Block #${rollbackRes.ledgerBlockIndex}`);
      console.log(`      Updated Merkle Root: ${rollbackRes.updatedMerkleRoot}\n`);
    } else {
      console.log('   Rollback failed:', rollbackRes);
    }
  }

  console.log('================================================================');
  console.log('🎉 SDK INTEGRATION VERIFIED: Drop-in protection active!');
  console.log('================================================================');
}

runSdkIntegrationDemo().catch(console.error);
