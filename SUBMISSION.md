# 🛡️ ActionGate: AI Agent Action Authorization Engine
**VORTEXA 3.0 Hackathon Official Submission**  
**Track:** Domain 1 — Cybersecurity & Digital Trust (`C-01 ActionGate`)  
**Host:** Dr. D. Y. Patil Institute of Technology, Pimpri, Pune  

---

## 📌 Executive Summary
As autonomous AI agents evolve from conversational assistants into operational actors that execute database queries, issue financial refunds, send emails, and mutate cloud infrastructure, existing security models fail. Current architectures rely on coarse tool allowlists that ignore parameter payloads, blast radius, reversibility, argument tampering, and prompt manipulation.

**ActionGate** is a real-time Zero-Trust Authorization Proxy and Cryptographic Guard designed specifically for autonomous AI agents. Every proposed agent action is intercepted at the point-of-action, subjected to deterministic policy rules and semantic risk classification, and resolved into one of three strict verdicts: **ALLOWED**, **BLOCKED**, or **HELD FOR HUMAN APPROVAL**.

---

## 🎯 Key Architectural Pillars & Problem Statement Alignment

### 1. Zero-Trust Default Deny & Policy Studio
- Unknown agent identities or unrecognized action types are **blocked by default** (`UNRECOGNIZED_ACTION_TYPE` / `UNKNOWN_AGENT_ID`).
- Administrators can adjust hard governance thresholds in real-time via the Policy Studio (financial transfer caps, max records limit, strict reversibility mode, zero-trust default deny).

### 2. Adversarial Red-Team Lab & Intent-Action Divergence Engine (OWASP LLM-01)
- **Problem Statement Alignment:** *"Their interpretation of a request can be wrong, and text they read can be written to manipulate them (prompt injection)."*
- **Live Vector Testing:** Real indirect prompt injections hidden in external documents, XML/markdown delimiter collisions (`</user_query><SYSTEM_OVERRIDE>`), and zero-width homoglyph character smuggling (`\u200B`).
- **Mathematical Intent Divergence:** Computes semantic and capability divergence between authorized user intent and synthesized tool arguments. Divergent actions exceeding the envelope are deterministically blocked with `BLOCKED_DIVERGENT_INTENT`.

### 3. RFC 6962 Merkle Tree Cryptographic Trust & In-Browser Verifier
- **Digital Trust & Non-Repudiation:** Elevates hash chains to a binary SHA-256 Merkle Tree with canonical Merkle Roots.
- **Independent WebCrypto Verifier:** Evaluators can verify leaf inclusion proofs directly in the browser via client-side WebCrypto SHA-256 without trusting the backend database.
- **1-Bit Tamper Demonstration:** Modifying a single bit recalculates the proof and shows immediate mathematical invalidation.

### 4. Just-In-Time (JIT) Ephemeral Action Leases & Anti-Replay Defense
- **Single-Use Ephemeral Tokens:** Authorized actions receive an HMAC-SHA256 signed lease with a 60-second TTL and a unique 128-bit cryptographic nonce.
- **Atomic Nonce Burning:** Once executed, the nonce is permanently burned. Replay attacks are rejected in `< 15ms` with `REPLAY_ATTACK_PREVENTED: Nonce was already spent and burned`.
- **Payload Hash Locking:** Prevents in-flight argument tampering between authorization and execution.

### 5. Separation of Duties (4-Eyes Principle)
- Requesters are cryptographically prevented from approving their own actions. A supervisor identity is required.

### 6. Zero Synthetic Data Guarantee
- Mutating system state (real bank treasury balances, real execution latencies in milliseconds).
- Genuine live host telemetry from Node.js `os` and `process` modules (real CPU model, active RAM in MB, system uptime).

### 7. Regulatory Compliance (SOC-2, ISO 27001, EU AI Act Article 14)
- Built-in audit compliance generator with verifiable digital HMAC signatures.

---

## 🛠️ Mandatory Tech Stack & AI Tool Declaration
*(Compliant with Vortexa 3.0 Rule #2 - AI & Tool Usage Declaration)*

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide Icons, native WebCrypto API
- **Backend:** Node.js, Express, native Node `crypto` module, `os` and `process`
- **AI Models & SDKs:** Google Gemini 2.5 Flash (`@google/genai` SDK) + local deterministic safe fallback engine
- **AI Coding Assistants Used:** Google Antigravity (pair-programming assistant for boilerplate generation, styling, and test scripts)
- **Hashing & Cryptography:** SHA-256 Merkle Trees, HMAC-SHA256 digital signatures, single-use nonces

---

## 🚀 Quick Launch & Verification

### Launch Backend (Port 5000):
```bash
cd backend
npm start
```

### Launch Frontend (Port 3000):
```bash
cd frontend
npm run dev
```

### Run All Test Suites:
```bash
cd backend
node test-api.js        # 8/8 Core policy & ledger tests
node test-advanced.js   # 100% Merkle tree, JIT anti-replay, & Adversarial tests
```
