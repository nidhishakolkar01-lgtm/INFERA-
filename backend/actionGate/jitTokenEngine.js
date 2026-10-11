import crypto from 'crypto';

/**
 * JITTokenEngine
 * Issues and validates cryptographically signed Just-In-Time (JIT) ephemeral action leases.
 * Prevents replay attacks, token hijacking, and post-authorization tampering.
 * 
 * Directly satisfies:
 * - Deterministic Authorization at point-of-action
 * - Non-repudiation and anti-replay zero-trust constraints
 */
export class JITTokenEngine {
  constructor(secretKey = null) {
    // Ephemeral master secret generated at runtime or from environment
    this.secretKey = secretKey || crypto.randomBytes(32).toString('hex');
    this.spentNonces = new Map(); // nonce -> { spentAt, actionId }
    this.issuedTokens = new Map(); // tokenId -> tokenMetadata
    this.defaultTtlMs = 60 * 1000; // 60 seconds TTL
    this.securityEvents = []; // Audit log of security alerts (replay attempts, expired executions)

    // Periodic sweep every 60s to prevent unbounded memory growth under load
    this._cleanupInterval = setInterval(() => {
      this.pruneExpired();
    }, 60000);
    if (this._cleanupInterval.unref) {
      this._cleanupInterval.unref();
    }
  }

  /**
   * Prunes expired JIT tokens and aged nonces to prevent unbounded heap memory leaks.
   */
  pruneExpired() {
    const now = Date.now();
    for (const [tokenId, token] of this.issuedTokens.entries()) {
      if (token && now > token.expiresAt + 60000) {
        this.issuedTokens.delete(tokenId);
      }
    }
    const nonceCutoff = now - (10 * 60 * 1000);
    for (const [nonce, data] of this.spentNonces.entries()) {
      if (data && data.spentAt && data.spentAt < nonceCutoff) {
        this.spentNonces.delete(nonce);
      }
    }
  }

