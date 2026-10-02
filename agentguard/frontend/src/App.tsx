import React, { useState, useEffect, useRef } from 'react';
import { TitleBar } from './components/ide/TitleBar';
import { ActivityBar } from './components/ide/ActivityBar';
import { Sidebar } from './components/ide/Sidebar';
import { EditorArea } from './components/ide/EditorArea';
import { SecurityInspector } from './components/ide/SecurityInspector';
import { BottomPanel } from './components/ide/BottomPanel';
import { StatusBar } from './components/ide/StatusBar';
import { CommandPalette } from './components/ide/CommandPalette';
import { ArchitectureModal } from './components/ArchitectureModal';
import { api } from './api';
import {
  GatewayStats, InterceptionDecision, AgentRecord, ApprovalItem,
  LedgerBlock, ScenarioFixture, PolicyRule
} from './types';
import { SidebarView, OpenTab, EditorFileType, ToolDefinition, IncidentRecord } from './types/ide';
import { DEFAULT_TOOLS, DEFAULT_INCIDENTS } from './services/ideData';
import { ShieldAlert, CheckCircle, X } from 'lucide-react';

// ─── Toast Notifications ───────────────────────────────────────────────────
function IdeToast({ title, message, type, onClose }: {
  title: string; message: string; type: 'alert' | 'success'; onClose: () => void;
}) {
  const isAlert = type === 'alert';
  return (
    <div
      className={`anim-slide-down flex items-start gap-3 px-4 py-3 rounded-lg border shadow-2xl max-w-sm w-full font-mono text-xs ${
        isAlert
          ? 'bg-red-950/90 border-red-700/60 text-red-100 shadow-red-950/60'
          : 'bg-emerald-950/90 border-emerald-700/60 text-emerald-100 shadow-emerald-950/60'
      }`}
      style={{ backdropFilter: 'blur(12px)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="font-bold text-[10px] uppercase tracking-wider mb-0.5">{title}</div>
        <div className="text-[11px] text-slate-300">{message}</div>
      </div>
      <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function App() {
  // ── IDE Layout States ──
  const [activeView, setActiveView] = useState<SidebarView>('explorer');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSpecsOpen, setIsSpecsOpen] = useState(false);

  // ── Workspace Tabs ──
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([
    { id: 'researcher.agent', path: 'agents/researcher.agent', title: 'researcher.agent', type: 'agent', dataId: 'researcher-01' },
    { id: 'secrets-policy.cel', path: 'policies/secrets-policy.cel', title: 'secrets-policy.cel', type: 'policy', dataId: 'POL-001' },
    { id: 'search_documents.tool', path: 'tools/search_documents.tool', title: 'search_documents.tool', type: 'tool', dataId: 'search_documents' },
    { id: 'topology.graph', path: 'topology.graph', title: 'AgentMesh.graph', type: 'graph' },
  ]);
  const [activeTabId, setActiveTabId] = useState('researcher.agent');

  // ── Security Data States ──
  const [stats, setStats] = useState<GatewayStats | null>(null);
  const [interceptions, setInterceptions] = useState<InterceptionDecision[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [ledgerBlocks, setLedgerBlocks] = useState<LedgerBlock[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioFixture[]>([]);
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [tools] = useState<ToolDefinition[]>(DEFAULT_TOOLS);
  const [incidents, setIncidents] = useState<IncidentRecord[]>(DEFAULT_INCIDENTS);
  const [selectedDecision, setSelectedDecision] = useState<InterceptionDecision | null>(null);

  // ── Live Stream & Swarm ──
  const [isConnected, setIsConnected] = useState(false);
  const [isTrafficGenerating, setIsTrafficGenerating] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; title: string; message: string; type: 'alert' | 'success' }>>([]);

  const wsRef = useRef<WebSocket | null>(null);

  const showToast = (title: string, message: string, type: 'alert' | 'success' = 'alert') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-3), { id, title, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  };

  // ── Load Initial Backend Data ──
  const loadAllData = async () => {
    try {
      const [
        statsData, interceptionsData, agentsData, approvalsData,
        ledgerData, scenariosData, policiesData
      ] = await Promise.all([
        api.getStats(), api.getInterceptions(100), api.getAgents(), api.getApprovals(),
        api.getLedger(100), api.getScenarios(), api.getPolicies()
      ]);
      setStats(statsData);
      setInterceptions(interceptionsData);
      if (interceptionsData.length > 0 && !selectedDecision) {
        setSelectedDecision(interceptionsData[0]);
      }
      setAgents(agentsData);
      setApprovals(approvalsData);
      setLedgerBlocks(ledgerData);
      setScenarios(scenariosData);
      setPolicies(policiesData);
    } catch (err) {
      console.error('Failed to load initial IDE data:', err);
    }
  };

  useEffect(() => {
    loadAllData();

    // WebSocket live stream
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/stream`);

    socket.onopen = () => setIsConnected(true);
    socket.onclose = () => setIsConnected(false);

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'INTERCEPTION') {
          const decision = msg.data as InterceptionDecision;
          setInterceptions((prev) => [decision, ...prev.slice(0, 99)]);
          setSelectedDecision(decision);

          if (decision.honeypot_triggered) {
            showToast('DECEPTION TRIPWIRE BREACH', `Canary token touched by ${decision.agent_id}! Agent quarantined.`, 'alert');
            // Add to incidents
            const newInc: IncidentRecord = {
              incident_id: `INC-${Date.now().toString().slice(-4)}`,
              severity: 'CRITICAL',
              agent_id: decision.agent_id,
              title: `Tripwire Canary Breach (${decision.tool_name})`,
              description: `Canary token touched in arguments. Containment protocol executed.`,
              timestamp: Date.now(),
              status: 'CONTAINED',
              trace_id: decision.trace_id,
              containment_action: 'Agent quarantined & epoch bumped.',
            };
            setIncidents((prev) => [newInc, ...prev]);
          } else if (decision.decision === 'BLOCK') {
            showToast('INVOCATION BLOCKED', `Pre-execution aborted for ${decision.tool_name} (${decision.agent_id}).`, 'alert');
          }

          api.getStats().then(setStats);
          api.getLedger(100).then(setLedgerBlocks);
          api.getAgents().then(setAgents);
          api.getApprovals().then(setApprovals);
        } else if (msg.event === 'AGENT_STATE_CHANGE') {
          api.getAgents().then(setAgents);
          api.getStats().then(setStats);
        } else if (msg.event === 'APPROVAL_RESOLVED') {
          api.getApprovals().then(setApprovals);
          api.getStats().then(setStats);
          api.getLedger(100).then(setLedgerBlocks);
          showToast('APPROVAL RESOLVED', `Action updated: ${msg.data.status}`, 'success');
        } else if (msg.event === 'POLICY_UPDATED') {
          api.getPolicies().then(setPolicies);
          api.getStats().then(setStats);
        }
      } catch (err) { /* ignore */ }
    };

    wsRef.current = socket;
    return () => socket.close();
  }, []);

  // Polling fallback
  useEffect(() => {
    const interval = setInterval(() => {
      api.getStats().then(setStats).catch(() => {});
      api.getApprovals().then(setApprovals).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Swarm traffic generator
  useEffect(() => {
    if (!isTrafficGenerating) return;
    const interval = setInterval(async () => {
      try { await api.simulateTraffic(); } catch (err) { /* ignore */ }
    }, 3800);
    return () => clearInterval(interval);
  }, [isTrafficGenerating]);

  // Global Keyboard Shortcuts (⌘P, ⌘B, ⌘J)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && (e.key === 'p' || e.key === 'P' || e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (isCmdOrCtrl && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
      } else if (isCmdOrCtrl && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        setIsBottomPanelOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Tab Management Handlers ──
  const handleOpenFile = (file: { path: string; title: string; type: EditorFileType; dataId?: string; meta?: any }) => {
    const existing = openTabs.find((t) => t.path === file.path);
    if (!existing) {
      setOpenTabs((prev) => [...prev, { id: file.path, ...file }]);
    }
    setActiveTabId(file.path);
  };

  const handleCloseTab = (tabId: string) => {
    const remaining = openTabs.filter((t) => t.id !== tabId);
    setOpenTabs(remaining);
    if (activeTabId === tabId && remaining.length > 0) {
      setActiveTabId(remaining[remaining.length - 1].id);
    }
  };

  // ── Security Enforcement Handlers ──
  const handleQuarantineAgent = async (agentId: string) => {
    await api.quarantineAgent(agentId, 'Enforced via AgentGuard IDE Cockpit');
    setAgents(await api.getAgents());
    api.getStats().then(setStats);
    showToast('AGENT QUARANTINED', `${agentId} placed under strict quarantine.`, 'alert');
  };

  const handleResetAgent = async (agentId: string) => {
    await api.resetAgent(agentId);
    setAgents(await api.getAgents());
    api.getStats().then(setStats);
    showToast('AGENT RESTORED', `${agentId} restored to HEALTHY status.`, 'success');
  };

  const handleBumpEpoch = async (agentId: string) => {
    const res = await api.bumpAgentEpoch(agentId);
    setAgents(await api.getAgents());
    showToast('EPOCH BUMPED', `${agentId} bumped to Epoch v${res.new_epoch}. Stolen tokens invalidated.`, 'success');
  };

  const handleTogglePolicy = async (ruleId: string, enabled: boolean) => {
    try {
      const res = await api.togglePolicy(ruleId, enabled);
      setPolicies(await api.getPolicies());
      setStats(await api.getStats());
      showToast('POLICY TOGGLED', `${ruleId} ${enabled ? 'ARMED' : 'BYPASSED'} (Epoch v${res.policy_epoch}).`, 'success');
    } catch (err: any) {
      showToast('POLICY ERROR', err.message, 'alert');
    }
  };

  const handleResolveApproval = async (approvalId: string, action: 'APPROVE' | 'REJECT', note: string) => {
    try {
      const res = await api.resolveApproval(approvalId, action, note);
      const [ap, l, s] = await Promise.all([api.getApprovals(), api.getLedger(100), api.getStats()]);
      setApprovals(ap); setLedgerBlocks(l); setStats(s);
      showToast(action === 'APPROVE' ? 'EXECUTION APPROVED' : 'EXECUTION REJECTED', `Approval ${approvalId}: ${res.status}`, 'success');
    } catch (e: any) {
      showToast('APPROVAL ERROR', e.message, 'alert');
    }
  };

  const handleReplayScenario = async (scenarioId: string) => {
    try {
      const res = await api.replayScenario(scenarioId);
      const [s, l, i] = await Promise.all([api.getStats(), api.getLedger(100), api.getInterceptions(100)]);
      setStats(s); setLedgerBlocks(l); setInterceptions(i);
      if (res.decision) setSelectedDecision(res.decision);
      showToast(
        res.deterministic_match ? '✅ INVARIANT CONFIRMED' : '⚠️ MISMATCH',
        `${scenarioId}: ${res.actual}`,
        res.deterministic_match ? 'success' : 'alert'
      );
      return res;
    } catch (e: any) {
      showToast('REPLAY ERROR', e.message, 'alert');
      throw e;
    }
  };

  const handleSimulateTool = async (toolName: string, args: Record<string, any>) => {
    try {
      const decision = await api.authorize({
        agent_id: 'researcher-01',
        tool_name: toolName,
        arguments: args,
        task_id: `TASK-IDE-${Date.now().toString().slice(-4)}`,
        trace_id: `TRC-IDE-${Date.now().toString().slice(-4)}`,
      });
      setSelectedDecision(decision);
      setInterceptions((prev) => [decision, ...prev.slice(0, 99)]);
      const [s, l, ag, ap] = await Promise.all([api.getStats(), api.getLedger(100), api.getAgents(), api.getApprovals()]);
      setStats(s); setLedgerBlocks(l); setAgents(ag); setApprovals(ap);
    } catch (e: any) {
      showToast('SIMULATE ERROR', e.message, 'alert');
    }
  };

  const handleVerifyLedger = async () => {
    try {
      const res = await api.verifyLedgerIntegrity();
      showToast(
        res.valid ? 'INTEGRITY VERIFIED' : 'TAMPER DETECTED',
        `${res.verified_blocks} Blocks audited with 0 tamper. ${res.standard}`,
        res.valid ? 'success' : 'alert'
      );
    } catch (e: any) {
      showToast('AUDIT ERROR', e.message, 'alert');
    }
  };

  const handleToggleTraffic = () => {
    setIsTrafficGenerating((prev) => !prev);
    if (!isTrafficGenerating) {
      showToast('SWARM ACTIVE', 'Continuous autonomous agent mesh traffic started.', 'success');
    } else {
      showToast('SWARM PAUSED', 'Agent mesh traffic paused.', 'success');
    }
  };

  const currentTab = openTabs.find((t) => t.id === activeTabId);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden font-sans select-none" style={{ background: '#141414', color: '#e6edf3' }}>

      {/* ── Toast Notifications Stack ── */}
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-2 items-end">
        {toasts.map((toast) => (
          <IdeToast
            key={toast.id}
            title={toast.title}
            message={toast.message}
            type={toast.type}
            onClose={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
          />
        ))}
      </div>

      {/* ── 1. Top Title Bar & Command Center ── */}
      <TitleBar
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isBottomPanelOpen={isBottomPanelOpen}
        onToggleBottomPanel={() => setIsBottomPanelOpen(!isBottomPanelOpen)}
        isInspectorOpen={isInspectorOpen}
        onToggleInspector={() => setIsInspectorOpen(!isInspectorOpen)}
        isTrafficGenerating={isTrafficGenerating}
        onToggleTraffic={handleToggleTraffic}
        activeFilePath={currentTab?.path}
        unreadIncidentsCount={incidents.filter((i) => i.status === 'ACTIVE').length}
      />

      {/* ── 2. Main Middle Workspace Layout ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* 2.1 Left Vertical Activity Bar */}
        <ActivityBar
          activeView={activeView}
          onSelectView={(view) => {
            setActiveView(view);
            if (!isSidebarOpen) setIsSidebarOpen(true);
          }}
          incidentsBadgeCount={incidents.filter((i) => i.status === 'ACTIVE').length}
          approvalsBadgeCount={approvals.length}
          blockedBadgeCount={stats?.blocked_count ?? 0}
          compromisedAgentsCount={agents.filter((a) => a.status === 'QUARANTINED').length}
        />

        {/* 2.2 Collapsible Left Primary Sidebar */}
        {isSidebarOpen && (
          <Sidebar
            activeView={activeView}
            onOpenFile={handleOpenFile}
            agents={agents}
            policies={policies}
            tools={tools}
            incidents={incidents}
            approvals={approvals}
            ledgerBlocks={ledgerBlocks}
            interceptions={interceptions}
            scenarios={scenarios}
            onTogglePolicy={handleTogglePolicy}
            onResolveApproval={handleResolveApproval}
          />
        )}

        {/* 2.3 Center Workspace Area (Editor + Bottom Panel) */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Main Editor Tabs and Active Document */}
          <EditorArea
            openTabs={openTabs}
            activeTabId={activeTabId}
            onSelectTab={setActiveTabId}
            onCloseTab={handleCloseTab}
            agents={agents}
            policies={policies}
            tools={tools}
            incidents={incidents}
            scenarios={scenarios}
            interceptions={interceptions}
            policyEpoch={stats?.policy_epoch ?? 1}
            onQuarantineAgent={handleQuarantineAgent}
            onResetAgent={handleResetAgent}
            onBumpEpoch={handleBumpEpoch}
            onTogglePolicy={handleTogglePolicy}
            onReplayScenario={handleReplayScenario}
            onSimulateTool={handleSimulateTool}
          />

          {/* Bottom Panel (Gateway Stream / Terminal / Problems) */}
          <BottomPanel
            isOpen={isBottomPanelOpen}
            onClose={() => setIsBottomPanelOpen(false)}
            interceptions={interceptions}
            ledgerBlocks={ledgerBlocks}
            onSelectInterception={(item) => {
              setSelectedDecision(item);
              if (!isInspectorOpen) setIsInspectorOpen(true);
            }}
            policyEpoch={stats?.policy_epoch ?? 1}
          />
        </div>

        {/* 2.4 Right Collapsible Security Inspector Panel */}
        {isInspectorOpen && (
          <SecurityInspector
            decision={selectedDecision}
            onClose={() => setIsInspectorOpen(false)}
            onQuarantineAgent={handleQuarantineAgent}
            onBumpEpoch={handleBumpEpoch}
            onOpenFullTrace={(traceId) => {
              handleOpenFile({
                path: `traces/${traceId}.trace`,
                title: `${traceId}.trace`,
                type: 'trace',
                dataId: traceId,
                meta: selectedDecision,
              });
            }}
          />
        )}

      </div>

      {/* ── 3. Bottom Status Bar ── */}
      <StatusBar
        ledgerHeight={stats?.ledger_height ?? 0}
        isConnected={isConnected}
        blockedCount={stats?.blocked_count ?? 0}
        warnCount={stats?.warn_count ?? 0}
        activePoliciesCount={policies.filter((p) => p.enabled).length}
        onOpenSpecs={() => setIsSpecsOpen(true)}
      />

      {/* ── 4. Command Palette (⌘P) ── */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenFile={handleOpenFile}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onToggleBottomPanel={() => setIsBottomPanelOpen(!isBottomPanelOpen)}
        onToggleTraffic={handleToggleTraffic}
        isTrafficGenerating={isTrafficGenerating}
        onVerifyLedger={handleVerifyLedger}
        onOpenSpecs={() => setIsSpecsOpen(true)}
      />

      {/* ── 5. Architecture Lock & Threat Model Modal ── */}
      <ArchitectureModal
        isOpen={isSpecsOpen}
        onClose={() => setIsSpecsOpen(false)}
        stats={stats}
      />

    </div>
  );
}

export default App;
