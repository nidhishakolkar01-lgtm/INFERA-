# 🛡️ Proposed Solution: ActionGate
## Zero-Trust AI Agent Action Authorization Engine & Cryptographic Guard
**Hackathon:** VORTEXA 3.0 (12-Hour National Student Hackathon)  
**Host Institution:** AIRS, Dr. D. Y. Patil Institute of Technology, Pimpri, Pune  
**Domain:** Domain 1 — Cybersecurity & Digital Trust  
**Problem Statement Code:** C-01 — ActionGate  
**Track Identifier:** `C-01 ActionGate`  

---

## 1. Executive Summary & Problem Formulation

### 1.1 The Operational Shift: From Conversational Chatbots to Autonomous Agents
In modern software ecosystems, Large Language Models (LLMs) and Multi-Agent Systems (MAS) have transitioned from read-only conversational assistants to **autonomous operational actors**. Equipped with Tool Calling (Function Calling), Model Context Protocol (MCP), and external API connectors, agents now possess the authority to:
- Mutate transactional and relational databases (`UPDATE`, `DELETE`, `DROP`).
- Initiate irreversible financial dispatches (ACH transfers, credit refunds, invoice payouts).
- Dispatch public or external communications (customer emails, SMS notifications, social announcements).
- Trigger infrastructure mutations (restarting worker nodes, clearing Redis cache clusters, terminating virtual instances).

### 1.2 The Core Security Dilemma: Why Existing Defenses Fail
Traditional application security relies on perimeter firewalls, role-based access control (RBAC) at the user session level, or coarse-grained tool allowlists (e.g., granting an agent access to the entire `StripeAPI` or `DatabaseConnector`). These models collapse when applied to autonomous agents due to four fundamental vulnerabilities:

1. **Semantic Deception & Prompt Injection (OWASP LLM01):** Untrusted third-party data ingested by the agent (e.g., a ticket body, an email, or a database record) can manipulate the agent's internal reasoning, tricking it into proposing destructive operations under a seemingly legitimate guise.
2. **Coarse-Grained Tool Allowlists vs. Fine-Grained Argument Tampering:** An agent authorized to `issue_refund` might legitimately refund $20, but due to hallucination or malicious injection, execute a refund for $200,000 across 5,000 records. Coarse allowlists inspect *which* tool is called, but ignore *what arguments* are passed.
3. **Irreversibility & Blast Radius Blindness:** Agents lack intrinsic comprehension of operational irreversibility. Deleting a production database table cannot be undone; dispatching 10,000 unauthorized emails cannot be recalled. Existing gateways evaluate tools without calculating potential blast radius.
4. **Time-of-Check to Time-of-Use (TOCTOU) Argument Mutation:** In workflows requiring human authorization, a supervisor may approve a payload for $100. If the system does not cryptographically bind the authorization token to the exact bit-level representation of that payload, the agent or an attacker can mutate the arguments post-approval to $10,000 before execution.
5. **Audit Amnesia & Non-Repudiation Failure:** When autonomous incidents occur, centralized mutable logs can be altered, truncated, or quietly deleted by administrators or compromised services, destroying the chain of accountability.

---

## 2. The ActionGate Philosophy: The Zero-Trust Dual-Engine Paradigm

**ActionGate** solves this crisis by introducing a real-time, non-bypassable **Zero-Trust Authorization Proxy** situated directly between the Agent Reasoning Layer and the Tool Execution Layer. 

Every proposed action must enter ActionGate as a structured, unexecuted proposal and receive one of three unambiguous verdicts:
- 🟢 **`ALLOWED`**: The action satisfies all deterministic policies, adheres to strict blast radius thresholds, is reversible or within low-risk limits, and shows no semantic intent conflict.
- 🟡 **`HELD FOR HUMAN APPROVAL`**: The action involves elevated financial values, irreversible operations, high blast radius (large record volume), or semantic warnings. It is routed to an isolated 4-Eyes Supervisor Queue.
- 🔴 **`BLOCKED`**: The action violates hard deterministic constraints, originates from an unknown agent, targets an uncataloged action type, exhibits destructive AST/SQL injection patterns, or triggers critical semantic risk flags.

