import crypto from 'crypto';

/**
 * VelocityCircuitBreaker
 * 
 * Protects against:
 * - Anti-Siphon Attacks (e.g. 50 micro-transfers of $900 designed to evade a $1,000 threshold)
 * - Agent runaway loops / high-frequency unauthorized blast radius
 * - Cascading infrastructure exhaustion
 */
export class VelocityCircuitBreaker {
  constructor() {
    // Configurable thresholds
    this.rollingWindowMs = 60 * 1000; // 60 seconds window
    this.maxCumulativeSpendPerWindow = 5000; // $5,000 max cumulative spend per minute
    this.maxActionsPerWindow = 5; // Max 5 high-impact actions per minute
    this.cooldownPeriodMs = 45 * 1000; // 45 seconds lockdown when tripped

    // In-memory state tracking: agentId -> { actions: [], state: 'CLOSED'|'TRIPPED'|'HALF_OPEN', trippedAt: null }
    this.agentBreakers = new Map();
    this.circuitTripLog = []; // Journal of security trip events

    // Periodic sweep every 60s for idle agent records older than 10 minutes
    this._cleanupInterval = setInterval(() => {
      const staleThreshold = Date.now() - (10 * 60 * 1000);
      for (const [id, breaker] of this.agentBreakers.entries()) {
        if (breaker.state === 'CLOSED' && breaker.recentActions.length === 0 && (!breaker.trippedAt || breaker.trippedAt < staleThreshold)) {
          this.agentBreakers.delete(id);
        }
      }
    }, 60000);
    if (this._cleanupInterval.unref) {
      this._cleanupInterval.unref();
    }
  }

  _getAgentState(agentId) {
    if (!this.agentBreakers.has(agentId)) {
      this.agentBreakers.set(agentId, {
        agentId,
        state: 'CLOSED',
        trippedAt: null,
        tripReason: null,
        recentActions: []
      });
    }
    const breaker = this.agentBreakers.get(agentId);

    // Check if cooldown elapsed
    if (breaker.state === 'TRIPPED' && Date.now() - breaker.trippedAt > this.cooldownPeriodMs) {
      breaker.state = 'HALF_OPEN';
    }

    // Prune events outside rolling window
    const cutoff = Date.now() - this.rollingWindowMs;
    breaker.recentActions = breaker.recentActions.filter(a => a.timestamp > cutoff);

    return breaker;
  }

  /**
   * Evaluates proposed action against blast-radius velocity rules.
   */
  checkVelocity({ agentId, toolName, parameters = {} }) {
    const breaker = this._getAgentState(agentId);
    const amount = Number(parameters.amount || 0);

    // 1. If currently TRIPPED, reject immediately
    if (breaker.state === 'TRIPPED') {
      const remainingCooldown = Math.max(0, Math.ceil((breaker.trippedAt + this.cooldownPeriodMs - Date.now()) / 1000));
      return {
        allowed: false,
        tripped: true,
        reason: `CIRCUIT_BREAKER_ACTIVE: Agent '${agentId}' is quarantined due to velocity breach (${breaker.tripReason}). Cooldown: ${remainingCooldown}s remaining.`,
        circuitState: 'TRIPPED',
        cooldownRemainingSeconds: remainingCooldown
      };
    }

    // 2. Calculate current window stats
    const currentWindowActionsCount = breaker.recentActions.length;
    const currentWindowSpend = breaker.recentActions.reduce((sum, a) => sum + (a.amount || 0), 0);

    const projectedSpend = currentWindowSpend + amount;
    const projectedCount = currentWindowActionsCount + 1;

    // 3. Check cumulative spend threshold (Anti-Siphon Defense)
    if (amount > 0 && projectedSpend > this.maxCumulativeSpendPerWindow) {
      this._tripBreaker(breaker, {
        reason: `Cumulative financial velocity breached: Projected $${projectedSpend} in 60s exceeds cap of $${this.maxCumulativeSpendPerWindow}`,
        triggerAction: toolName,
        attemptedAmount: amount,
        priorWindowSpend: currentWindowSpend
      });

      return {
        allowed: false,
        tripped: true,
        reason: `CIRCUIT_BREAKER_TRIPPED: Anti-siphon defense activated! Cumulative rolling spend ($${projectedSpend}) exceeds $${this.maxCumulativeSpendPerWindow}/min cap.`,
        circuitState: 'TRIPPED',
        cooldownRemainingSeconds: Math.ceil(this.cooldownPeriodMs / 1000)
      };
    }

    // 4. Check action frequency limit (Runaway Loop Defense)
    const isCriticalTool = ['transfer_funds', 'issue_refund', 'drop_table', 'restart_service', 'modify_iam_policy'].includes(toolName);
    if (isCriticalTool && projectedCount > this.maxActionsPerWindow) {
      this._tripBreaker(breaker, {
        reason: `Action velocity breached: ${projectedCount} critical tool invocations in 60s exceeds cap of ${this.maxActionsPerWindow}`,
        triggerAction: toolName,
        attemptedAmount: amount,
        priorCount: currentWindowActionsCount
      });

      return {
        allowed: false,
        tripped: true,
        reason: `CIRCUIT_BREAKER_TRIPPED: Agent runaway loop detected! Frequency exceeded ${this.maxActionsPerWindow} actions/min.`,
        circuitState: 'TRIPPED',
        cooldownRemainingSeconds: Math.ceil(this.cooldownPeriodMs / 1000)
      };
    }

    return {
      allowed: true,
      tripped: false,
      circuitState: breaker.state,
      currentWindowSpend,
      currentWindowActionsCount,
      projectedSpend,
      headroomRemaining: Math.max(0, this.maxCumulativeSpendPerWindow - projectedSpend)
    };
  }

