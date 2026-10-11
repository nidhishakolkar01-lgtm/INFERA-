import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  Sparkles,
  RefreshCw,
  Terminal,
  Database,
  UserCheck,
  Zap,
  Flame,
  FileCode,
  ArrowRight,
  Layers,
  Fingerprint,
} from 'lucide-react';

export default function App() {
  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState('evaluator'); // 'evaluator' | 'approvals' | 'ledger'

  // System status & config
  const [systemStatus, setSystemStatus] = useState(null);
  const [simulateAiOffline, setSimulateAiOffline] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [knownAgents, setKnownAgents] = useState({});
  const [actionCatalog, setActionCatalog] = useState({});

  // Evaluator Form State
  const [agentId, setAgentId] = useState('finance-agent-01');
  const [actionType, setActionType] = useState('read_account_summary');
  const [payloadText, setPayloadText] = useState('{\n  "accountId": "ACC-88391",\n  "recordsCount": 1\n}');
  const [rationale, setRationale] = useState('Checking client balance prior to generating monthly statement.');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState(null);

  // Approvals & Ledger State
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [approverId, setApproverId] = useState('supervisor-jane-doe');
  const [approvalFeedback, setApprovalFeedback] = useState(null);
  const [ledgerChain, setLedgerChain] = useState([]);
  const [ledgerAuditStatus, setLedgerAuditStatus] = useState(null);
  const [isVerifyingLedger, setIsVerifyingLedger] = useState(false);

  // Fetch initial setup data
  const fetchStatusAndScenarios = async () => {
    try {
      const [resHealth, resScenarios, resApprovals, resLedger] = await Promise.all([
        fetch('/api/health').then((r) => r.json()),
        fetch('/api/scenarios').then((r) => r.json()),
        fetch('/api/actions/pending').then((r) => r.json()),
        fetch('/api/ledger').then((r) => r.json()),
      ]);

      setSystemStatus(resHealth);
      setSimulateAiOffline(resHealth.aiOfflineSimulated);
      setScenarios(resScenarios.scenarios || []);
      setKnownAgents(resScenarios.knownAgents || {});
      setActionCatalog(resScenarios.actionCatalog || {});
      setPendingApprovals(resApprovals.pending || []);
      setLedgerChain(resLedger.chain || []);
    } catch (err) {
      console.error('Initial load error:', err);
    }
  };

  useEffect(() => {
    fetchStatusAndScenarios();
  }, []);

  // Toggle AI Offline Simulator
  const handleToggleAi = async () => {
    try {
      const res = await fetch('/api/config/toggle-ai-offline', { method: 'POST' });
      const data = await res.json();
      setSimulateAiOffline(data.simulateAiOffline);
      setSystemStatus((prev) => ({ ...prev, aiOfflineSimulated: data.simulateAiOffline }));
    } catch (err) {
      console.error('Error toggling AI status:', err);
    }
  };

  // Load a preset scenario into the form
  const loadScenario = (sc) => {
    setAgentId(sc.agentId);
    setActionType(sc.actionType);
    setPayloadText(JSON.stringify(sc.payload, null, 2));
    setRationale(sc.rationale);
    setEvalResult(null);
    setApprovalFeedback(null);
  };

  // Evaluate Action through Gateway
  const handleEvaluate = async (e) => {
    if (e) e.preventDefault();
    setIsEvaluating(true);
    setEvalResult(null);
    setApprovalFeedback(null);

    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch (err) {
      alert('Invalid JSON in payload field: ' + err.message);
      setIsEvaluating(false);
      return;
    }

    try {
      const res = await fetch('/api/actions/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          actionType,
          payload: parsedPayload,
          agentRationale: rationale,
        }),
      });
      const data = await res.json();
      setEvalResult(data);

      // Refresh pending approvals and ledger
      const [appRes, ledRes] = await Promise.all([
        fetch('/api/actions/pending').then((r) => r.json()),
        fetch('/api/ledger').then((r) => r.json()),
      ]);
      setPendingApprovals(appRes.pending || []);
      setLedgerChain(ledRes.chain || []);
      setLedgerAuditStatus(null);
    } catch (err) {
      alert('Failed to evaluate action: ' + err.message);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Handle Human Supervisor Approval
  const handleApprove = async (actionId, simulateTamper = false) => {
    setApprovalFeedback(null);
    const targetItem = pendingApprovals.find((i) => i.actionId === actionId);
    if (!targetItem) return;

    let payloadToSend = targetItem.payload;
    if (simulateTamper) {
      // Maliciously tamper with payload (change amount or destination)
      payloadToSend = {
        ...targetItem.payload,
        amount: (targetItem.payload?.amount || 100) * 10,
        tamperedField: 'UNAUTHORIZED_INJECTED_PARAM',
      };
    }

    try {
      const res = await fetch('/api/actions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionId,
          approverId,
          executionPayload: payloadToSend,
        }),
      });
      const data = await res.json();
      setApprovalFeedback(data);

      // Refresh
      const [appRes, ledRes] = await Promise.all([
        fetch('/api/actions/pending').then((r) => r.json()),
        fetch('/api/ledger').then((r) => r.json()),
      ]);
      setPendingApprovals(appRes.pending || []);
      setLedgerChain(ledRes.chain || []);
      setLedgerAuditStatus(null);
    } catch (err) {
      alert('Error during approval: ' + err.message);
    }
  };

  // Handle Human Rejection
  const handleReject = async (actionId) => {
    setApprovalFeedback(null);
    try {
      const res = await fetch('/api/actions/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionId,
          rejectorId: approverId,
          reason: 'Supervisor rejected the action due to risk evaluation.',
        }),
      });
      const data = await res.json();
      setApprovalFeedback(data);

      const [appRes, ledRes] = await Promise.all([
        fetch('/api/actions/pending').then((r) => r.json()),
        fetch('/api/ledger').then((r) => r.json()),
      ]);
      setPendingApprovals(appRes.pending || []);
      setLedgerChain(ledRes.chain || []);
    } catch (err) {
      alert('Error during rejection: ' + err.message);
    }
  };

  // Verify Cryptographic Ledger Integrity
  const handleVerifyLedger = async () => {
    setIsVerifyingLedger(true);
    try {
      const res = await fetch('/api/ledger/verify', { method: 'POST' });
      const data = await res.json();
      setLedgerAuditStatus(data);
    } catch (err) {
      alert('Error verifying ledger: ' + err.message);
    } finally {
      setIsVerifyingLedger(false);
    }
  };

  // Simulate Database Tamper on Ledger Block #1
  const handleSimulateLedgerTamper = async () => {
    try {
      const res = await fetch('/api/ledger/simulate-tamper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockIndex: 1,
          maliciousDecision: 'ALLOWED_TAMPERED',
          fakeReason: 'Covert DB edit bypassing policy',
        }),
      });
      const data = await res.json();
      alert('⚠️ ' + data.message);

      const ledRes = await fetch('/api/ledger').then((r) => r.json());
      setLedgerChain(ledRes.chain || []);
      setLedgerAuditStatus(null);
    } catch (err) {
      alert('Error tampering block: ' + err.message);
    }
  };

  // Reset Ledger & Approvals
  const handleResetLedger = async () => {
    if (!confirm('Reset ledger to clean Genesis block?')) return;
    try {
      await fetch('/api/ledger/reset', { method: 'POST' });
      fetchStatusAndScenarios();
      setEvalResult(null);
      setApprovalFeedback(null);
      setLedgerAuditStatus(null);
    } catch (err) {
      alert('Error resetting ledger: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-xl shadow-lg shadow-indigo-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-indigo-300 via-cyan-300 to-white bg-clip-text text-transparent">
                  ACTIONGATE
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-mono">
                  v3.0 C-01
                </span>
              </div>
              <p className="text-xs text-slate-400">AI Agent Action Authorization Engine & Cryptographic Guard</p>
            </div>
          </div>

          {/* Real-time System Indicators */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-400">Zero-Trust:</span>
              <span className="text-emerald-400 font-semibold">Active</span>
            </div>

            <button
              onClick={handleToggleAi}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
                simulateAiOffline
                  ? 'bg-amber-950/40 border-amber-600/40 text-amber-300 hover:bg-amber-900/50'
                  : 'bg-indigo-950/40 border-indigo-600/40 text-indigo-300 hover:bg-indigo-900/50'
              }`}
              title="Click to toggle between Live Gemini AI and Safe Deterministic Fallback"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>AI Mode:</span>
              <span className="font-semibold">
                {simulateAiOffline ? '⚡ Safe Fallback (Offline)' : '✨ Gemini 2.5 Flash'}
              </span>
            </button>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700">
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">Ledger:</span>
              <span className="text-cyan-400 font-mono font-semibold">{ledgerChain.length} Blocks</span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400">Pending:</span>
              <span className="text-amber-400 font-bold">{pendingApprovals.length}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Preset Quick Scenarios Strip */}
      <section className="bg-slate-900/40 border-b border-slate-800/80 px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center gap-3 overflow-x-auto text-xs py-1">
          <span className="text-slate-400 font-semibold uppercase tracking-wider shrink-0 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" /> Judge Demo Presets:
          </span>
          {scenarios.map((sc) => (
            <button
              key={sc.id}
              onClick={() => loadScenario(sc)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white whitespace-nowrap transition flex items-center gap-1.5"
            >
              <span>{sc.title}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Main Tab Navigation */}
      <div className="max-w-7xl mx-auto w-full px-6 pt-6">
        <div className="flex border-b border-slate-800 gap-6 text-sm">
          <button
            onClick={() => setActiveTab('evaluator')}
            className={`pb-3 font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'evaluator'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Gateway Evaluator & Workbench
          </button>

          <button
            onClick={() => setActiveTab('approvals')}
            className={`pb-3 font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'approvals'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Human-in-the-Loop Approvals
            {pendingApprovals.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
                {pendingApprovals.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={`pb-3 font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'ledger'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Fingerprint className="w-4 h-4" />
            Cryptographic Audit Ledger
            <span className="text-xs text-slate-500 font-mono">({ledgerChain.length})</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto w-full px-6 py-6 flex-1">
        {/* ================= TAB 1: EVALUATOR WORKBENCH ================= */}
        {activeTab === 'evaluator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 6 cols: Proposed Action Input */}
            <div className="lg:col-span-6 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    Agent Action Submission
                  </h2>
                  <span className="text-xs text-slate-500 font-mono">Zero-Trust Intake</span>
                </div>

                <form onSubmit={handleEvaluate} className="space-y-4">
                  {/* Agent Selection */}
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider mb-1.5">
                      Requesting Agent Identity
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={agentId}
                        onChange={(e) => setAgentId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="finance-agent-01">finance-agent-01 (Tier 2)</option>
                        <option value="support-bot-alpha">support-bot-alpha (Tier 1)</option>
                        <option value="ops-maintenance-agent">ops-maintenance-agent (Tier 3)</option>
                        <option value="unregistered-rogue-agent-99">unregistered-rogue-agent-99 (Unknown)</option>
                      </select>
                      <input
                        type="text"
                        value={agentId}
                        onChange={(e) => setAgentId(e.target.value)}
                        placeholder="Or custom Agent ID"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono"
                      />
                    </div>
                  </div>

                  {/* Action Selection */}
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider mb-1.5">
                      Target Action Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={actionType}
                        onChange={(e) => setActionType(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="read_account_summary">read_account_summary (Low / Reversible)</option>
                        <option value="fetch_invoice">fetch_invoice (Low / Read)</option>
                        <option value="issue_refund">issue_refund (Financial / High Threshold)</option>
                        <option value="transfer_funds">transfer_funds (Financial / Wire)</option>
                        <option value="send_customer_email">send_customer_email (External Comms)</option>
                        <option value="clear_cache">clear_cache (Infra / Reversible)</option>
                        <option value="restart_service">restart_service (Infra / Worker)</option>
                        <option value="unrecognized_dangerous_action">unrecognized_dangerous_action (Unknown)</option>
                      </select>
                      <input
                        type="text"
                        value={actionType}
                        onChange={(e) => setActionType(e.target.value)}
                        placeholder="Or custom Action Type"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono"
                      />
                    </div>
                  </div>

                  {/* Payload JSON */}
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider mb-1.5 flex justify-between">
                      <span>Action Payload Arguments (JSON)</span>
                      <span className="text-slate-500">Will be SHA-256 locked</span>
                    </label>
                    <textarea
                      rows={5}
                      value={payloadText}
                      onChange={(e) => setPayloadText(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs font-mono text-cyan-300 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
                    />
                  </div>

                  {/* Agent Stated Rationale */}
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 tracking-wider mb-1.5">
                      Agent Stated Rationale (Evaluated by AI Intent Classifier)
                    </label>
                    <textarea
                      rows={2}
                      value={rationale}
                      onChange={(e) => setRationale(e.target.value)}
                      placeholder="Agent's reasoning or context for this action..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isEvaluating}
                    className="w-full bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-indigo-600/20 text-sm"
                  >
                    {isEvaluating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Running Gatekeeper Evaluation...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Evaluate Action via ActionGate
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Right 6 cols: Live Gatekeeper Verdict */}
            <div className="lg:col-span-6 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-cyan-400" />
                    Authorization Verdict
                  </h2>
                  {evalResult && (
                    <span className="text-xs px-2.5 py-1 rounded bg-slate-800 font-mono text-slate-400">
                      ID: {evalResult.actionId}
                    </span>
                  )}
                </div>

                {!evalResult ? (
                  <div className="h-80 border border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-500 text-center p-6">
                    <ShieldAlert className="w-10 h-10 mb-3 text-slate-600" />
                    <p className="text-sm font-medium text-slate-400">Awaiting Agent Action</p>
                    <p className="text-xs text-slate-600 max-w-sm mt-1">
                      Select a preset scenario above or submit an action on the left to watch ActionGate evaluate policies, calculate semantic risk, and lock cryptographic hashes.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Big Decision Banner */}
                    <div
                      className={`p-5 rounded-xl border flex items-center justify-between ${
                        evalResult.finalDecision === 'ALLOWED'
                          ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                          : evalResult.finalDecision === 'HELD_FOR_APPROVAL'
                          ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                          : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {evalResult.finalDecision === 'ALLOWED' ? (
                          <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
                        ) : evalResult.finalDecision === 'HELD_FOR_APPROVAL' ? (
                          <AlertTriangle className="w-8 h-8 text-amber-400 shrink-0" />
                        ) : (
                          <XCircle className="w-8 h-8 text-rose-400 shrink-0" />
                        )}
                        <div>
                          <div className="text-xs font-mono uppercase tracking-wider opacity-80">
                            Final Policy Decision
                          </div>
                          <div className="text-xl font-extrabold tracking-tight">
                            {evalResult.finalDecision.replace(/_/g, ' ')}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs px-2 py-0.5 rounded bg-black/40 font-mono text-slate-300">
                          Block #{evalResult.ledgerBlock?.index}
                        </span>
                      </div>
                    </div>

                    {/* Policy Reason Explanation */}
                    <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1">
                      <span className="font-semibold text-slate-400 uppercase tracking-wider block">
                        Reason & Policy Citation:
                      </span>
                      <p className="text-slate-200 font-sans leading-relaxed">
                        {evalResult.finalReason}
                      </p>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {/* Decision Path */}
                      <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                        <span className="text-slate-500 block mb-1">Decision Path:</span>
                        <span className="font-semibold text-indigo-300 font-mono">
                          {evalResult.decisionPath}
                        </span>
                      </div>

                      {/* Reversibility */}
                      <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                        <span className="text-slate-500 block mb-1">Reversibility:</span>
                        <span
                          className={`font-semibold ${
                            evalResult.policyResult?.isReversible
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {evalResult.policyResult?.isReversible ? 'Reversible' : 'Irreversible'}
                        </span>
                      </div>

                      {/* Impact Level */}
                      <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                        <span className="text-slate-500 block mb-1">Impact Level:</span>
                        <span className="font-semibold text-cyan-300">
                          {evalResult.policyResult?.impactLevel || 'UNKNOWN'}
                        </span>
                      </div>

                      {/* Semantic Risk Score */}
                      <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                        <span className="text-slate-500 block mb-1">Semantic AI Risk:</span>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                evalResult.aiResult?.semanticRiskScore > 70
                                  ? 'bg-rose-500'
                                  : evalResult.aiResult?.semanticRiskScore > 35
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${evalResult.aiResult?.semanticRiskScore || 0}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-slate-300">
                            {evalResult.aiResult?.semanticRiskScore ?? 0}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Red Flags / Violations */}
                    {evalResult.policyResult?.violations?.length > 0 && (
                      <div className="p-3 bg-rose-950/30 border border-rose-800/40 rounded-xl text-xs">
                        <span className="font-bold text-rose-400 uppercase tracking-wider block mb-1">
                          Deterministic Policy Violations:
                        </span>
                        <ul className="list-disc list-inside text-rose-200 space-y-0.5 font-mono">
                          {evalResult.policyResult.violations.map((v, i) => (
                            <li key={i}>{v}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {evalResult.aiResult?.detectedRedFlags?.length > 0 && (
                      <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl text-xs">
                        <span className="font-bold text-amber-400 uppercase tracking-wider block mb-1">
                          Semantic Intent Warnings:
                        </span>
                        <ul className="list-disc list-inside text-amber-200 space-y-0.5">
                          {evalResult.aiResult.detectedRedFlags.map((rf, i) => (
                            <li key={i}>{rf}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Cryptographic SHA-256 Lock */}
                    <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-500 truncate">
                      <span className="text-slate-400">SHA-256 Payload Lock:</span>{' '}
                      {evalResult.policyResult?.payloadHash}
                    </div>
                  </div>
                )}
              </div>

              {evalResult?.finalDecision === 'HELD_FOR_APPROVAL' && (
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-amber-400 flex items-center gap-1.5">
                    <Clock className="w-4 h-4" /> Added to Human Approval Queue
                  </span>
                  <button
                    onClick={() => setActiveTab('approvals')}
                    className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1 transition"
                  >
                    Go to Approvals <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: HUMAN-IN-THE-LOOP APPROVALS ================= */}
        {activeTab === 'approvals' && (
          <div className="space-y-6">
            {/* Approver Role & 4-Eyes Context Bar */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200">
                    Supervisor Authorization Station (4-Eyes Principle)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Requesters cannot self-approve. Approvals cryptographically lock the exact payload.
                  </p>
                </div>
              </div>

              {/* Role Switcher */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Active Reviewer Role:</span>
                <select
                  value={approverId}
                  onChange={(e) => setApproverId(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-cyan-300 font-mono focus:outline-none"
                >
                  <option value="supervisor-jane-doe">supervisor-jane-doe (Independent Supervisor)</option>
                  <option value="finance-agent-01">finance-agent-01 (⚠️ Prohibited Self-Approval Attempt)</option>
                  <option value="security-officer-bob">security-officer-bob (SecOps Supervisor)</option>
                </select>
              </div>
            </div>

            {/* Feedback Alert Banner */}
            {approvalFeedback && (
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 text-xs leading-relaxed ${
                  approvalFeedback.success
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                }`}
              >
                {approvalFeedback.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold text-sm mb-0.5">
                    {approvalFeedback.success ? 'Authorization Successful' : 'Security Alert: Approval Refused'}
                  </div>
                  <p>{approvalFeedback.message || approvalFeedback.error}</p>
                  {approvalFeedback.authorizationTicket && (
                    <div className="mt-2 font-mono text-[11px] bg-black/40 p-2 rounded border border-emerald-500/30 break-all">
                      Cryptographic Execution Ticket: {approvalFeedback.authorizationTicket}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pending Approvals List */}
            {pendingApprovals.length === 0 ? (
              <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-12 text-center text-slate-500">
                <CheckCircle2 className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-400">No Actions Awaiting Human Approval</p>
                <p className="text-xs text-slate-600 mt-1">
                  Actions with high monetary thresholds or irreversible impacts will queue here for review.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingApprovals.map((item) => (
                  <div
                    key={item.actionId}
                    className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                        <span className="text-xs font-mono font-bold text-indigo-400">
                          {item.actionId}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
                          {item.actionType}
                        </span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div>
                          <span className="text-slate-500">Requesting Agent:</span>{' '}
                          <span className="text-slate-300 font-mono font-semibold">{item.agentId}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Held Reason:</span>{' '}
                          <span className="text-amber-200">{item.heldReason}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block mb-1">Payload:</span>
                          <pre className="bg-slate-950 p-2.5 rounded border border-slate-800 font-mono text-cyan-300 text-[11px] overflow-x-auto max-h-32">
                            {JSON.stringify(item.payload, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons & Tamper Attack Simulator */}
                    <div className="mt-5 pt-3 border-t border-slate-800 space-y-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApprove(item.actionId, false)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Authorize Action
                        </button>
                        <button
                          onClick={() => handleReject(item.actionId)}
                          className="bg-rose-950/60 hover:bg-rose-900 border border-rose-800/40 text-rose-300 py-2 px-3 rounded-lg text-xs transition"
                        >
                          Reject
                        </button>
                      </div>

                      {/* Killer Demo Button: Simulate Payload Tampering */}
                      <button
                        onClick={() => handleApprove(item.actionId, true)}
                        className="w-full bg-slate-950 hover:bg-rose-950/40 border border-dashed border-rose-600/50 text-rose-300 py-1.5 px-2 rounded-lg text-[11px] flex items-center justify-center gap-1.5 transition font-mono"
                        title="Simulate attacker altering payload parameters right before execution to demonstrate anti-tamper lock"
                      >
                        <Flame className="w-3 h-3 text-rose-400" />
                        Judge Demo: Tamper Payload & Attempt Execution
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: CRYPTOGRAPHIC AUDIT LEDGER ================= */}
        {activeTab === 'ledger' && (
          <div className="space-y-6">
            {/* Ledger Actions & Integrity Checker Toolbar */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-cyan-400" />
                  SHA-256 Hash-Chained Audit Ledger
                </h3>
                <p className="text-xs text-slate-400">
                  Every decision & refusal is recorded in a tamper-evident blockchain-style log.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  onClick={handleVerifyLedger}
                  disabled={isVerifyingLedger}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 transition shadow"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {isVerifyingLedger ? 'Verifying Hashes...' : 'Verify Ledger Integrity'}
                </button>

                <button
                  onClick={handleSimulateLedgerTamper}
                  className="bg-rose-950/60 hover:bg-rose-900 border border-rose-700/50 text-rose-300 font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 transition"
                  title="Simulate a database attacker quietly altering Block #1"
                >
                  <Flame className="w-3.5 h-3.5" />
                  Judge Demo: Tamper Block #1 in DB
                </button>

                <button
                  onClick={handleResetLedger}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg transition"
                >
                  Reset Ledger
                </button>
              </div>
            </div>

            {/* Ledger Audit Status Banner */}
            {ledgerAuditStatus && (
              <div
                className={`p-4 rounded-xl border flex items-center gap-3 text-xs ${
                  ledgerAuditStatus.isValid
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                    : 'bg-rose-950/50 border-rose-500 text-rose-300'
                }`}
              >
                {ledgerAuditStatus.isValid ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 animate-pulse" />
                )}
                <div className="leading-relaxed">
                  <div className="font-bold text-sm">
                    {ledgerAuditStatus.isValid
                      ? 'Ledger Cryptographic Integrity 100% Intact'
                      : 'TAMPERING DETECTED IN AUDIT LEDGER!'}
                  </div>
                  <p>{ledgerAuditStatus.message}</p>
                </div>
              </div>
            )}

            {/* The Chain Blocks Display */}
            <div className="space-y-3 font-mono">
              {ledgerChain.map((block, idx) => (
                <div
                  key={block.index}
                  className={`bg-slate-900/80 border rounded-xl p-4 transition ${
                    ledgerAuditStatus && !ledgerAuditStatus.isValid && ledgerAuditStatus.corruptedBlockIndex === block.index
                      ? 'border-rose-500 ring-2 ring-rose-500/50 bg-rose-950/30'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                        Block #{block.index}
                      </span>
                      <span className="text-slate-400 font-sans">{block.actionId}</span>
                      <span className="text-slate-500">[{block.actionType}]</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          block.decision === 'ALLOWED'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : block.decision === 'HELD_FOR_APPROVAL'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {block.decision}
                      </span>
                      <span className="text-slate-500 text-[11px]">{new Date(block.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  <div className="text-xs space-y-1.5 font-sans">
                    <div className="text-slate-300">
                      <span className="text-slate-500 font-mono">Agent:</span> {block.agentId}{' '}
                      {block.approvedBy && (
                        <span className="text-emerald-400 ml-2 font-mono">
                          [Approved by: {block.approvedBy}]
                        </span>
                      )}
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      <span className="text-slate-500 font-mono">Policy Reason:</span> {block.policyReason}
                    </div>
                  </div>

                  {/* Hash Pointers */}
                  <div className="mt-3 pt-2 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] text-slate-500">
                    <div className="truncate">
                      <span className="text-slate-400">prevHash:</span> {block.previousHash}
                    </div>
                    <div className="truncate">
                      <span className="text-cyan-400">currHash:</span> {block.currentHash}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-3 text-xs text-slate-500 flex items-center justify-between">
        <span>VORTEXA 3.0 Hackathon Prototype · Domain 1: Cybersecurity & Digital Trust</span>
        <span className="font-mono text-indigo-400">C-01 ActionGate</span>
      </footer>
    </div>
  );
}