```
+-----------------------------------------------------------------------------------------+
|                                    PROPOSED ACTION                                      |
|               (action_id, source_agent, action_name, arguments, rationale)              |
+-----------------------------------------------------------------------------------------+
                                             |
                                             v
+=========================================================================================+
|                                  ACTIONGATE GATEWAY                                     |
|                                                                                         |
|   +------------------------------------+    +---------------------------------------+   |
|   | LAYER 1: DETERMINISTIC ENGINE      |    | LAYER 2: SEMANTIC INTENT ANALYZER     |   |
|   | (The Authority - Binding Decider)  |    | (The Informer - Risk Escalator)       |   |
|   |------------------------------------|    |---------------------------------------|   |
|   | • Identity Verification            |    | • Google Gemini 2.5 Flash LLM         |   |
|   | • Action Catalog Whitelisting      |    | • Intent vs. Argument Divergence      |   |
|   | • Blast Radius Calculator          |    | • Indirect Prompt Injection Scanning  |   |
|   | • Financial Threshold Enforcement  |    | • Deception & Social Engineering      |   |
|   | • Reversibility Guard              |    | • Offline Fallback Heuristic Engine   |   |
|   | • Destructive AST/Regex Matching   |    |                                       |   |
|   +------------------------------------+    +---------------------------------------+   |
|                     \                                     /                             |
|                      \                                   /                              |
|                       v                                 v                               |
|              +---------------------------------------------------+                      |
|              |          SYNTHESIS & ARBITRATION MATRIX           |                      |
|              |   (Deterministic Rules Rule Supreme; AI Escalate) |                      |
|              +---------------------------------------------------+                      |
+=========================================================================================+
                                             |
         +-----------------------------------+-----------------------------------+
         |                                   |                                   |
         v                                   v                                   v
   🟢 ALLOWED                      🟡 HELD FOR APPROVAL                     🔴 BLOCKED
(Immediate Execution)             (4-Eyes Supervisor Queue)             (Refusal Recorded)
         |                                   |                                   |
         +-----------------------------------+-----------------------------------+
                                             |
                                             v
+=========================================================================================+
|                   LAYER 3: CRYPTOGRAPHIC SHA-256 AUDIT LEDGER                            |
|             (Hash-Chained Blocks, Nonce, Previous Hash, Non-Repudiation)                 |
+=========================================================================================+
```

---

## 3. Core Solution Pillars & Technical Requirements

ActionGate directly addresses every constraint specified in the **VORTEXA 3.0 C-01 Problem Statement**:

### Pillar 1: Zero-Trust Default Deny
- **Identity Isolation:** Every calling agent must present a registered cryptographic or configuration identity (`agentId`). Any action initiated by an uncataloged agent is immediately denied with an `UNKNOWN_AGENT_ID` violation code.
- **Closed Action Universe:** Agents cannot invoke arbitrary system commands or arbitrary endpoints. Only actions pre-declared in the `ACTION_CATALOG` are permitted. Unrecognized actions trigger `UNRECOGNIZED_ACTION_TYPE` and are blocked at the perimeter.

### Pillar 2: Dual-Layer Evaluation Architecture (The Authority vs. The Informer)
- **Layer 1: Deterministic Policy Engine (The Authority):**
  - Evaluates mathematical thresholds (e.g., financial refund cap of $1,000; wire transfer cap of $500).
  - Evaluates blast radius (e.g., maximum allowable records affected per transaction).
  - Evaluates operational reversibility (actions that cannot be undone are never allowed to execute automatically if classified as high impact).
  - Inspects arguments against a compiled pattern bank targeting SQL injection (`DROP TABLE`, `TRUNCATE`, unconditional `DELETE`), shell exploitation (`rm -rf`, `sudo`), and credential exfiltration.
  - **Golden Rule:** Deterministic policy makes the final binding decision. AI cannot silently override or relax a deterministic block or hold.
