# 🛡️ ActionGate: AI Agent Action Authorization Engine
**VORTEXA 3.0 Hackathon Official Project Submission**  
**Track:** Domain 1 — Cybersecurity & Digital Trust (`C-01 ActionGate`)  
**Host Institution:** Dr. D. Y. Patil Institute of Technology, Pimpri, Pune  

---

## 📌 Executive Summary
As autonomous AI agents evolve from conversational chatbots into operational actors capable of updating databases, executing cloud commands, and issuing financial payouts, existing security models completely fail. Traditional perimeter API keys grant binary access without inspecting parameter payloads, blast radius, reversibility, argument tampering, or adversarial prompt injection.

**ActionGate** is a real-time Zero-Trust Authorization Proxy and Cryptographic Guard designed specifically for autonomous AI agents. Every proposed agent action is intercepted at the point-of-action, evaluated by a dual-layer deterministic and semantic policy engine, and resolved into one of three strict verdicts: **ALLOWED**, **BLOCKED**, or **HELD FOR HUMAN APPROVAL**.

---

## 🎯 Direct Alignment with Track C-01 Problem Statement

| Problem Statement Clause | ActionGate Technical Implementation | Verification Evidence |
|---|---|---|
| **"Zero-trust: default deny for unknown agent IDs and tool actions"** | Unregistered agent IDs or uncataloged tool actions are terminated immediately at gateway boundary (`UNRECOGNIZED_ACTION_TYPE` / `UNKNOWN_AGENT_ID`). | Phase 1 of `npm run demo` & Test 4 in `npm test` |
| **"Reversible vs irreversible rules; transactions above $1k require approval"** | Hard deterministic threshold engine evaluates financial impact; holds actions > $1,000 for supervisor approval. Irreversible operations require explicit 4-Eyes sign-off. | Phase 2 of `npm run demo` & Test 2 in `npm test` |
| **"Separation of duties (requester cannot approve own action)"** | Requesters are cryptographically prevented from approving their own held actions. A distinct supervisor HMAC signature is required. | Phase 2 of `npm run demo` & Test 7 in `npm test` |
| **"Approvals apply to exact SHA-256 payload hash; parameter mutations caught"** | Canonical SHA-256 hash computed at proposal; compared before dispatch. Catches in-flight TOCTOU argument tampering. | Phase 3 of `npm run demo` & Test 8 in `npm test` |
| **"Text agents read can manipulate them (prompt injection); compute divergence vs user intent"** | Adversarial Red-Team Intent Divergence Engine computes vector semantic and capability mismatch between user query and synthesized tool arguments. | Phase 4 of `npm run demo` & Test 3 in `npm run test:advanced` |
| **"Blast-radius velocity throttling & circuit breaker"** | 60-second sliding window telemetry monitors cumulative financial spend ($5,000 cap) and velocity (5 critical ops/min). Trips to open state to prevent siphoning. | Phase 5 of `npm run demo` & live dashboard Section 3 |
| **"JIT ephemeral action leases & anti-replay defense"** | 60-second TTL leases signed with HMAC-SHA256; single-use nonces burned upon execution. Replay attempts blocked in `< 15ms`. | Phase 6 of `npm run demo` & Test 2 in `npm run test:advanced` |
| **"Reversibility rollback engine (1-click state restore)"** | Pre-execution registration of deterministic inverse recipes; 1-click state rollback commits compensating inverse block to Merkle ledger. | Phase 7 of `npm run demo` & live dashboard Section 4 |
| **"Cryptographic non-repudiation & tamper-evident audit trail"** | RFC 6962 binary SHA-256 Merkle Tree with leaf inclusion proofs and browser WebCrypto independent verifier. | Section 1 of live dashboard & Test 1 in `npm run test:advanced` |
| **"Zero synthetic data display"** | Real mutating state machine (treasury balance journal) and real host OS telemetry (Node `os` CPU model, RAM, process uptime). | Live Telemetry Tab (`/api/system/telemetry`) |

---

## 🛠️ Mandatory Tech Stack & AI Tool Declaration
*(Compliant with Vortexa 3.0 Rule #2 - AI & Tool Usage Declaration)*

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide Icons, Browser WebCrypto API
- **Backend:** Node.js (v20.11), Express, native Node `crypto`, `os`, and `process` modules
- **AI Models & SDKs:** Google Gemini 2.5 Flash (`@google/genai` SDK) + local deterministic safe fallback engine
- **AI Assistant Usage:** Google Antigravity (used for rapid test scaffolding, CSS layouts, and test automation scripts)
- **Cryptography:** SHA-256 binary Merkle Trees, HMAC-SHA256 digital signatures, single-use 128-bit nonces, RFC 6962 leaf inclusion proofs

---

## 🚀 Live Demo Verification Instructions for Judges

### 1. Terminal Demo (Recommended for Fast Judging):
```bash
cd backend
npm run demo
```
*Executes all 7 security phases against the live gateway in ~3.4 seconds with a 100% verified scorecard.*

### 2. Interactive Web Dashboard:
- Start backend: `cd backend && npm start` (Port 5000)
- Start frontend: `cd frontend && npm run dev` (Port 3000)
- Navigate to **`http://localhost:3000`** in your browser.
- Explore the 7 dedicated views:
  1. **Agent Simulation & Action Execution:** Autonomous agent mission runner with live reasoning.
  2. **Adversarial Red-Team Lab:** Live prompt injection sandbox with mathematical Intent Divergence.
  3. **Policy Studio & Rules:** Real-time threshold governance and zero-trust agent directory.
  4. **Live Host Telemetry & State:** WebCrypto Merkle verification, JIT replay simulator, Velocity Circuit Breaker, and Reversibility Rollback console.
  5. **4-Eyes Human Approvals Queue:** Cryptographic payload lock and supervisor separation of duties.
  6. **Tamper-Proof Cryptographic Ledger:** SHA-256 audit blockchain with 1-bit tamper simulation.
  7. **Manual Action Authorization:** Ad-hoc payload evaluation workbench.

---

## 📊 Summary of Automated Verification Results
- **Core Security Policy Test Suite:** 8/8 Tests Passed (100%)
- **Advanced Cryptographic & Adversarial Suite:** 3/3 Modules Passed (100%)
- **End-to-End Judge Verification Harness:** 7/7 Phases Passed (100% in 3.41s)
- **Drop-In SDK Example Integration:** 5/5 Scenarios Passed (100%)
- **Frontend Build:** `vite build` completed with 0 errors across 1,588 modules.
