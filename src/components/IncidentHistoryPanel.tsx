import React, { useState, useEffect, useCallback } from 'react';
import {
  BackendSessionRecord,
  BackendAlertRecord,
  BackendFirewallAction,
} from '../types';
import {
  fetchIncidentSessions,
  fetchSessionAlerts,
  quarantineSession,
} from '../services/api';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Search,
  Lock,
  Radio,
  Clock,
  Terminal,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Phone,
  Layers,
  Cpu,
} from 'lucide-react';

interface IncidentHistoryPanelProps {
  onSelectSessionForWorkspace?: (sessionId: string, callerNumber?: string) => void;
  activeSessionId?: string;
}

export const IncidentHistoryPanel: React.FC<IncidentHistoryPanelProps> = ({
  onSelectSessionForWorkspace,
  activeSessionId,
}) => {
  // Session list state
  const [sessions, setSessions] = useState<BackendSessionRecord[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected session & alerts state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<BackendSessionRecord | null>(null);
  const [alerts, setAlerts] = useState<BackendAlertRecord[]>([]);
  const [firewallActions, setFirewallActions] = useState<BackendFirewallAction[]>([]);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  // Quarantine action state
  const [quarantineTargetSession, setQuarantineTargetSession] = useState<string | null>(null);
  const [isQuarantining, setIsQuarantining] = useState(false);
  const [quarantineFeedback, setQuarantineFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Load sessions from backend
  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    setSessionsError(null);
    try {
      const data = await fetchIncidentSessions();
      setSessions(data.sessions);
      // Auto-select first session if none selected
      if (!selectedSessionId && data.sessions.length > 0) {
        setSelectedSessionId(data.sessions[0].session_id);
      }
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingSessions(false);
    }
  }, [selectedSessionId]);

  // Load alerts when selectedSessionId changes
  const loadAlertsForSession = useCallback(async (sessionId: string) => {
    setIsLoadingAlerts(true);
    setAlertsError(null);
    try {
      const res = await fetchSessionAlerts(sessionId);
      setSelectedSessionDetail(res.session);
      setAlerts(res.alerts);
      setFirewallActions(res.firewall_actions);
    } catch (err) {
      setAlertsError(err instanceof Error ? err.message : String(err));
      setSelectedSessionDetail(null);
      setAlerts([]);
      setFirewallActions([]);
    } finally {
      setIsLoadingAlerts(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Fetch alerts whenever selectedSessionId changes
  useEffect(() => {
    if (selectedSessionId) {
      loadAlertsForSession(selectedSessionId);
    }
  }, [selectedSessionId, loadAlertsForSession]);

  // Handle quarantine execution
  const handleExecuteQuarantine = async () => {
    if (!quarantineTargetSession || isQuarantining) return;
    setIsQuarantining(true);
    setQuarantineFeedback(null);

    try {
      const res = await quarantineSession(quarantineTargetSession);
      setQuarantineFeedback({
        type: 'success',
        message: `Session "${quarantineTargetSession}" quarantined successfully. Action: ${res.action || 'MANUAL_QUARANTINE_DROP'}.`,
      });
      setQuarantineTargetSession(null);

      // Refresh both sessions and alerts to show updated status and firewall actions
      await loadSessions();
      if (selectedSessionId === quarantineTargetSession) {
        await loadAlertsForSession(quarantineTargetSession);
      }
    } catch (err) {
      setQuarantineFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Quarantine request failed.',
      });
    } finally {
      setIsQuarantining(false);
    }
  };

  // Filter sessions by query
  const filteredSessions = sessions.filter(
    (s) =>
      s.session_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.caller_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.final_verdict.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getVerdictBadge = (verdict: string) => {
    const upper = verdict.toUpperCase();
    if (upper === 'CRITICAL' || upper === 'SCAM') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#D95765]/15 text-[#D95765] border border-[#D95765]/40 flex items-center gap-1">
          <ShieldAlert className="w-3 h-3" />
          {upper}
        </span>
      );
    }
    if (upper === 'QUARANTINED') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#D95765]/20 text-[#F1F5F9] border border-[#D95765]/60 flex items-center gap-1">
          <Lock className="w-3 h-3 text-[#D95765]" />
          QUARANTINED
        </span>
      );
    }
    if (upper === 'SAFE') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#36B37E]/15 text-[#36B37E] border border-[#36B37E]/40 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" />
          SAFE
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#E8A23A]/15 text-[#E8A23A] border border-[#E8A23A]/40 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" />
        {upper}
      </span>
    );
  };

  const getRiskScoreColor = (score: number) => {
    if (score >= 70) return '#D95765';
    if (score >= 30) return '#E8A23A';
    return '#36B37E';
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Quarantine Confirmation Modal */}
      {quarantineTargetSession && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#19232E] border border-[#D95765]/50 rounded-lg max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-[#D95765]">
              <div className="w-10 h-10 rounded-full bg-[#D95765]/15 border border-[#D95765]/30 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F1F5F9]">Enforce Quarantine Killswitch</h3>
                <p className="text-xs text-[#AAB7C4]">Network-level RTP packet drop & peer disconnect</p>
              </div>
            </div>

            <div className="p-3 bg-[#101820] border border-[#263443] rounded text-xs text-[#AAB7C4] space-y-2">
              <div className="flex justify-between">
                <span>Target Session:</span>
                <span className="font-mono text-[#F1F5F9] font-bold">{quarantineTargetSession}</span>
              </div>
              <p className="leading-relaxed">
                Are you sure you want to trigger a manual quarantine drop for this session? This will send an immediate{' '}
                <code className="text-[#D95765] bg-black/40 px-1 py-0.5 rounded">POST /api/sessions/{quarantineTargetSession}/quarantine</code>{' '}
                instruction to the Kavach firewall, enforce an iptables packet drop rule, and terminate the connection.
              </p>
            </div>

            {quarantineFeedback?.type === 'error' && (
              <div className="p-3 bg-[#D95765]/10 border border-[#D95765]/30 rounded text-xs text-[#D95765] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{quarantineFeedback.message}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                disabled={isQuarantining}
                onClick={() => {
                  setQuarantineTargetSession(null);
                  setQuarantineFeedback(null);
                }}
                className="px-4 py-2 text-xs font-medium text-[#AAB7C4] hover:text-[#F1F5F9] bg-[#101820] border border-[#263443] rounded transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={isQuarantining}
                onClick={handleExecuteQuarantine}
                className="px-4 py-2 text-xs font-bold text-white bg-[#D95765] hover:bg-[#c84655] disabled:opacity-50 disabled:cursor-not-allowed rounded transition flex items-center gap-2 cursor-pointer shadow-md"
              >
                {isQuarantining ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Executing Killswitch...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Confirm Quarantine Drop</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Banner */}
      {quarantineFeedback && !quarantineTargetSession && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
            quarantineFeedback.type === 'success'
              ? 'bg-[#36B37E]/10 border-[#36B37E]/30 text-[#36B37E]'
              : 'bg-[#D95765]/10 border-[#D95765]/30 text-[#D95765]'
          }`}
        >
          <div className="flex items-center gap-2">
            {quarantineFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{quarantineFeedback.message}</span>
          </div>
          <button
            onClick={() => setQuarantineFeedback(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Sessions List (Left) & Detailed Forensic Alerts (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols): Incident History Table & Session Selector */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#19232E] border border-[#263443] rounded-lg p-4">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#263443]">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#35B9D0]" />
                <h2 className="text-sm font-bold text-[#F1F5F9]">Incident History</h2>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#101820] text-[#AAB7C4] border border-[#263443]">
                  {sessions.length} sessions
                </span>
              </div>
              <button
                disabled={isLoadingSessions}
                onClick={() => loadSessions()}
                title="Refresh sessions from backend"
                className="p-1.5 rounded bg-[#101820] text-[#AAB7C4] hover:text-[#F1F5F9] border border-[#263443] hover:border-[#35B9D0] transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSessions ? 'animate-spin text-[#35B9D0]' : ''}`} />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#AAB7C4]" />
              <input
                type="text"
                placeholder="Search session ID, caller, verdict..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#101820] border border-[#263443] rounded pl-8 pr-3 py-1.5 text-xs text-[#F1F5F9] placeholder:text-[#AAB7C4]/60 focus:outline-none focus:border-[#35B9D0]"
              />
            </div>

            {/* Error State */}
            {sessionsError && (
              <div className="p-3 bg-[#D95765]/10 border border-[#D95765]/30 rounded text-xs text-[#D95765] space-y-2 mb-3">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertCircle className="w-4 h-4" />
                  <span>Failed to load incident history</span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#AAB7C4]">{sessionsError}</p>
                <button
                  onClick={() => loadSessions()}
                  className="px-2.5 py-1 bg-[#101820] text-xs font-medium rounded border border-[#D95765]/40 text-[#F1F5F9] hover:bg-[#D95765]/20 cursor-pointer"
                >
                  Retry API Request
                </button>
              </div>
            )}

            {/* Loading State */}
            {isLoadingSessions && sessions.length === 0 && (
              <div className="py-12 flex flex-col items-center justify-center text-xs text-[#AAB7C4] space-y-3">
                <RefreshCw className="w-6 h-6 animate-spin text-[#35B9D0]" />
                <span>Querying GET /api/sessions...</span>
              </div>
            )}

            {/* Empty State */}
            {!isLoadingSessions && sessions.length === 0 && !sessionsError && (
              <div className="py-10 text-center text-xs text-[#AAB7C4] space-y-2">
                <ShieldCheck className="w-8 h-8 mx-auto text-[#36B37E] opacity-70" />
                <p className="font-medium text-[#F1F5F9]">No Incident Records Found</p>
                <p className="text-[11px]">Backend database returned an empty session repository.</p>
              </div>
            )}

            {/* Sessions List */}
            <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
              {filteredSessions.map((s) => {
                const isSelected = selectedSessionId === s.session_id;
                const isQuarantined = s.call_status.toUpperCase() === 'QUARANTINED' || s.final_verdict.toUpperCase() === 'QUARANTINED';
                const scoreColor = getRiskScoreColor(s.peak_risk_score);

                return (
                  <div
                    key={s.id || s.session_id}
                    onClick={() => setSelectedSessionId(s.session_id)}
                    className={`p-3 rounded border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#101820] border-[#35B9D0] ring-1 ring-[#35B9D0]/50 shadow-md'
                        : 'bg-[#101820]/60 border-[#263443] hover:border-[#35B9D0]/50 hover:bg-[#101820]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-[#F1F5F9] text-xs">
                          {s.session_id}
                        </span>
                        {activeSessionId === s.session_id && (
                          <span className="text-[9px] font-mono px-1 py-0.2 bg-[#35B9D0]/20 text-[#35B9D0] rounded border border-[#35B9D0]/30">
                            STREAMING
                          </span>
                        )}
                      </div>
                      {getVerdictBadge(s.final_verdict)}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-[#AAB7C4] mb-2 font-mono">
                      <div>
                        <span className="text-[10px] text-[#AAB7C4]/70 block">Caller:</span>
                        <span className="text-[#F1F5F9]">{s.caller_number}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-[#AAB7C4]/70 block">Peak Risk:</span>
                        <span className="font-bold tabular-nums" style={{ color: scoreColor }}>
                          {s.peak_risk_score.toFixed(1)} / 100
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t border-[#263443]/60 text-[10px] text-[#AAB7C4]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#AAB7C4]/70" />
                        {formatDate(s.started_at)}
                      </span>

                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {!isQuarantined ? (
                          <button
                            onClick={() => setQuarantineTargetSession(s.session_id)}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold text-[#D95765] hover:text-white hover:bg-[#D95765] border border-[#D95765]/40 transition cursor-pointer"
                            title="Trigger Manual Quarantine"
                          >
                            Quarantine
                          </button>
                        ) : (
                          <span className="text-[10px] text-[#D95765] font-semibold flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5" />
                            Quarantined
                          </span>
                        )}

                        {onSelectSessionForWorkspace && (
                          <button
                            onClick={() => onSelectSessionForWorkspace(s.session_id, s.caller_number)}
                            className="px-2 py-0.5 rounded text-[10px] font-medium text-[#35B9D0] hover:text-white hover:bg-[#35B9D0] border border-[#35B9D0]/40 transition cursor-pointer"
                            title="Inspect in Call Workspace"
                          >
                            Workspace
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column (7 cols): Selected Session Forensic Alerts & Firewall Actions */}
        <div className="lg:col-span-7 space-y-4">
          {selectedSessionId ? (
            <div className="bg-[#19232E] border border-[#263443] rounded-lg p-5 space-y-5">
              {/* Header with Selected Session Info & Quarantine Killswitch */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#263443]">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#AAB7C4] uppercase tracking-wider font-semibold">
                      Session Forensic Dossier:
                    </span>
                    <span className="font-mono text-sm font-bold text-[#F1F5F9]">
                      {selectedSessionId}
                    </span>
                    {selectedSessionDetail && getVerdictBadge(selectedSessionDetail.final_verdict)}
                  </div>
                  {selectedSessionDetail && (
                    <div className="flex items-center gap-3 text-xs text-[#AAB7C4] font-mono">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-[#35B9D0]" />
                        {selectedSessionDetail.caller_number}
                      </span>
                      <span>·</span>
                      <span>Started: {formatDate(selectedSessionDetail.started_at)}</span>
                      {selectedSessionDetail.ended_at && (
                        <>
                          <span>·</span>
                          <span>Ended: {formatDate(selectedSessionDetail.ended_at)}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Killswitch Action */}
                <div className="flex items-center gap-2">
                  <button
                    disabled={
                      isLoadingAlerts ||
                      isQuarantining ||
                      selectedSessionDetail?.call_status.toUpperCase() === 'QUARANTINED'
                    }
                    onClick={() => setQuarantineTargetSession(selectedSessionId)}
                    className={`px-3 py-1.5 text-xs font-bold rounded border transition flex items-center gap-1.5 cursor-pointer ${
                      selectedSessionDetail?.call_status.toUpperCase() === 'QUARANTINED'
                        ? 'bg-[#101820] text-[#AAB7C4] border-[#263443] cursor-not-allowed opacity-60'
                        : 'bg-[#D95765] hover:bg-[#c84655] text-white border-[#D95765] shadow-sm'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>
                      {selectedSessionDetail?.call_status.toUpperCase() === 'QUARANTINED'
                        ? 'Session Quarantined'
                        : 'Quarantine Call (Killswitch)'}
                    </span>
                  </button>

                  <button
                    disabled={isLoadingAlerts}
                    onClick={() => loadAlertsForSession(selectedSessionId)}
                    title="Reload Alerts & Firewall Logs"
                    className="p-1.5 rounded bg-[#101820] text-[#AAB7C4] hover:text-[#F1F5F9] border border-[#263443] hover:border-[#35B9D0] transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAlerts ? 'animate-spin text-[#35B9D0]' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Alerts Loading */}
              {isLoadingAlerts && (
                <div className="py-8 flex flex-col items-center justify-center text-xs text-[#AAB7C4] space-y-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-[#35B9D0]" />
                  <span>Loading alerts from GET /api/sessions/{selectedSessionId}/alerts...</span>
                </div>
              )}

              {/* Alerts Error */}
              {alertsError && !isLoadingAlerts && (
                <div className="p-3 bg-[#D95765]/10 border border-[#D95765]/30 rounded text-xs text-[#D95765] space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertCircle className="w-4 h-4" />
                    <span>Failed to fetch session alerts</span>
                  </div>
                  <p className="text-[11px] text-[#AAB7C4]">{alertsError}</p>
                </div>
              )}

              {/* Alert Records */}
              {!isLoadingAlerts && !alertsError && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#263443] text-xs">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-[#D95765]" />
                        <span className="font-bold text-[#F1F5F9]">Flagged Scam Alerts</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#101820] text-[#AAB7C4] border border-[#263443]">
                          {alerts.length} record{alerts.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#AAB7C4] font-mono">
                        Biometric & NLP Multi-Engine
                      </span>
                    </div>

                    {alerts.length === 0 ? (
                      <div className="p-4 bg-[#101820] border border-[#263443] rounded text-xs text-[#AAB7C4] text-center space-y-1">
                        <ShieldCheck className="w-6 h-6 text-[#36B37E] mx-auto opacity-70" />
                        <p className="text-[#F1F5F9] font-medium">No Alerts Recorded</p>
                        <p className="text-[11px]">
                          This session passed acoustic and linguistic checks without triggering threat thresholds.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {alerts.map((al) => (
                          <div
                            key={al.id}
                            className="p-3.5 bg-[#101820] border border-[#D95765]/30 rounded-lg text-xs space-y-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] text-[#AAB7C4] bg-[#19232E] px-1.5 py-0.5 rounded border border-[#263443]">
                                  Chunk #{al.chunk_id}
                                </span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#D95765]/20 text-[#D95765] border border-[#D95765]/40">
                                  {al.scam_category || 'SUSPICIOUS_ACTIVITY'}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 font-mono">
                                <span className="text-[10px] text-[#AAB7C4]">Risk Score:</span>
                                <span
                                  className="text-xs font-bold tabular-nums"
                                  style={{ color: getRiskScoreColor(al.overall_score) }}
                                >
                                  {al.overall_score.toFixed(1)}
                                </span>
                              </div>
                            </div>

                            {/* Transcript Snippet */}
                            <div className="p-2.5 bg-[#19232E] border-l-2 border-[#D95765] rounded text-xs text-[#F1F5F9] leading-relaxed italic">
                              &ldquo;{al.transcript_snippet}&rdquo;
                            </div>

                            {/* Forensic Signals */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] font-mono text-[#AAB7C4] pt-1">
                              <div className="bg-[#19232E]/70 p-1.5 rounded border border-[#263443]">
                                <span className="block text-[#AAB7C4]/70">Synthetic Prob:</span>
                                <span className="text-[#F1F5F9] font-semibold">
                                  {(al.synthetic_probability * 100).toFixed(1)}%
                                </span>
                              </div>
                              <div className="bg-[#19232E]/70 p-1.5 rounded border border-[#263443]">
                                <span className="block text-[#AAB7C4]/70">Coercion Index:</span>
                                <span className="text-[#F1F5F9] font-semibold">
                                  {(al.coercion_score * 100).toFixed(1)}%
                                </span>
                              </div>
                              <div className="bg-[#19232E]/70 p-1.5 rounded border border-[#263443]">
                                <span className="block text-[#AAB7C4]/70">Vocoder Sig:</span>
                                <span className="text-[#35B9D0] truncate block" title={al.vocoder_signature}>
                                  {al.vocoder_signature || 'Natural'}
                                </span>
                              </div>
                            </div>

                            <div className="text-[10px] text-[#AAB7C4] text-right font-mono">
                              Timestamp: {formatDate(al.created_at)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Firewall Actions Section */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#263443] text-xs">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-[#35B9D0]" />
                        <span className="font-bold text-[#F1F5F9]">Firewall & Killswitch Actions</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#101820] text-[#AAB7C4] border border-[#263443]">
                          {firewallActions.length} rule{firewallActions.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#AAB7C4] font-mono">Autonomous & SOC Driven</span>
                    </div>

                    {firewallActions.length === 0 ? (
                      <div className="p-3 bg-[#101820] border border-[#263443] rounded text-xs text-[#AAB7C4] text-center">
                        No firewall drop actions executed for this session.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {firewallActions.map((fw) => {
                          let parsedPayload: Record<string, unknown> | null = null;
                          try {
                            parsedPayload = JSON.parse(fw.rule_payload);
                          } catch {
                            // not JSON
                          }

                          return (
                            <div
                              key={fw.id}
                              className="p-3 bg-[#101820] border border-[#263443] rounded text-xs space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#D95765]/20 text-[#D95765] border border-[#D95765]/40 flex items-center gap-1">
                                  <Lock className="w-3 h-3" />
                                  {fw.action_taken}
                                </span>
                                <span className="text-[10px] font-mono text-[#AAB7C4]">
                                  {formatDate(fw.triggered_at)}
                                </span>
                              </div>

                              {/* Rule Payload Display */}
                              <div className="bg-[#19232E] border border-[#263443] rounded p-2 font-mono text-[11px] text-[#AAB7C4] overflow-x-auto">
                                {parsedPayload ? (
                                  <div className="space-y-1">
                                    {Boolean(parsedPayload.rule) && (
                                      <div className="text-[#F1F5F9]">
                                        <span className="text-[#35B9D0]">Rule:</span> {String(parsedPayload.rule)}
                                      </div>
                                    )}
                                    {Boolean(parsedPayload.reason) && (
                                      <div>
                                        <span className="text-[#E8A23A]">Reason:</span> {String(parsedPayload.reason)}
                                      </div>
                                    )}
                                    {Boolean(parsedPayload.webrtc_action) && (
                                      <div>
                                        <span className="text-[#36B37E]">WebRTC Action:</span>{' '}
                                        {String(parsedPayload.webrtc_action)}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <code>{fw.rule_payload}</code>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#19232E] border border-[#263443] rounded-lg p-12 text-center text-xs text-[#AAB7C4] space-y-2">
              <Cpu className="w-8 h-8 text-[#35B9D0] mx-auto opacity-60" />
              <p className="text-sm font-semibold text-[#F1F5F9]">Select a Session from Incident History</p>
              <p className="max-w-md mx-auto text-[11px]">
                Click any session in the table to inspect forensic alerts, acoustic vocoder signatures, transcript
                deltas, and executed firewall killswitch rules.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