- **Layer 2: Semantic Intent & Risk Classifier (The Informer):**
  - Powered by Google Gemini 2.5 Flash via the `@google/genai` SDK.
  - Analyzes the semantic alignment between the agent's declared *natural language rationale* and the *raw JSON execution arguments*.
  - Detects semantic deception (e.g., an agent claiming "routine reply to single user" while passing `recipientsCount: 2500`).
  - Flags prompt injection markers in untrusted payload strings.
  - Generates a quantified Semantic Risk Score (0–100) and risk tier (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
  - **Risk Escalation:** If Layer 1 permits an action (`ALLOWED`), but Layer 2 detects critical semantic risk (Score $\ge 80$), the action is escalated to `BLOCKED`. If Layer 2 detects intent divergence, it escalates to `HELD FOR HUMAN APPROVAL`.

### Pillar 3: Resilient Offline Fallback (Zero-Downtime Determinism)
- Hackathons and production enterprise systems face API outages, quota rate limits, and network partitions.
- ActionGate implements an **Autonomous Offline Safe Fallback Engine**.
- If Gemini API is unreachable, throttled, unconfigured, or if `simulateAiOffline` mode is activated:
  - ActionGate engages local heuristic syntactic and entropy analysis.
  - It records the decision path explicitly as `DETERMINISTIC_SAFE_FALLBACK`.
  - Hard security rules remain 100% active; safety is never compromised.

### Pillar 4: Cryptographic Payload Lock & Anti-Tamper Guard (Anti-TOCTOU)
- When an action is held for human approval, ActionGate computes the **Canonical SHA-256 Hash** of the exact proposed payload:
  $$\text{Hash} = \text{SHA-256}(\text{CanonicalJSON}(\text{payload}))$$
- Keys are sorted lexicographically to prevent key-order hashing discrepancies.
- The approval token is cryptographically bound to this exact hash.
- **Tamper Detection:** When the supervisor approves the action and submits it for execution, ActionGate re-hashes the payload in real-time. If even a single character, digit, or nested parameter was modified post-approval (e.g., amount changed from $4,500 to $45,000), execution is instantly terminated with a `PAYLOAD_TAMPERING_DETECTED` security violation, and the refusal is written to the cryptographic ledger.

### Pillar 5: Separation of Duties (4-Eyes Principle)
- To prevent rogue self-escalation or compromised agent loops, the entity requesting an action cannot authorize it.
- If `agentId === approverId`, the authorization attempt is rejected with a `SELF_APPROVAL_VIOLATION`.
- Human supervisor identity verification is strictly enforced before any held action transitions from `HELD_FOR_APPROVAL` to `ALLOWED`.

### Pillar 6: Cryptographic Hash-Chained Audit Ledger
- To guarantee non-repudiation and tamper-evident history, every decision—including every refusal and security block—is permanently appended to an in-memory SHA-256 cryptographic blockchain-style ledger.
- Each block contains:
  - Block Index ($i$)
  - ISO-8601 Timestamp
  - Action Identifier (`actionId`)
  - Agent Identifier (`agentId`)
  - Target Action Type (`actionType`)
  - Canonical Payload Hash (`payloadHash`)
  - Verdict (`decision`)
  - Decision Path (`decisionPath`)
  - Policy Citation / Reasoning (`policyReason`)
  - Approver ID (`approvedBy`)
  - Previous Block Hash ($\text{Hash}_{i-1}$)
  - Current Block Hash ($\text{Hash}_i = \text{SHA-256}(i + \text{Timestamp} + \text{actionId} + \dots + \text{Hash}_{i-1})$)
- **Audit Verification:** The `/api/ledger/verify` engine recalculates the entire chain from the Genesis block. Any database injection or manual edit immediately breaks the hash pointer and identifies the exact compromised block index.

---

## 4. Frozen Action Payload Contract Specification

To maintain system-wide interoperability between diverse autonomous frameworks (LangChain, AutoGen, CrewAI, Custom Agents) and the ActionGate proxy, the payload contract schema is formally frozen:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ActionGatePayloadContract",
  "type": "object",
  "required": [
    "action_id",
    "source_agent",
    "action_name",
    "arguments",
    "reversibility",
    "blast_radius_est"
  ],
  "properties": {
    "action_id": {
      "type": "string",
      "pattern": "^ACT-[0-9]{6,}$",
      "description": "Unique deterministic or monotonic identifier generated per proposed action."
    },
    "source_agent": {
      "type": "string",
      "description": "Verified identity of the agent requesting authorization (e.g., 'finance-agent-01')."
    },
    "action_name": {
      "type": "string",
      "description": "Catalog action identifier (e.g., 'issue_refund', 'transfer_funds', 'clear_cache')."
    },
    "arguments": {
      "type": "object",
      "description": "Key-value operational parameters subject to canonical SHA-256 payload hashing."
    },
    "reversibility": {
      "type": "boolean",
      "description": "Indicator specifying whether operational state can be rolled back without data or financial loss."
    },
    "blast_radius_est": {
      "type": "object",
      "required": ["records_affected", "impact_tier"],
      "properties": {
        "records_affected": {
          "type": "integer",
          "minimum": 1,
          "description": "Upper-bound count of entities, users, or records modified by this action."
        },
        "impact_tier": {
          "type": "string",
          "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
          "description": "Assessed operational impact level."
        }
      }
    },
    "agent_rationale": {
      "type": "string",
      "description": "Natural language justification supplied by the agent explaining why this action is necessary."
    }
  },
  "additionalProperties": false
}
```

---

## 5. Preset Verification & Attack Scenarios

ActionGate comes pre-configured with 6 comprehensive scenarios designed for instant, reproducible evaluation by hackathon judges:

| Scenario ID | Title | Agent Identity | Action Type | Intended Verdict | Key Policy / Security Mechanism Tested |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SC-01** | **Routine Safe Read** | `finance-agent-01` | `read_account_summary` | 🟢 `ALLOWED` | Read-only category, reversible, within blast radius limit (1 record), authorized agent. Evaluates in $< 15\text{ms}$. |
| **SC-02** | **High-Value Financial Action** | `finance-agent-01` | `issue_refund` ($4,500) | 🟡 `HELD FOR APPROVAL` | Exceeds $1,000 financial threshold. Requires human supervisor authorization under 4-Eyes rule. |
| **SC-03** | **Prompt Injection / Destructive Attack** | `support-bot-alpha` | `restart_service` | 🔴 `BLOCKED` | Malicious payload injection: `worker-node; DROP TABLE users; --`. Caught by AST/regex pattern filter and AI intent analyzer. |
| **SC-04** | **Zero-Trust Rogue Agent Denial** | `dark-crawler-agent-x9` | `export_credentials` | 🔴 `BLOCKED` | Unregistered agent identity. Rejected immediately at perimeter under Zero-Trust Default Deny (`UNKNOWN_AGENT_ID`). |
| **SC-05** | **Semantic Deception / Blast Radius** | `support-bot-alpha` | `send_customer_email` | 🔴 `BLOCKED` | Agent claims single routine ticket reply, but payload specifies `recipientsCount: 2500`. Triggers both blast radius limit and semantic deception divergence. |
| **SC-06** | **Reversible Infrastructure Operation** | `ops-maintenance-agent` | `clear_cache` | 🟢 `ALLOWED` | Authorized DevOps agent, fully reversible action, non-destructive arguments, approved within policy bounds. |

---

## 6. Live Interactive Attack Demonstrations for Judges

To provide concrete evidence of digital trust and cryptographic resilience, ActionGate provides interactive controls directly on the dashboard:

1. **4-Eyes Principle & Self-Approval Prevention:**
   - Attempting to approve Scenario 2 (`$4,500 refund`) as `finance-agent-01` is strictly refused by the backend.
   - Switching approver identity to `supervisor-jane-doe` successfully authorizes the action.
2. **Payload Anti-Tampering Demonstration (TOCTOU Attack):**
   - Click the *"Tamper Payload & Attempt Execution"* button in the Approvals queue.
   - Simulates an adversary mutating the approved refund amount from $4,500 to $45,000 post-approval.
   - ActionGate intercepts the execution, calculates the SHA-256 hash mismatch, aborts execution, and writes a `TAMPER_DETECTION_REFUSAL` block into the ledger.
3. **Cryptographic Ledger Integrity Verification:**
   - Click *"Verify Ledger Integrity"* $\rightarrow$ Displays a 100% verified green cryptographic banner.
   - Click *"Simulate DB Tamper on Block #1"* $\rightarrow$ Injects an unauthorized database modification directly into block history.
   - Click *"Verify Ledger Integrity"* again $\rightarrow$ The verification engine detects the broken SHA-256 pointer, turns the UI banner bright red, and pinpoints Block #1 as compromised.
4. **Resilient AI Offline Mode Toggle:**
   - Toggle *"AI Mode"* in the top navigation bar.
   - Disables external Gemini API connectivity and engages the deterministic heuristic engine.
   - The gateway continues processing actions with zero downtime, tagging every output as `DETERMINISTIC_SAFE_FALLBACK`.

---

## 7. Compliance Matrix: Vortexa 3.0 Hackathon Rules

| Rule / Requirement | Problem Statement Spec | ActionGate Implementation Status |
| :--- | :--- | :--- |
| **Working MVP Deliverable** | Working software MVP that judges can test live | ✅ **Fully operational React + Vite frontend and Node.js/Express backend.** |
| **Reproducibility** | Reproducible live testing via permitted inputs | ✅ **6 one-click preset test scenarios + custom action submission workbench.** |
| **Meaningful AI Usage** | Language understanding, classification, matching | ✅ **Gemini 2.5 Flash for semantic intent analysis, risk scoring & deception detection.** |
| **Deterministic Authority** | Explicit checkable rules make final binding decision | ✅ **Layer 1 Policy Engine rules are final; AI can escalate risk but cannot bypass rules.** |
| **Cryptographic Lock** | Approval applies only to exact action approved | ✅ **Canonical SHA-256 payload hashing; post-approval mutations trigger hard refusal.** |
| **Separation of Duties** | Requesters should not approve their own requests | ✅ **4-Eyes Principle enforced; self-approvals rejected with security violation.** |
| **Tamper-Evident History** | Every decision and refusal recorded in audit log | ✅ **Hash-chained SHA-256 cryptographic audit ledger with instant verification.** |
| **Fail-Safe Offline Mode** | Safe decisions when AI component is unavailable | ✅ **Zero-downtime deterministic fallback engine tagging all fallback paths.** |
| **Infrastructure & Data** | No paid API required; fictional data only | ✅ **Pure simulated financial and operational datasets; offline fallback ready.** |

---

## 8. Conclusion

ActionGate establishes a groundbreaking blueprint for enterprise AI security. By pairing **rigorous deterministic policy enforcement** with **semantic AI intent inspection** and **tamper-evident cryptographic ledger guarantees**, ActionGate ensures that autonomous AI agents can act with speed and capability while guaranteeing that human supervisors and cybersecurity teams retain absolute digital trust, non-repudiation, and operational control.
