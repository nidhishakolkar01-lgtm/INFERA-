import { MerkleTree } from './actionGate/merkleTree.js';
import { jitTokenEngine } from './actionGate/jitTokenEngine.js';
import { adversarialLab } from './actionGate/adversarialLab.js';

async function runAdvancedTests() {
  console.log('=== [1/3] TESTING MERKLE TREE CRYPTOGRAPHIC ENGINE ===');
  const sampleBlocks = [
    { index: 0, tool: 'transfer_funds', amount: 500, previousHash: '0000000' },
    { index: 1, tool: 'execute_sql_query', query: 'SELECT 1;', previousHash: 'abc123' },
    { index: 2, tool: 'read_logs', filter: 'error', previousHash: 'def456' },
    { index: 3, tool: 'update_role', role: 'viewer', previousHash: '789xyz' }
  ];

  const tree = new MerkleTree(sampleBlocks);
  const root = tree.getRoot();
  console.log('Merkle Root computed:', root);
  if (!root || root.length !== 64) throw new Error('Merkle root calculation failed!');

  // Test proof generation for leaf 2
  const proofForLeaf2 = tree.getProof(2);
  console.log('Proof generated for leaf 2:', JSON.stringify(proofForLeaf2.proof));

  const validProof = MerkleTree.verifyProof(proofForLeaf2.leafHash, proofForLeaf2.proof, root);
  console.log('Merkle proof verification result:', validProof ? 'PASS (Valid)' : 'FAIL');
  if (!validProof) throw new Error('Valid proof failed verification!');

  // Test tampered leaf
  const tamperedHash = 'f' + proofForLeaf2.leafHash.substring(1);
  const tamperedProofResult = MerkleTree.verifyProof(tamperedHash, proofForLeaf2.proof, root);
  console.log('Tampered leaf verification result:', tamperedProofResult ? 'FAIL (Allowed tampered!)' : 'PASS (Tamper detected)');
  if (tamperedProofResult) throw new Error('Tampered leaf was incorrectly marked valid!');

  console.log('\n=== [2/3] TESTING JIT EPHEMERAL ACTION LEASES & ANTI-REPLAY ===');
  const tokenIssue = jitTokenEngine.issueToken({
    actionId: 'act-test-001',
    agentId: 'agent-finance-01',
    toolName: 'transfer_funds',
    parameters: { amount: 1500, recipient: 'vendor_escrow' },
    ttlMs: 5000 // 5 seconds
  });
  console.log('Issued JIT Token ID:', tokenIssue.token.tokenId);
  console.log('Single-use Nonce:', tokenIssue.token.nonce);

  // Consume validly
  const firstConsume = jitTokenEngine.consumeToken({
    token: tokenIssue.token,
    toolName: 'transfer_funds',
    parameters: { amount: 1500, recipient: 'vendor_escrow' }
  });
  console.log('First consumption result:', firstConsume.valid ? 'AUTHORIZED & BURNED' : 'FAILED');
  if (!firstConsume.valid) throw new Error('First valid consumption failed!');

  // Replay attack: resubmit the same token!
  const replayAttempt = jitTokenEngine.consumeToken({
    token: tokenIssue.token,
    toolName: 'transfer_funds',
    parameters: { amount: 1500, recipient: 'vendor_escrow' }
  });
  console.log('Replay attempt result:', replayAttempt.valid ? 'SECURITY BREACH (Replay allowed!)' : `DEFENDED: ${replayAttempt.reason}`);
  if (replayAttempt.valid) throw new Error('Replay attack was not prevented!');

  // Parameter tampering test
  const freshToken = jitTokenEngine.issueToken({
    actionId: 'act-test-002',
    agentId: 'agent-finance-01',
    toolName: 'transfer_funds',
    parameters: { amount: 100, recipient: 'safe_vendor' }
  });
  const tamperedParamConsume = jitTokenEngine.consumeToken({
    token: freshToken.token,
    toolName: 'transfer_funds',
    parameters: { amount: 999999, recipient: 'attacker_wallet' } // In-flight payload tamper
  });
  console.log('In-flight parameter tamper test:', tamperedParamConsume.valid ? 'FAIL' : `DEFENDED: ${tamperedParamConsume.reason}`);
  if (tamperedParamConsume.valid) throw new Error('Parameter tampering was not detected!');

  console.log('\n=== [3/3] TESTING ADVERSARIAL RED-TEAM INJECTION LAB ===');
  const vectors = adversarialLab.getVectors();
  console.log(`Loaded ${vectors.length} known adversarial vectors.`);

  // Test vector 1: Indirect injection in invoice
  const vector1 = vectors[0];
  const eval1 = await adversarialLab.evaluateAdversarialAction({
    userPrompt: vector1.userPrompt,
    poisonedContext: vector1.poisonedContext,
    agentAttemptedTool: vector1.agentAttemptedTool,
    agentAttemptedParameters: vector1.agentAttemptedParameters
  });
  console.log(`Vector 1 [${vector1.name}] Divergence Score: ${eval1.divergenceScore}%`);
  console.log(`ActionGate Verdict: ${eval1.actionGateVerdict} | Status: ${eval1.actionGateStatus}`);
  if (eval1.actionGateVerdict !== 'BLOCKED_DIVERGENT_INTENT') {
    throw new Error('Vector 1 was not blocked as expected!');
  }

  // Test aligned benign action
  const benignEval = await adversarialLab.evaluateAdversarialAction({
    userPrompt: 'Review customer invoice INV-2026-88 and summarize total line items for the finance team.',
    poisonedContext: 'Invoice standard content without overrides.',
    agentAttemptedTool: 'generate_summary_report',
    agentAttemptedParameters: { invoiceId: 'INV-2026-88', total: 420 }
  });
  console.log(`Benign Action Divergence Score: ${benignEval.divergenceScore}%`);
  console.log(`Benign Verdict: ${benignEval.actionGateVerdict} | Status: ${benignEval.actionGateStatus}`);
  if (benignEval.divergenceScore > 30) {
    throw new Error('Benign action incorrectly flagged with high divergence!');
  }

  console.log('\nALL ADVANCED SECURITY ENGINE TESTS PASSED WITH 100% SUCCESS!');
}

runAdvancedTests().catch(err => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
