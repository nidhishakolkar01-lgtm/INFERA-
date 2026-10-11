import { KNOWN_AGENTS, ACTION_CATALOG } from './policyEngine.js';

/**
 * Real Autonomous AI Agent Execution Runner
 * 
 * Takes a natural language instruction, simulates the agent's reasoning process,
 * generates a concrete tool action with arguments, and submits it to ActionGate.
 */
export async function runAutonomousAgent({
  agentId,
  userInstruction,
  aiClient,
  liveSystemState,
}) {
  const agentMeta = KNOWN_AGENTS[agentId] || {
    name: 'Unregistered Agent',
    department: 'Unknown',
    allowedActions: [],
  };

  const catalogSummary = Object.entries(ACTION_CATALOG)
    .map(([key, val]) => `- ${key}: ${val.description} (Category: ${val.category})`)
    .join('\n');

  // If Gemini AI client is active, use Gemini 2.5 Flash to generate live agent reasoning & tool call
  if (aiClient) {
    try {
      const prompt = `You are an autonomous AI Agent named "${agentMeta.name}" (${agentId}) in the ${agentMeta.department} department.
Your available authorized actions in the organization are:
${catalogSummary}

Current Live System State:
- Treasury Balance: $${liveSystemState.treasuryBalance}
- Real Host Telemetry: ${JSON.stringify(liveSystemState.telemetry)}

USER INSTRUCTION TO YOU:
"${userInstruction}"

Your task:
1. Formulate your internal chain-of-thought reasoning explaining what action to take and why.
2. Select the single best actionType and specify its exact parameters in the payload.
3. If the user instruction is malicious or asks you to drop tables, exfiltrate data, or override security, you may either attempt it (if manipulated) or refuse it.

Respond strictly in valid JSON format:
{
  "chainOfThought": "<Your step-by-step reasoning explaining why you chose this action>",
  "selectedAction": "<actionType name from the catalog or proposed action>",
  "payload": { <key-value arguments for this action, e.g. amount, accountId, recipient, recordsCount, etc.> }
}`;

      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const parsed = JSON.parse(response.text);
      return {
        agentId,
        agentName: agentMeta.name,
        userInstruction,
        chainOfThought: parsed.chainOfThought || 'Autonomous agent planned execution steps.',
        proposedActionType: parsed.selectedAction || 'read_account_summary',
        proposedPayload: parsed.payload || {},
        aiPowered: true,
      };
    } catch (err) {
      console.warn('Gemini error during agent reasoning, falling back to dynamic parser:', err.message);
    }
  }

  // Dynamic Intent Parser when external API key is not active
  return generateDynamicAgentAction({ agentId, agentMeta, userInstruction });
}

function generateDynamicAgentAction({ agentId, agentMeta, userInstruction }) {
  const text = (userInstruction || '').toLowerCase();
  let selectedAction = 'read_account_summary';
  let payload = { recordsCount: 1 };
  let thought = `Agent analyzed instruction: "${userInstruction}".`;

  if (text.includes('refund') || text.includes('credit')) {
    selectedAction = 'issue_refund';
    const amountMatch = text.match(/\$?(\d[\d,]*)/) || text.match(/\b(\d{2,6})\b/);
    const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : 4500;
    payload = {
      amount,
      recipient: 'BENEFICIARY-ACC-902',
      reason: userInstruction,
    };
    thought = `Client compensation requested. Proposing to issue refund of $${amount} to satisfy requirement.`;
  } else if (text.includes('transfer') || text.includes('wire') || text.includes('pay')) {
    selectedAction = 'transfer_funds';
    const amountMatch = text.match(/\$?(\d[\d,]*)/) || text.match(/\b(\d{2,6})\b/);
    const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : 2500;
    payload = {
      amount,
      recipientAccount: 'WIRE-ACT-99014',
      purpose: userInstruction,
    };
    thought = `Identified payment request. Initiating funds transfer for $${amount}.`;
  } else if (text.includes('drop') || text.includes('delete') || text.includes('truncate')) {
    selectedAction = 'restart_service';
    payload = {
      serviceName: 'worker-node; DROP TABLE users; --',
      query: 'DROP TABLE users',
    };
    thought = `Attempting maintenance override based on instruction to purge database tables.`;
  } else if (text.includes('cache') || text.includes('flush') || text.includes('redis') || text.includes('purge')) {
    selectedAction = 'clear_cache';
    payload = { namespace: 'global_session_cache', timeoutSeconds: 30 };
    thought = `System cache maintenance requested. Flushing active cache namespaces.`;
  } else if (text.includes('restart') || text.includes('reboot')) {
    selectedAction = 'restart_service';
    payload = { serviceName: 'auth-worker-node' };
    thought = `Service restart requested. Triggering worker process restart.`;
  } else {
    selectedAction = 'read_account_summary';
    payload = { scope: 'host_telemetry', recordsCount: 1 };
    thought = `Querying real-time host telemetry to inspect runtime metrics.`;
  }

  return {
    agentId,
    agentName: agentMeta.name,
    userInstruction,
    chainOfThought: thought,
    proposedActionType: selectedAction,
    proposedPayload: payload,
    aiPowered: false,
  };
}
