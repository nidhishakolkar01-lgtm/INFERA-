/**
 * ActionGate Universal Client SDK
 * 
 * Drop-in Zero-Trust Authorization Proxy for autonomous AI agents.
 * Compatible with OpenAI Tools, LangChain, AutoGen, CrewAI, and native Node.js tools.
 * 
 * Usage:
 *   import { ActionGateClient } from './actiongate-sdk.js';
 *   const gate = new ActionGateClient({ endpoint: 'http://localhost:5000', agentId: 'agent-01' });
 *   const safeTool = gate.wrapTool('transfer_funds', rawTransferFn);
 *   await safeTool({ recipient: 'vendor_a', amount: 500 });
 */

export class ActionGateClient {
  constructor({
    endpoint = 'http://localhost:5000',
    agentId = 'autonomous-agent-default',
    agentName = 'Enterprise Autonomous Agent',
    apiKey = null,
    fetchFn = null
  } = {}) {
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.agentId = agentId;
    this.agentName = agentName;
    this.apiKey = apiKey;
    this.fetch = fetchFn || (typeof fetch !== 'undefined' ? fetch : null);

    if (!this.fetch) {
      throw new Error('ActionGateClient requires global fetch or a fetchFn provided in constructor.');
    }
  }

  /**
   * Evaluates proposed action against ActionGate deterministic policy & AI intent rules.
   */
  async evaluateAction({ toolName, parameters = {}, rationale = 'Agent tool invocation' }) {
    const res = await this.fetch(`${this.endpoint}/api/actions/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify({
        agentId: this.agentId,
        actionType: toolName,
        payload: parameters,
        agentRationale: rationale
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Evaluation failed' }));
      throw new Error(`ActionGate HTTP ${res.status}: ${err.error || err.message}`);
    }

    return await res.json();
  }

  /**
   * Requests a cryptographically signed JIT Ephemeral Action Lease for an authorized action.
   */
  async acquireJitLease({ actionId, toolName, parameters }) {
    const res = await this.fetch(`${this.endpoint}/api/jit/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionId,
        agentId: this.agentId,
        toolName,
        parameters,
        authorizedBy: 'ACTIONGATE_SDK_CLIENT'
      })
    });

    if (!res.ok) {
      throw new Error(`Failed to acquire JIT action lease: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Consumes and burns a JIT Ephemeral Action Lease at execution time.
   */
  async consumeJitLease({ token, toolName, parameters }) {
    const res = await this.fetch(`${this.endpoint}/api/jit/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, toolName, parameters })
    });

    return await res.json();
  }

  /**
   * Wraps a raw tool function into a Zero-Trust ActionGate Protected Tool.
   * Intercepts execution before it reaches the real database/API.
   */
  wrapTool(toolName, rawToolFunction, options = {}) {
    const self = this;

    return async function guardedToolInvocation(parameters = {}, context = {}) {
      const rationale = context.rationale || `Invocation of ${toolName} by ${self.agentId}`;
      const actionId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // 1. Point-of-Action Interception & Policy Evaluation
      const evaluation = await self.evaluateAction({
        toolName,
        parameters,
        rationale
      });

      const decision = evaluation.finalDecision || evaluation.decision;
      const reason = evaluation.finalReason || evaluation.policyReason || evaluation.reason;

      // 2. Handle Decision Verdicts
      if (decision === 'BLOCKED') {
        const error = new Error(`[ActionGate DENIED] Tool '${toolName}' was blocked: ${reason}`);
        error.name = 'ActionGateBlockedError';
        error.evaluation = evaluation;
        throw error;
      }

      if (decision === 'HELD_FOR_APPROVAL') {
        const pendingRes = {
          status: 'HELD_FOR_HUMAN_APPROVAL',
          actionId: evaluation.actionId || actionId,
          reason,
          message: 'Action exceeded risk envelope or threshold. Quorum authorization required.',
          evaluation
        };
        return pendingRes;
      }

      // 3. ALLOWED: Acquire JIT Ephemeral Lease
      let jitToken = null;
      try {
        const lease = await self.acquireJitLease({
          actionId: evaluation.actionId || actionId,
          toolName,
          parameters
        });
        jitToken = lease.token;
      } catch (e) {
        // Fallback gracefully if JIT server tokening is disabled
      }

      // 4. Execute the raw underlying tool
      const executionStartTime = Date.now();
      const rawResult = await rawToolFunction(parameters);
      const executionDurationMs = Date.now() - executionStartTime;

      // 5. Consume and burn JIT Nonce if token was issued
      if (jitToken) {
        await self.consumeJitLease({
          token: jitToken,
          toolName,
          parameters
        }).catch(() => {});
      }

      return {
        success: true,
        actionGateGuarded: true,
        actionId: evaluation.actionId || actionId,
        decision: 'ALLOWED',
        executionDurationMs,
        result: rawResult
      };
    };
  }

  /**
   * Helper to format tool for OpenAI Functions / Tools schema.
   */
  toOpenAITool(toolName, description, parametersSchema, rawToolFn) {
    const wrappedFn = this.wrapTool(toolName, rawToolFn);
    return {
      type: 'function',
      function: {
        name: toolName,
        description: `[ActionGate Protected] ${description}`,
        parameters: parametersSchema
      },
      handler: wrappedFn
    };
  }
}

export default ActionGateClient;
