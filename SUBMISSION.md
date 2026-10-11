# 🛡️ ActionGate: AI Agent Action Authorization Engine
**VORTEXA 3.0 Hackathon Submission**  
**Track:** Domain 1 — Cybersecurity & Digital Trust (`C-01`)  
**Host:** Dr. D. Y. Patil Institute of Technology, Pimpri, Pune  

---

## 📌 Executive Summary
As autonomous AI agents evolve from conversational assistants into operational actors that execute database queries, issue financial refunds, send emails, and mutate cloud infrastructure, existing security models fail. Current architectures rely on coarse tool allowlists that ignore parameter payloads, blast radius, reversibility, and argument tampering.

**ActionGate** is a real-time Zero-Trust Authorization Proxy and Cryptographic Guard designed specifically for autonomous AI agents. Every proposed agent action is intercepted, subjected to deterministic policy rules and semantic risk classification, and resolved into one of three strict verdicts: **ALLOWED**, **BLOCKED**, or **HELD FOR HUMAN APPROVAL**.

---

## 🎯 Key Capabilities & Rulebook Adherence

### 1. Zero-Trust Default Deny
Unknown agent identities or unrecognized action types are **blocked by default** (`UNRECOGNIZED_ACTION_TYPE` / `UNKNOWN_AGENT_ID`).

### 2. Dual-Layer Evaluation Architecture
- **Layer 1: Deterministic Policy Engine (The Authority):**
  - Evaluates hard constraints: monetary thresholds (> $1,000 holds for approval), blast radius limits, reversibility status, and forbidden destructive patterns (`DROP TABLE`, `rm -rf`, bulk deletes).
- **Layer 2: Semantic Intent & Risk Classifier (The Informer):**
  - Uses Google Gemini 2.5 Flash to detect prompt injections, semantic deception, or discrepancies between what the agent claims in its reasoning vs what is inside the payload arguments.
- **Rulebook Compliance:** AI informs and can escalate risk, but deterministic rules make the final binding decision.

### 3. Fail-Safe Offline Fallback
When external AI APIs are offline, throttled, or unreachable, ActionGate automatically engages its **Deterministic Safe Fallback Engine**, tagging the decision path as `DETERMINISTIC_SAFE_FALLBACK` with zero downtime.

### 4. Cryptographic Payload Lock & Anti-Tampering
Approvals apply strictly to the exact SHA-256 hash of the payload approved. If an agent or adversary alters arguments after authorization (e.g., mutating `$4,500` to `$45,000`), ActionGate halts execution with a `PAYLOAD_TAMPERING_DETECTED` violation.

### 5. Separation of Duties (4-Eyes Principle)
Requesters are cryptographically prevented from approving their own actions. A supervisor identity is required.

### 6. SHA-256 Tamper-Evident Audit Ledger
Every decision and refusal is recorded in a cryptographic hash-chained audit block (blockchain-style integrity). Any unauthorized modification to historic records breaks the hash pointer and triggers an immediate alert during verification.

---

## 🛠️ Mandatory Tech Stack & AI Tool Declaration
*(Compliant with Vortexa 3.0 Rule #2 - AI & Tool Usage Declaration)*

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide Icons, Axios
- **Backend:** Node.js, Express, Native Node `crypto`
- **AI Models & SDKs:** Google Gemini 2.5 Flash (`@google/genai` SDK)
- **AI Coding Assistants Used:** Google Antigravity (AI pair-programming assistant for boilerplate generation and test suite authoring)
- **Hashing Algorithms:** SHA-256 canonical payload hashing & HMAC-SHA256 authorization signatures

---

## 🚀 Quick Launch Instructions

### 1. Start Backend (Port 5000)
```bash
cd backend
npm run dev
```

### 2. Start Frontend (Port 3000)
```bash
cd frontend
npm run dev
```

Open your browser at `http://localhost:3000`.

---

## 🎤 2-Minute Judge Demo Script

1. **The Hook (30s):** Show a routine safe read (`read_account_summary`). It passes as **ALLOWED** in 12ms.
2. **The Financial Threshold & 4-Eyes Rule (30s):** Click Scenario 2 (`issue_refund $4,500`). ActionGate places it in **HELD FOR APPROVAL**. Try approving as `finance-agent-01` -> Blocked (Self-approval violation). Switch to `supervisor-jane-doe` -> Successfully authorized!
3. **The Tampering Attack (30s):** Click *"Tamper Payload & Attempt Execution"*. The payload amount changes post-approval -> ActionGate catches the SHA-256 mismatch and revokes authorization!
4. **The Cryptographic Ledger & Offline Fallback (30s):**
   - Click *"Verify Ledger Integrity"* -> Shows green 100% intact banner.
   - Click *"Tamper Block #1 in DB"* -> Verify again -> Banner turns red and highlights the compromised block!
   - Toggle *"AI Offline Mode"* -> Gateway seamlessly falls back to local deterministic rules with zero downtime.