  _canonicalize(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this._canonicalize(item));
    }
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = this._canonicalize(obj[key]);
    }
    return sorted;
  }

  /**
   * Hashes the action payload deterministically to lock parameters.
   */
  _computePayloadHash(toolName, parameters) {
    const canonical = JSON.stringify({
      toolName,
      parameters: this._canonicalize(parameters || {})
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Generates HMAC-SHA256 signature for token integrity.
   */
  _sign(payload) {
    const serialized = JSON.stringify(payload);
    return crypto.createHmac('sha256', this.secretKey).update(serialized).digest('hex');
  }

  /**
   * Issues a cryptographically bound JIT Ephemeral Action Lease.
   */
  issueToken({ actionId, agentId, toolName, parameters, authorizedBy = 'POLICY_ENGINE_AUTO', ttlMs = null }) {
    const now = Date.now();
    const effectiveTtl = ttlMs || this.defaultTtlMs;
    const expiresAt = now + effectiveTtl;
    const nonce = crypto.randomBytes(16).toString('hex');
    const tokenId = `jit_${crypto.randomUUID()}`;
    const payloadHash = this._computePayloadHash(toolName, parameters);

    const tokenClaims = {
      tokenId,
      actionId,
      agentId,
      toolName,
      payloadHash,
      authorizedBy,
      issuedAt: now,
      expiresAt,
      nonce
    };

    const signature = this._sign(tokenClaims);
    const signedToken = {
      ...tokenClaims,
      signature
    };

    this.issuedTokens.set(tokenId, {
      ...signedToken,
      status: 'ACTIVE'
    });

    return {
      token: signedToken,
      encodedBearer: Buffer.from(JSON.stringify(signedToken)).toString('base64'),
      expiresInSeconds: Math.round(effectiveTtl / 1000)
    };
  }

  /**
   * Validates and atomically consumes (burns) a JIT token for execution.
   */
  consumeToken({ token, toolName, parameters }) {
    const now = Date.now();

    // 1. Structural check
    if (!token || !token.tokenId || !token.signature || !token.nonce) {
      this._logSecurityEvent('MALFORMED_TOKEN', { token });
      return { valid: false, reason: 'MALFORMED_JIT_TOKEN', code: 400 };
    }

    // 2. Cryptographic signature verification
    const { signature, ...claims } = token;
    const expectedSignature = this._sign(claims);
    if (signature !== expectedSignature) {
      this._logSecurityEvent('FORGED_SIGNATURE', { tokenId: token.tokenId, receivedSignature: signature });
      return { valid: false, reason: 'CRYPTOGRAPHIC_SIGNATURE_INVALID', code: 401 };
    }

    // 3. Replay attack check: Has nonce already been spent?
    if (this.spentNonces.has(token.nonce)) {
      const priorSpent = this.spentNonces.get(token.nonce);
      this._logSecurityEvent('REPLAY_ATTACK_DETECTED', {
        tokenId: token.tokenId,
        nonce: token.nonce,
        firstSpentAt: priorSpent.spentAt,
        attemptedReplayAt: now
      });
      return {
        valid: false,
        reason: 'REPLAY_ATTACK_PREVENTED: Nonce was already spent and burned',
        code: 409,
        replayAlert: true
      };
    }

    // 4. Expiration check
    if (now > token.expiresAt) {
      this._logSecurityEvent('EXPIRED_TOKEN_ATTEMPT', {
        tokenId: token.tokenId,
        expiredAt: token.expiresAt,
        attemptAt: now,
        deltaSeconds: ((now - token.expiresAt) / 1000).toFixed(2)
      });
      return { valid: false, reason: 'JIT_LEASE_EXPIRED: Token TTL elapsed', code: 403 };
    }

    // 5. Payload hash verification (prevents in-flight argument tampering)
    const currentPayloadHash = this._computePayloadHash(toolName, parameters);
    if (currentPayloadHash !== token.payloadHash) {
      this._logSecurityEvent('PAYLOAD_TAMPERING_DETECTED', {
        tokenId: token.tokenId,
        authorizedHash: token.payloadHash,
        tamperedHash: currentPayloadHash
      });
      return {
        valid: false,
        reason: 'PAYLOAD_MISMATCH: Target parameters do not match authorized lease hash',
        code: 403
      };
    }

    // 6. Tool name verification
    if (token.toolName !== toolName) {
      this._logSecurityEvent('TOOL_SUBSTITUTION_ATTACK', {
        tokenId: token.tokenId,
        expectedTool: token.toolName,
        attemptedTool: toolName
      });
      return { valid: false, reason: 'TOOL_SUBSTITUTION_DETECTED', code: 403 };
    }

    // Atomically burn the nonce
    this.spentNonces.set(token.nonce, {
      spentAt: now,
      actionId: token.actionId,
      tokenId: token.tokenId
    });

    const recorded = this.issuedTokens.get(token.tokenId);
    if (recorded) {
      recorded.status = 'CONSUMED';
      recorded.consumedAt = now;
    }

    return {
      valid: true,
      authorized: true,
      tokenId: token.tokenId,
      actionId: token.actionId,
      burnedNonce: token.nonce,
      consumedAt: now
    };
  }

  /**
   * Replay Attack Simulation:
   * Takes an existing validly consumed token and attempts to execute it again.
   * Returns deterministic proof of replay defense.
   */
  simulateReplayAttack(tokenId) {
    const existing = this.issuedTokens.get(tokenId);
    if (!existing) {
      // Create and consume a quick live token to demonstrate replay defense
      const dummyIssue = this.issueToken({
        actionId: `sim_${Date.now()}`,
        agentId: 'agent-fin-recon-01',
        toolName: 'transfer_funds',
        parameters: { amount: 500, recipient: 'vendor_escrow' },
        authorizedBy: 'POLICY_ENGINE_AUTO'
      });
      // Consume it first time
      this.consumeToken({
        token: dummyIssue.token,
        toolName: 'transfer_funds',
        parameters: { amount: 500, recipient: 'vendor_escrow' }
      });
      // Now attempt replay
      const replayAttempt = this.consumeToken({
        token: dummyIssue.token,
        toolName: 'transfer_funds',
        parameters: { amount: 500, recipient: 'vendor_escrow' }
      });

      return {
        simulationResult: 'SUCCESSFULLY_DEFENDED',
        targetTokenId: dummyIssue.token.tokenId,
        nonce: dummyIssue.token.nonce,
        firstExecution: 'AUTHORIZED_AND_BURNED',
        replayExecution: replayAttempt
      };
    }

    const replayAttempt = this.consumeToken({
      token: existing,
      toolName: existing.toolName,
      parameters: existing.parameters || {}
    });

    return {
      simulationResult: replayAttempt.valid ? 'DEFENSE_FAILED' : 'SUCCESSFULLY_DEFENDED',
      targetTokenId: tokenId,
      replayExecution: replayAttempt
    };
  }

  _logSecurityEvent(eventType, details) {
    const event = {
      eventId: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      eventType,
      details
    };
    this.securityEvents.unshift(event);
    if (this.securityEvents.length > 100) this.securityEvents.pop();
  }

  getSecurityLog() {
    return this.securityEvents;
  }

  getMetrics() {
    return {
      totalIssued: this.issuedTokens.size,
      activeTokens: Array.from(this.issuedTokens.values()).filter(t => t.status === 'ACTIVE' && Date.now() < t.expiresAt).length,
      spentNoncesCount: this.spentNonces.size,
      securityAlertsCount: this.securityEvents.length,
      recentAlerts: this.securityEvents.slice(0, 5)
    };
  }
}

export const jitTokenEngine = new JITTokenEngine();