  /**
   * Records successfully executed action into agent's rolling window.
   */
  recordExecution({ agentId, toolName, amount = 0, actionId }) {
    const breaker = this._getAgentState(agentId);
    breaker.recentActions.push({
      actionId: actionId || `act_${Date.now()}`,
      toolName,
      amount: Number(amount || 0),
      timestamp: Date.now()
    });

    if (breaker.state === 'HALF_OPEN') {
      breaker.state = 'CLOSED'; // Successfully passed probe trial
    }
  }

  _tripBreaker(breaker, details) {
    breaker.state = 'TRIPPED';
    breaker.trippedAt = Date.now();
    breaker.tripReason = details.reason;

    const event = {
      eventId: `cb_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      agentId: breaker.agentId,
      timestamp: new Date().toISOString(),
      details
    };

    this.circuitTripLog.unshift(event);
    if (this.circuitTripLog.length > 50) this.circuitTripLog.pop();
  }

  manualReset(agentId) {
    const breaker = this.agentBreakers.get(agentId);
    if (breaker) {
      breaker.state = 'CLOSED';
      breaker.trippedAt = null;
      breaker.tripReason = null;
      breaker.recentActions = [];
      return { success: true, message: `Circuit breaker for agent '${agentId}' reset to CLOSED.` };
    }
    return { success: false, message: `Agent '${agentId}' not found.` };
  }

  updateThresholds({ maxCumulativeSpend, maxActions, windowSeconds, cooldownSeconds }) {
    if (maxCumulativeSpend) this.maxCumulativeSpendPerWindow = Number(maxCumulativeSpend);
    if (maxActions) this.maxActionsPerWindow = Number(maxActions);
    if (windowSeconds) this.rollingWindowMs = Number(windowSeconds) * 1000;
    if (cooldownSeconds) this.cooldownPeriodMs = Number(cooldownSeconds) * 1000;
    return this.getSettings();
  }

  getSettings() {
    return {
      maxCumulativeSpendPerWindow: this.maxCumulativeSpendPerWindow,
      maxActionsPerWindow: this.maxActionsPerWindow,
      rollingWindowSeconds: this.rollingWindowMs / 1000,
      cooldownSeconds: this.cooldownPeriodMs / 1000
    };
  }

  getStatus() {
    const agents = {};
    for (const [id, b] of this.agentBreakers.entries()) {
      agents[id] = {
        agentId: id,
        state: b.state,
        trippedAt: b.trippedAt,
        tripReason: b.tripReason,
        activeEventsCount: b.recentActions.length,
        currentRollingSpend: b.recentActions.reduce((s, a) => s + (a.amount || 0), 0)
      };
    }

    return {
      settings: this.getSettings(),
      agents,
      tripLog: this.circuitTripLog.slice(0, 10),
      totalTripsRecorded: this.circuitTripLog.length
    };
  }
}

export const velocityCircuitBreaker = new VelocityCircuitBreaker();
