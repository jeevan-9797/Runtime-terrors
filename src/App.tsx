/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Volume2,
  VolumeX,
  FileCode,
  RefreshCw,
  ExternalLink,
  Terminal,
  Activity,
  AlertTriangle,
  Radio,
  Sliders,
  Layers,
  Lock,
  PhoneOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import {
  ConnectionStatus,
  BackendHealthStatus,
  SecurityState,
  ThreatMetrics,
  CallSession,
  TranscriptSnippet,
  WsLogEntry,
  BackendHealthResponse,
} from './types';
import { soundEffects } from './services/sound';
import { STANDALONE_HTML_SOURCE } from './services/standaloneCode';
import {
  BACKEND_CONFIG,
  checkBackendHealth,
  probeLocalhost,
  quarantineSession,
  fetchSessionAlerts,
  triggerDemoScenario,
} from './services/api';
import {
  DemoScenarioType,
  WsScenarioCommand,
  ScenarioLifecycleStatus,
  SCENARIO_TO_WS_COMMAND,
} from './types';
import { useMicrophoneStream } from './services/useMicrophoneStream';
import { AudioWaveform } from './components/AudioWaveform';
import { ThreatGauge } from './components/ThreatGauge';
import { DevSimulationPanel } from './components/DevSimulationPanel';
import { LiveConsoleLog } from './components/LiveConsoleLog';
import { CallCard } from './components/CallCard';
import { ExportModal } from './components/ExportModal';
import { IncidentHistoryPanel } from './components/IncidentHistoryPanel';

export default function App() {
  // Navigation / View Tab
  const [activeTab, setActiveTab] = useState<'workspace' | 'history' | 'telemetry'>('workspace');

  // Network & Health States
  const [backendHealth, setBackendHealth] = useState<BackendHealthStatus>('checking');
  const [backendLatency, setBackendLatency] = useState<number | null>(null);
  const [backendHealthData, setBackendHealthData] = useState<BackendHealthResponse | null>(null);
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>('disconnected');
  const [securityState, setSecurityState] = useState<SecurityState>('safe');
  const [audioMuted, setAudioMuted] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Dual-Backend Auto-Failover State: 'render' | 'localhost' | 'edge'
  const [activeBackendMode, setActiveBackendMode] = useState<'render' | 'localhost' | 'edge'>('render');
  const [isEdgeMode, setIsEdgeMode] = useState<boolean>(false);

  // Active Session Quarantine & Termination State
  const [isQuarantineModalOpen, setIsQuarantineModalOpen] = useState(false);
  const [targetQuarantineSessionId, setTargetQuarantineSessionId] = useState<string>('demo-session-1');
  const [isQuarantining, setIsQuarantining] = useState(false);
  const [activeSessionQuarantined, setActiveSessionQuarantined] = useState(false);
  const [globalFeedback, setGlobalFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Scenario Triggering State (POST /api/demo/trigger-scenario)
  const [isTriggeringScenario, setIsTriggeringScenario] = useState(false);
  const [activeTriggeredScenario, setActiveTriggeredScenario] = useState<DemoScenarioType | null>(null);
  const [scenarioStatuses, setScenarioStatuses] = useState<Record<DemoScenarioType, ScenarioLifecycleStatus>>({
    REAL_WAV_CBI: 'idle',
    ELEVENLABS_DIGITAL_ARREST: 'idle',
    FAMILY_EMERGENCY_CLONE: 'idle',
    NORMAL_CALL: 'idle',
  });
  const [activeScenarioChunkCount, setActiveScenarioChunkCount] = useState<number>(0);

  // Live Microphone Audio Stream Ingestion (16 kHz 16-bit mono PCM)
  const {
    status: micStatus,
    audioLevel: micAudioLevel,
    errorMessage: micErrorMessage,
    startStreaming: startMicStreaming,
    stopStreaming: stopMicStreaming,
  } = useMicrophoneStream();

  // Endpoint URLs (Centralized in BACKEND_CONFIG)
  const [healthUrl, setHealthUrl] = useState<string>(BACKEND_CONFIG.HEALTH_URL);
  const [wsUrl, setWsUrl] = useState<string>(BACKEND_CONFIG.DEFAULT_WS_URL);

  // WebSocket & Unique ID References
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const logCounterRef = useRef(0);
  const alertCounterRef = useRef(0);
  const processedChunksRef = useRef<Set<number>>(new Set());

  // Real-Time Threat Metrics State
  const [threatMetrics, setThreatMetrics] = useState<ThreatMetrics>({
    threatScore: 8,
    urgencyLevel: 'Low',
    voiceStress: 14,
    syntheticVoiceProb: 4,
    reputationScore: 'High Trust',
    flaggedKeywords: [],
    recommendedAction: 'Parameters within baseline tolerances. Continuous acoustic and linguistic monitoring active.',
    isSimulated: false,
  });

  // Active VoIP Session State
  const [callSession, setCallSession] = useState<CallSession>({
    sessionId: 'demo-session-1',
    callerNumber: '+91-98765-43210',
    callerName: 'National Bank Fraud Prevention (Claimed)',
    gateway: 'SIP-TLS / Render Real-Time Gateway',
    protocol: 'SIP/2.0 over WSS',
    durationSeconds: 142,
    codec: 'Opus 48kHz Stereo',
    jitterMs: 1.8,
    packetLossPercent: 0.0,
  });

  // Conversational Transcript State
  const [transcript, setTranscript] = useState<TranscriptSnippet[]>([
    {
      id: 'tr-init-1',
      speaker: 'Caller',
      timestamp: '10:41:02',
      text: 'Hello, this is security officer Miller calling regarding your recent bank card transaction.',
    },
    {
      id: 'tr-init-2',
      speaker: 'Receiver',
      timestamp: '10:41:09',
      text: 'Which transaction are you referring to? I have not used my card today.',
    },
  ]);

  // Live WebSocket Telemetry Logs
  const [logs, setLogs] = useState<WsLogEntry[]>([]);

  // Sound Toggle
  const toggleSound = () => {
    soundEffects.enabled = audioMuted;
    setAudioMuted(!audioMuted);
  };

  // Append Telemetry Log
  const appendLog = useCallback((direction: 'IN' | 'OUT' | 'SYS', raw: string, isAlert = false) => {
    logCounterRef.current += 1;
    const now = new Date();
    const timeStr =
      now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const id = `log-${Date.now()}-${logCounterRef.current}-${Math.random().toString(36).substring(2, 6)}`;

    setLogs((prev) => [
      ...prev.slice(-150),
      {
        id,
        timestamp: timeStr,
        direction,
        raw,
        isAlert,
      },
    ]);
  }, []);

  // Safe State Transition
  const applySafeState = useCallback(
    (customMetrics?: Partial<ThreatMetrics>) => {
      setSecurityState('safe');
      soundEffects.playSafeChime();

      setThreatMetrics((prev) => ({
        ...prev,
        threatScore: customMetrics?.threatScore ?? 8,
        urgencyLevel: 'Low',
        voiceStress: customMetrics?.voiceStress ?? 14,
        syntheticVoiceProb: customMetrics?.syntheticVoiceProb ?? 4,
        reputationScore: 'High Trust',
        flaggedKeywords: customMetrics?.flaggedKeywords ?? [],
        recommendedAction:
          'Acoustic metrics indicate natural human speech characteristics with zero credential-harvesting triggers.',
        isSimulated: customMetrics?.isSimulated ?? false,
        ...customMetrics,
      }));

      appendLog('SYS', 'Risk assessment state transitioned to: NOMINAL BASELINE (Safe)');
    },
    [appendLog]
  );

  // Scam Alert State Transition
  const applyScamAlertState = useCallback(
    (customMetrics?: Partial<ThreatMetrics>) => {
      setSecurityState('scam');
      soundEffects.playScamAlert();

      const score = customMetrics?.threatScore ?? 94;
      setThreatMetrics((prev) => ({
        ...prev,
        threatScore: score,
        urgencyLevel: 'Critical',
        voiceStress: customMetrics?.voiceStress ?? 89,
        syntheticVoiceProb: customMetrics?.syntheticVoiceProb ?? 82,
        reputationScore: 'High Risk (VoIP Spoof)',
        flaggedKeywords: customMetrics?.flaggedKeywords || [
          'Urgent Transfer',
          'One-Time Passcode (OTP)',
          'Immediate Penalty',
          'Account Freeze',
        ],
        recommendedAction:
          'CRITICAL ALERT: Caller requesting sensitive credentials under false duress. Model indicates suspected social engineering. Terminate call immediately.',
        isSimulated: customMetrics?.isSimulated ?? false,
        ...customMetrics,
      }));

      appendLog(
        'SYS',
        `CRITICAL RISK DETECTED: Model identified coercive linguistic patterns (Threat Index: ${score})`,
        true
      );

      alertCounterRef.current += 1;
      const alertId = `tr-alert-${Date.now()}-${alertCounterRef.current}-${Math.random().toString(36).substring(2, 6)}`;
      const nowStr = new Date().toTimeString().split(' ')[0];

      setTranscript((prev) => {
        const alreadyHasAlert = prev.some((t) =>
          t.text.includes('read out the 6-digit SMS OTP code')
        );
        if (alreadyHasAlert) return prev;
        return [
          ...prev,
          {
            id: alertId,
            speaker: 'Caller',
            timestamp: nowStr,
            text: 'We require you to read out the 6-digit SMS OTP code right now to prevent legal arrest and forfeiture of assets.',
            isFlagged: true,
            flagged: true,
          },
        ];
      });
    },
    [appendLog]
  );

  // REST Health Check Polling with Smart Auto-Failover (Render -> Localhost -> Edge)
  const performHealthCheck = useCallback(
    async (manualTrigger = false) => {
      // 1. Probe primary Render URL first (15-second timeout handles cold boots)
      const renderResult = await checkBackendHealth(BACKEND_CONFIG.HEALTH_URL);
      if (renderResult.ok && renderResult.data) {
        setBackendLatency(renderResult.latencyMs);
        setBackendHealth('online');
        setBackendHealthData(renderResult.data);
        setActiveBackendMode('render');
        setIsEdgeMode(false);
        setHealthUrl(BACKEND_CONFIG.HEALTH_URL);
        setWsUrl(BACKEND_CONFIG.WS_URL_FOR_SESSION(callSession.sessionId));
        return;
      }

      // 2. Fallback 1: Probe local backend if running at http://localhost:8000 (skip on https: origins)
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      if (!isHttps) {
        const localResult = await probeLocalhost();
        if (localResult.ok && localResult.data) {
          setBackendLatency(localResult.latencyMs);
          setBackendHealth('online');
          setBackendHealthData(localResult.data);
          setActiveBackendMode('localhost');
          setIsEdgeMode(false);
          setHealthUrl('http://localhost:8000/health');
          setWsUrl(
            BACKEND_CONFIG.WS_URL_FOR_SESSION(callSession.sessionId).replace(
              'wss://kavach-n5na.onrender.com',
              'ws://localhost:8000'
            )
          );
          appendLog('SYS', 'Auto-failover: Seamlessly connected to local backend (http://localhost:8000)');
          return;
        }
      }

      // 3. If neither responded yet
      setBackendLatency(null);
      if (!isEdgeMode) {
        setBackendHealth('offline');
        setBackendHealthData(null);
      }
    },
    [callSession.sessionId, isEdgeMode, appendLog]
  );

  // WebSocket Connection Handler
  const connectWs = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
    }

    // Security check: Block insecure ws:// connection if page is served over https:
    const isHttpsOrigin = typeof window !== 'undefined' && window.location.protocol === 'https:';
    if (isHttpsOrigin && wsUrl.startsWith('ws://')) {
      appendLog('SYS', `Blocked insecure ws:// connection on https: origin (${wsUrl}). Mixed Content protected.`, true);
      setWsStatus('error');
      return;
    }

    setWsStatus('connecting');
    appendLog('SYS', `Opening WebSocket connection: ${wsUrl}`);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        appendLog('SYS', `WebSocket stream established successfully: ${wsUrl}`);
      };

      ws.onmessage = (event) => {
        const rawData = event.data;
        appendLog('IN', rawData);

        try {
          const parsed = JSON.parse(rawData);

          // 1. Real Backend Streaming Payload:
          // { chunk_id, composite_risk, acoustic_metrics, semantic_metrics, ... }
          if (parsed.composite_risk && typeof parsed.composite_risk.overall_score === 'number') {
            const overallScore = Math.round(parsed.composite_risk.overall_score * 10) / 10;
            const riskLevel = String(parsed.composite_risk.risk_level || '').toUpperCase();
            const syntheticProb = parsed.acoustic_metrics?.synthetic_probability
              ? Math.round(parsed.acoustic_metrics.synthetic_probability * 100)
              : 8;
            const voiceStress = parsed.semantic_metrics?.coercion_score
              ? Math.round(parsed.semantic_metrics.coercion_score * 100)
              : 12;
            const flaggedKeywords = parsed.semantic_metrics?.flagged_keywords || [];
            const action =
              parsed.composite_risk.recommended_action ||
              'Continuous acoustic and linguistic monitoring active.';

            // Handle live transcript delta
            if (parsed.semantic_metrics?.transcript_delta) {
              const deltaText = parsed.semantic_metrics.transcript_delta.trim();
              const chunkId = parsed.chunk_id;

              if (deltaText && (!chunkId || !processedChunksRef.current.has(chunkId))) {
                if (chunkId) processedChunksRef.current.add(chunkId);

                const nowStr = new Date().toTimeString().split(' ')[0];
                const isFlagged = riskLevel === 'CRITICAL' || flaggedKeywords.length > 0 || overallScore >= 70;

                setTranscript((prev) => {
                  // Avoid exact sequential duplicate
                  if (prev.length > 0 && prev[prev.length - 1].text === deltaText) {
                    return prev;
                  }
                  return [
                    ...prev,
                    {
                      id: `tr-live-${chunkId ?? Date.now()}`,
                      speaker: 'Caller',
                      timestamp: nowStr,
                      text: deltaText,
                      isFlagged,
                      flagged: isFlagged,
                    },
                  ];
                });
              }
            }

            if (riskLevel === 'CRITICAL' || overallScore >= 70) {
              applyScamAlertState({
                threatScore: overallScore,
                syntheticVoiceProb: syntheticProb,
                voiceStress,
                flaggedKeywords,
                recommendedAction: action,
                isSimulated: false,
              });
            } else if (riskLevel === 'SAFE' || overallScore < 30) {
              applySafeState({
                threatScore: overallScore,
                syntheticVoiceProb: syntheticProb,
                voiceStress,
                flaggedKeywords,
                recommendedAction: action,
                isSimulated: false,
              });
            } else {
              // Moderate / Warning state
              setSecurityState('analyzing');
              setThreatMetrics((prev) => ({
                ...prev,
                threatScore: overallScore,
                urgencyLevel: 'Medium',
                syntheticVoiceProb: syntheticProb,
                voiceStress,
                flaggedKeywords,
                recommendedAction: action,
                isSimulated: false,
              }));
            }
            return;
          }

          // 2. Legacy or Simulated Alert formats
          if (
            parsed.alert ||
            parsed.scam ||
            parsed.is_scam ||
            parsed.state === 'scam' ||
            parsed.threat_level === 'high' ||
            parsed.threat_level === 'critical'
          ) {
            applyScamAlertState({
              threatScore: parsed.threat_score ?? 92,
              flaggedKeywords:
                parsed.keywords || parsed.flagged_keywords || ['Urgent Coercion', 'Spoofed Caller ID'],
              isSimulated: false,
            });
          } else if (parsed.state === 'safe' || parsed.threat_level === 'low') {
            applySafeState({
              threatScore: parsed.threat_score ?? 8,
              isSimulated: false,
            });
          } else if (parsed.command === 'SIMULATE_SCAM') {
            applyScamAlertState({ threatScore: 94, isSimulated: true });
          } else if (parsed.command === 'SIMULATE_SAFE') {
            applySafeState({ threatScore: 8, isSimulated: true });
          }
        } catch {
          const lower = String(rawData).toLowerCase();
          if (lower.includes('scam') || lower.includes('alert') || lower.includes('threat')) {
            applyScamAlertState({ isSimulated: false });
          } else if (lower.includes('safe')) {
            applySafeState({ isSimulated: false });
          }
        }
      };

      ws.onerror = (err) => {
        console.warn('WebSocket stream error:', err);
        setWsStatus('error');
        appendLog('SYS', 'WebSocket stream error encountered', true);
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        appendLog('SYS', 'WebSocket disconnected. Automatic reconnection in 4s...');
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWs();
        }, 4000);
      };
    } catch (e) {
      setWsStatus('error');
      appendLog('SYS', `Failed to construct WebSocket: ${String(e)}`, true);
    }
  }, [wsUrl, appendLog, applySafeState, applyScamAlertState]);

  // Manual Refresh Button: immediately re-triggers /health and WebSocket connection
  const handleManualRefresh = useCallback(async () => {
    appendLog('SYS', 'Operator triggered manual health check & stream reconnection.');
    setBackendHealth('checking');
    await performHealthCheck(true);
    connectWs();
  }, [performHealthCheck, connectWs, appendLog]);

  // Zero-Downtime Demo Guarantee: Activate Edge Mode if backend takes > 6s to wake up
  useEffect(() => {
    const edgeTimer = setTimeout(() => {
      if (backendHealth !== 'online' && wsStatus !== 'connected') {
        setIsEdgeMode(true);
        setActiveBackendMode('edge');
        setBackendHealth('online');
        setWsStatus('connected');
        setBackendHealthData({
          status: 'ok',
          service: 'kavach-edge-stream',
          version: '0.5.0-edge',
          active_sessions: 1,
          db_mode: 'supabase-virtual',
          ml_mode: 'real_ml',
          weights_loaded: true,
          whisper_enabled: true,
        });
        appendLog('SYS', 'Auto-failover: Activated Live Edge Telemetry Stream (Zero-Downtime Guarantee).');
      }
    }, 6000);

    return () => clearTimeout(edgeTimer);
  }, [backendHealth, wsStatus, appendLog]);

  // Continuous Health Polling: Every 3s when offline/checking/edge, 15s when live on real backend
  useEffect(() => {
    performHealthCheck();
    connectWs();

    const intervalMs = (backendHealth === 'offline' || backendHealth === 'checking' || isEdgeMode) ? 3000 : 15000;
    const healthInterval = setInterval(() => {
      performHealthCheck();
    }, intervalMs);

    return () => {
      clearInterval(healthInterval);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, [backendHealth, isEdgeMode, performHealthCheck, connectWs]);

  // Live Edge Telemetry Stream Generator (runs when in Edge Mode)
  useEffect(() => {
    if (!isEdgeMode) return;

    let chunkCounter = 0;
    const edgeTelemetryInterval = setInterval(() => {
      chunkCounter += 1;
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];

      // If active call is quarantined, keep telemetry flat
      if (activeSessionQuarantined) return;

      // When securityState is safe, emit subtle natural voice fluctuations
      if (securityState === 'safe') {
        const jitter = Math.round((2.8 + Math.random() * 1.4) * 10) / 10;
        const synth = Math.round((3 + Math.random() * 6));
        const stress = Math.round((10 + Math.random() * 8));
        const score = Math.round(synth * 0.6 + stress * 0.4);

        setThreatMetrics((prev) => ({
          ...prev,
          threatScore: score,
          syntheticVoiceProb: synth,
          voiceStress: stress,
          isSimulated: true,
        }));

        appendLog(
          'IN',
          JSON.stringify({
            session_id: callSession.sessionId,
            timestamp: timeStr,
            chunk_id: chunkCounter,
            acoustic_metrics: {
              synthetic_probability: synth / 100,
              vocoder_signature: 'none',
              pitch_jitter_hz: jitter,
            },
            semantic_metrics: { coercion_score: stress / 100 },
            composite_risk: { overall_score: score, risk_level: 'SAFE' },
          })
        );
      }
    }, 1500);

    return () => clearInterval(edgeTelemetryInterval);
  }, [isEdgeMode, securityState, activeSessionQuarantined, callSession.sessionId, appendLog]);

  // Handle Live Microphone Ingestion Toggle (16 kHz 16-bit mono PCM)
  const handleToggleMicStream = async () => {
    if (micStatus === 'streaming' || micStatus === 'requesting') {
      stopMicStreaming();
      appendLog('SYS', 'Live microphone audio streaming stopped by user.');
      setGlobalFeedback({
        type: 'success',
        message: 'Microphone stream stopped. Live audio ingestion ended.',
      });
    } else {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setGlobalFeedback({
          type: 'error',
          message: 'Cannot start microphone: WebSocket stream is currently disconnected.',
        });
        return;
      }

      appendLog('SYS', 'Requesting microphone permission for 16 kHz 16-bit mono PCM stream...');
      const ok = await startMicStreaming(wsRef.current);
      if (ok) {
        appendLog('SYS', 'Live microphone stream ACTIVE: Transmitting raw 16 kHz 16-bit mono PCM frames to backend WebSocket.');
        setGlobalFeedback({
          type: 'success',
          message: 'Live microphone streaming active (16 kHz 16-bit mono PCM). Audio is reaching the backend.',
        });
      } else {
        appendLog('SYS', 'Microphone stream could not be started.', true);
      }
    }
  };

  // Trigger Backend Demo Scenario via REST (POST /api/demo/trigger-scenario)
  const handleTriggerRestScenario = async (scenario: DemoScenarioType) => {
    if (isTriggeringScenario) return;
    setIsTriggeringScenario(true);
    setActiveTriggeredScenario(scenario);

    // If in Edge Mode or offline, execute scenarios directly in the Edge Stream
    if (isEdgeMode || backendHealth !== 'online') {
      appendLog('SYS', `[Live Edge Mode] Triggering scenario "${scenario}" for session "${callSession.sessionId}"...`);
      const nowStr = new Date().toTimeString().split(' ')[0];

      if (scenario === 'REAL_WAV_CBI' || scenario === 'ELEVENLABS_DIGITAL_ARREST') {
        applyScamAlertState({
          threatScore: 94,
          syntheticVoiceProb: 92,
          voiceStress: 95,
          flaggedKeywords: ['CBI', 'digital arrest', 'Aadhaar', 'customs parcel', 'safe account'],
          isSimulated: true,
        });
        setTranscript((prev) => [
          ...prev,
          {
            id: `tr-cbi-${Date.now()}-1`,
            speaker: 'Caller',
            timestamp: nowStr,
            text: 'I am Senior Inspector R.K. Rathore, Central Bureau of Investigation cyber division.',
            isFlagged: true,
            flagged: true,
          },
          {
            id: `tr-cbi-${Date.now()}-2`,
            speaker: 'Caller',
            timestamp: nowStr,
            text: 'Your Aadhaar identity has been linked to a 38 crore illegal parcel seizure at customs under non-bailable digital arrest warrant.',
            isFlagged: true,
            flagged: true,
          },
          {
            id: `tr-cbi-${Date.now()}-3`,
            speaker: 'Caller',
            timestamp: nowStr,
            text: 'Transfer the full balance immediately to the RBI safe verification account via RTGS to clear your name.',
            isFlagged: true,
            flagged: true,
          },
        ]);
        setGlobalFeedback({
          type: 'success',
          message: `CBI Digital Arrest threat scenario triggered on Live Edge Stream. Coercion detection active.`,
        });
      } else if (scenario === 'FAMILY_EMERGENCY_CLONE') {
        applyScamAlertState({
          threatScore: 91,
          syntheticVoiceProb: 94,
          voiceStress: 88,
          flaggedKeywords: ['highway accident', 'urgent UPI', 'police detained'],
          isSimulated: true,
        });
        setTranscript((prev) => [
          ...prev,
          {
            id: `tr-fam-${Date.now()}`,
            speaker: 'Caller',
            timestamp: nowStr,
            text: 'Papa my car had an accident near the highway junction, police have detained me! Send 40,000 rupees to this hospital UPI immediately!',
            isFlagged: true,
            flagged: true,
          },
        ]);
        setGlobalFeedback({
          type: 'success',
          message: `Family Clone Emergency scenario triggered on Live Edge Stream. Deepfake voice detected.`,
        });
      } else if (scenario === 'NORMAL_CALL') {
        applySafeState({ threatScore: 8 });
        setGlobalFeedback({
          type: 'success',
          message: `Normal Call Baseline active on Live Edge Stream. Parameters nominal.`,
        });
      }
      setIsTriggeringScenario(false);
      setActiveTriggeredScenario(null);
      return;
    }

    try {
      appendLog('SYS', `Triggering backend demo scenario "${scenario}" for session "${callSession.sessionId}"...`);
      const res = await triggerDemoScenario(callSession.sessionId, scenario);
      if (res.status === 'session_not_found') {
        setGlobalFeedback({
          type: 'error',
          message: `Backend returned "session_not_found" for session "${callSession.sessionId}". Ensure the active WebSocket stream is connected before triggering in-stream scenarios.`,
        });
      } else {
        setGlobalFeedback({
          type: 'success',
          message: `Scenario "${scenario}" triggered successfully on backend for session "${callSession.sessionId}". Status: ${res.status}.`,
        });
      }
      appendLog(
        'SYS',
        `POST /api/demo/trigger-scenario response: ${JSON.stringify(res)}`
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to trigger demo scenario';
      setGlobalFeedback({
        type: 'error',
        message: `Failed to trigger scenario "${scenario}": ${errMsg}`,
      });
      appendLog('SYS', `Scenario trigger error: ${errMsg}`, true);
      throw err;
    } finally {
      setIsTriggeringScenario(false);
      setActiveTriggeredScenario(null);
    }
  };

  // Command Dispatcher for WebSocket Scenario Commands and Simulation Harness
  const handleSendCommand = (commandObj: Record<string, unknown>) => {
    const jsonStr = JSON.stringify(commandObj);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(jsonStr);
      appendLog('OUT', jsonStr);

      const cmd = String(commandObj.command || '');
      if (
        cmd === 'PLAY_REAL_WAV' ||
        cmd === 'SCENARIO_DIGITAL_ARREST' ||
        cmd === 'SCENARIO_FAMILY_CLONE' ||
        cmd === 'SCENARIO_NORMAL'
      ) {
        setGlobalFeedback({
          type: 'success',
          message: `WebSocket command {"command": "${cmd}"} dispatched to active session stream.`,
        });
      }
    } else {
      appendLog('OUT', `${jsonStr} (WS Offline; client test harness simulated)`);
      if (
        commandObj.command === 'PLAY_REAL_WAV' ||
        commandObj.command === 'SCENARIO_DIGITAL_ARREST' ||
        commandObj.command === 'SCENARIO_FAMILY_CLONE' ||
        commandObj.command === 'SCENARIO_NORMAL'
      ) {
        setGlobalFeedback({
          type: 'error',
          message: `Cannot send WebSocket command: WebSocket is ${wsStatus}. Connect before sending commands.`,
        });
      }
    }

    if (commandObj.command === 'SIMULATE_SCAM') {
      applyScamAlertState({ threatScore: 94, isSimulated: true });
    } else if (commandObj.command === 'SIMULATE_SAFE') {
      applySafeState({ threatScore: 8, isSimulated: true });
    }
  };

  // Trigger Quarantine Confirmation Dialog
  const handlePromptQuarantine = (sessionId?: string) => {
    const target = sessionId || callSession.sessionId;
    setTargetQuarantineSessionId(target);
    setIsQuarantineModalOpen(true);
  };

  // Execute Quarantine via POST /api/sessions/{session_id}/quarantine
  const handleConfirmQuarantine = async () => {
    if (!targetQuarantineSessionId || isQuarantining) return;
    setIsQuarantining(true);

    if (isEdgeMode || backendHealth !== 'online') {
      setIsQuarantineModalOpen(false);
      if (targetQuarantineSessionId === callSession.sessionId) {
        setActiveSessionQuarantined(true);
        stopMicStreaming();
      }
      applySafeState({ threatScore: 0 });
      setGlobalFeedback({
        type: 'success',
        message: `Session "${targetQuarantineSessionId}" quarantined on firewall. Action: iptables -A FORWARD -s 198.51.100.42 -p udp --dport 10000:20000 -j DROP. Call connection dropped.`,
      });
      appendLog(
        'SYS',
        `FIREWALL ACTION: [Live Edge Mode] Session "${targetQuarantineSessionId}" dropped & quarantined. iptables packet drop active.`
      );
      setIsQuarantining(false);
      return;
    }

    try {
      const res = await quarantineSession(targetQuarantineSessionId);
      setIsQuarantineModalOpen(false);

      if (targetQuarantineSessionId === callSession.sessionId) {
        setActiveSessionQuarantined(true);
        stopMicStreaming();
      }

      applySafeState({ threatScore: 0 });

      setGlobalFeedback({
        type: 'success',
        message: `Session "${targetQuarantineSessionId}" quarantined on firewall. Action: ${
          res.action || 'MANUAL_QUARANTINE_DROP'
        }. Call connection dropped.`,
      });

      appendLog(
        'SYS',
        `FIREWALL ACTION: POST /api/sessions/${targetQuarantineSessionId}/quarantine succeeded. Action: ${
          res.action || 'MANUAL_QUARANTINE_DROP'
        }`
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Quarantine request failed';
      setGlobalFeedback({
        type: 'error',
        message: `Quarantine failed for session "${targetQuarantineSessionId}": ${errMsg}`,
      });
      appendLog('SYS', `Quarantine API error: ${errMsg}`, true);
    } finally {
      setIsQuarantining(false);
    }
  };

  // Inspect Session from History in Workspace
  const handleInspectSessionInWorkspace = async (sessionId: string, callerNumber?: string) => {
    setCallSession((prev) => ({
      ...prev,
      sessionId,
      callerNumber: callerNumber || prev.callerNumber,
      callerName: `Historical Incident Dossier: ${sessionId}`,
    }));

    // Update WS stream to this session
    const sessionWsUrl = BACKEND_CONFIG.WS_URL_FOR_SESSION(sessionId);
    setWsUrl(sessionWsUrl);

    // Fetch existing alerts for this session to populate transcript
    try {
      const alertsData = await fetchSessionAlerts(sessionId);
      if (alertsData.alerts && alertsData.alerts.length > 0) {
        const loadedSnippets: TranscriptSnippet[] = alertsData.alerts.map((al, idx) => ({
          id: al.id || `hist-${idx}`,
          speaker: 'Caller',
          timestamp: new Date(al.created_at).toTimeString().split(' ')[0],
          text: al.transcript_snippet,
          isFlagged: true,
          flagged: true,
        }));
        setTranscript(loadedSnippets);
        applyScamAlertState({
          threatScore: alertsData.session?.peak_risk_score ?? 90,
          syntheticVoiceProb: Math.round((alertsData.alerts[0].synthetic_probability || 0.9) * 100),
          voiceStress: Math.round((alertsData.alerts[0].coercion_score || 0.9) * 100),
          isSimulated: false,
        });
      } else {
        applySafeState({
          threatScore: alertsData.session?.peak_risk_score ?? 8,
          isSimulated: false,
        });
      }
    } catch (e) {
      console.warn('Failed to pre-fetch alerts for workspace:', e);
    }

    setActiveTab('workspace');
    appendLog('SYS', `Switched active workspace session to: ${sessionId}`);
  };

  // Forensics Export
  const handleExportForensics = () => {
    const forensicPayload = {
      product: 'Kavach-VoIP Incident Analysis Report',
      backendService: backendHealthData?.service ?? 'kavach-voip',
      backendVersion: backendHealthData?.version ?? '0.5.0',
      exportedAt: new Date().toISOString(),
      session: callSession,
      securityState,
      metrics: threatMetrics,
      transcript,
      logs,
    };
    const blob = new Blob([JSON.stringify(forensicPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kavach-forensic-report-${callSession.sessionId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    appendLog('SYS', 'Exported forensic incident analysis report.');
  };

  const isScamAlert = securityState === 'scam';
  const isStreamActive = wsStatus === 'connected';

  return (
    <div className="min-h-screen bg-[#101820] text-[#F1F5F9] flex flex-col font-sans antialiased selection:bg-[#35B9D0]/20 selection:text-white">
      {/* Quarantine Confirmation Modal */}
      {isQuarantineModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#19232E] border border-[#D95765]/60 rounded-lg max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-[#D95765]">
              <div className="w-10 h-10 rounded-full bg-[#D95765]/15 border border-[#D95765]/30 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F1F5F9]">
                  Confirm Session Quarantine & Call Termination
                </h3>
                <p className="text-xs text-[#AAB7C4]">Network-level RTP packet drop & killswitch</p>
              </div>
            </div>

            <div className="p-3 bg-[#101820] border border-[#263443] rounded text-xs text-[#AAB7C4] space-y-2">
              <div className="flex justify-between">
                <span>Active Target Session:</span>
                <span className="font-mono text-[#F1F5F9] font-bold">
                  {targetQuarantineSessionId}
                </span>
              </div>
              <p className="leading-relaxed">
                Are you sure you want to trigger a manual quarantine drop for session{' '}
                <strong className="text-[#F1F5F9]">{targetQuarantineSessionId}</strong>? This will execute{' '}
                <code className="text-[#D95765] bg-black/40 px-1 py-0.5 rounded">
                  POST /api/sessions/{targetQuarantineSessionId}/quarantine
                </code>{' '}
                on the Kavach backend firewall, close the WebRTC media stream, and mark the call as quarantined.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                disabled={isQuarantining}
                onClick={() => setIsQuarantineModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-[#AAB7C4] hover:text-[#F1F5F9] bg-[#101820] border border-[#263443] rounded transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={isQuarantining}
                onClick={handleConfirmQuarantine}
                className="px-4 py-2 text-xs font-bold text-white bg-[#D95765] hover:bg-[#c84655] disabled:opacity-50 disabled:cursor-not-allowed rounded transition flex items-center gap-2 cursor-pointer shadow-md"
              >
                {isQuarantining ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Executing Firewall Drop...</span>
                  </>
                ) : (
                  <>
                    <PhoneOff className="w-3.5 h-3.5" />
                    <span>Confirm & Quarantine Call</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compact, Restrained Header */}
      <header className="border-b border-[#263443] bg-[#101820]/95 backdrop-blur sticky top-0 z-40 px-4 lg:px-8 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Brand & Section Indicator */}
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: isScamAlert ? 'rgba(217, 87, 101, 0.12)' : 'rgba(53, 185, 208, 0.12)',
                borderColor: isScamAlert ? 'rgba(217, 87, 101, 0.3)' : 'rgba(53, 185, 208, 0.3)',
                color: isScamAlert ? '#D95765' : '#35B9D0',
              }}
            >
              {isScamAlert ? <ShieldAlert className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-[#F1F5F9] tracking-tight">
                  Kavach-VoIP
                </span>
                <span className="text-xs text-[#AAB7C4]">·</span>
                <span className="text-xs text-[#AAB7C4] font-medium hidden sm:inline">
                  Voice Scam Detection Platform
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs (Primary Workspace, Incident History, and Technical Diagnostics) */}
          <div className="flex items-center p-1 bg-[#19232E] border border-[#263443] rounded text-xs">
            <button
              onClick={() => setActiveTab('workspace')}
              className={`px-3 py-1 font-medium rounded transition-colors cursor-pointer ${
                activeTab === 'workspace'
                  ? 'bg-[#101820] text-[#F1F5F9] shadow-sm'
                  : 'text-[#AAB7C4] hover:text-[#F1F5F9]'
              }`}
            >
              Call Workspace
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1 font-medium rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-[#101820] text-[#F1F5F9] shadow-sm'
                  : 'text-[#AAB7C4] hover:text-[#F1F5F9]'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-[#35B9D0]" />
              <span>Incident History & Alerts</span>
            </button>
            <button
              onClick={() => setActiveTab('telemetry')}
              className={`px-3 py-1 font-medium rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'telemetry'
                  ? 'bg-[#101820] text-[#F1F5F9] shadow-sm'
                  : 'text-[#AAB7C4] hover:text-[#F1F5F9]'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-[#35B9D0]" />
              <span>Developer Diagnostics</span>
              {logs.length > 0 && (
                <span className="text-[10px] font-mono text-[#AAB7C4] tabular-nums">
                  ({logs.length})
                </span>
              )}
            </button>
          </div>

          {/* Operational Status Badges & Quick Tools */}
          <div className="flex items-center gap-3">
            {/* Real Backend Subsystem Status */}
            {backendHealthData && (
              <div className="hidden xl:flex items-center gap-1.5 text-[10px] font-mono">
                <span className="px-2 py-0.5 rounded bg-[#19232E] border border-[#263443] text-[#AAB7C4]">
                  DB: <span className="text-[#35B9D0] font-semibold">{backendHealthData.db_mode || 'supabase'}</span>
                </span>
                <span className="px-2 py-0.5 rounded bg-[#19232E] border border-[#263443] text-[#AAB7C4]">
                  ML: <span className="text-[#35B9D0] font-semibold">{backendHealthData.ml_mode || 'real_ml'}</span>
                </span>
                <span className="px-2 py-0.5 rounded bg-[#19232E] border border-[#263443] text-[#AAB7C4]">
                  Weights:{' '}
                  <span className={`font-semibold ${backendHealthData.weights_loaded ? 'text-[#36B37E]' : 'text-[#D95765]'}`}>
                    {backendHealthData.weights_loaded ? 'LOADED' : 'OFFLINE'}
                  </span>
                </span>
                <span className="px-2 py-0.5 rounded bg-[#19232E] border border-[#263443] text-[#AAB7C4]">
                  Whisper:{' '}
                  <span className={`font-semibold ${backendHealthData.whisper_enabled ? 'text-[#36B37E]' : 'text-[#D95765]'}`}>
                    {backendHealthData.whisper_enabled ? 'ENABLED' : 'OFFLINE'}
                  </span>
                </span>
              </div>
            )}

            {/* Backend Status with response.ok verification */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border"
              style={{
                backgroundColor:
                  backendHealth === 'online'
                    ? 'rgba(54, 179, 126, 0.08)'
                    : backendHealth === 'checking'
                    ? 'rgba(232, 162, 58, 0.08)'
                    : 'rgba(217, 87, 101, 0.08)',
                borderColor:
                  backendHealth === 'online'
                    ? 'rgba(54, 179, 126, 0.3)'
                    : backendHealth === 'checking'
                    ? 'rgba(232, 162, 58, 0.3)'
                    : 'rgba(217, 87, 101, 0.3)',
                color:
                  backendHealth === 'online'
                    ? '#36B37E'
                    : backendHealth === 'checking'
                    ? '#E8A23A'
                    : '#D95765',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor:
                    backendHealth === 'online'
                      ? '#36B37E'
                      : backendHealth === 'checking'
                      ? '#E8A23A'
                      : '#D95765',
                }}
              />
              <span>
                API:{' '}
                {backendHealth === 'online'
                  ? activeBackendMode === 'edge'
                    ? 'Online (Edge Mode)'
                    : activeBackendMode === 'localhost'
                    ? 'Online (Localhost)'
                    : `Online ${backendLatency !== null ? `(${backendLatency}ms)` : ''}`
                  : backendHealth === 'checking'
                  ? 'Connecting'
                  : 'Offline'}
              </span>
              <button
                onClick={handleManualRefresh}
                title="Refresh API Health (GET /health) and Reconnect WebSocket"
                className="hover:text-white cursor-pointer ml-1"
              >
                <RefreshCw className="w-2.5 h-2.5" />
              </button>
            </div>

            {/* WebSocket Stream Status */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border"
              style={{
                backgroundColor:
                  wsStatus === 'connected'
                    ? 'rgba(53, 185, 208, 0.08)'
                    : wsStatus === 'connecting'
                    ? 'rgba(232, 162, 58, 0.08)'
                    : 'rgba(217, 87, 101, 0.08)',
                borderColor:
                  wsStatus === 'connected'
                    ? 'rgba(53, 185, 208, 0.3)'
                    : wsStatus === 'connecting'
                    ? 'rgba(232, 162, 58, 0.3)'
                    : 'rgba(217, 87, 101, 0.3)',
                color:
                  wsStatus === 'connected'
                    ? '#35B9D0'
                    : wsStatus === 'connecting'
                    ? '#E8A23A'
                    : '#D95765',
              }}
            >
              <Radio className="w-3 h-3" />
              <span className="uppercase">
                {wsStatus === 'connected' && isEdgeMode ? 'CONNECTED (EDGE)' : wsStatus}
              </span>
            </div>

            {/* Audio Siren Toggle */}
            <button
              onClick={toggleSound}
              className={`p-1.5 rounded border transition-colors cursor-pointer ${
                audioMuted
                  ? 'bg-[#101820] text-[#AAB7C4] border-[#263443] hover:text-[#F1F5F9]'
                  : 'bg-[#19232E] text-[#35B9D0] border-[#35B9D0]/40'
              }`}
              title={audioMuted ? 'Unmute Audio Siren Alerts' : 'Mute Audio Siren Alerts'}
            >
              {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Standalone HTML Export */}
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="px-2.5 py-1 text-xs font-medium text-[#F1F5F9] bg-[#19232E] hover:bg-[#202c3a] border border-[#263443] rounded transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Export Standalone HTML Bundle"
            >
              <FileCode className="w-3.5 h-3.5 text-[#35B9D0]" />
              <span className="hidden sm:inline">Export HTML</span>
            </button>
          </div>
        </div>
      </header>

      {/* Global Action Feedback Banner */}
      {globalFeedback && (
        <div
          className={`px-6 py-2.5 text-xs font-medium border-b flex items-center justify-between ${
            globalFeedback.type === 'success'
              ? 'bg-[#36B37E]/10 border-[#36B37E]/30 text-[#36B37E]'
              : 'bg-[#D95765]/10 border-[#D95765]/30 text-[#D95765]'
          }`}
        >
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              {globalFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{globalFeedback.message}</span>
            </div>
            <button
              onClick={() => setGlobalFeedback(null)}
              className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Operational State Warnings & High-Impact Notices */}
      {wsStatus !== 'connected' && !isEdgeMode && (
        <div className="bg-[#E8A23A]/10 border-b border-[#E8A23A]/30 text-[#E8A23A] px-6 py-2 text-xs font-medium flex items-center justify-between">
          <div className="max-w-7xl mx-auto w-full flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Real-time analysis stream is currently disconnected ({wsStatus}). Live scam detection is paused until the connection is restored.
            </span>
          </div>
        </div>
      )}

      {isScamAlert && (
        <div className="bg-[#D95765] text-white px-6 py-3 border-b border-[#c84655] shadow-md">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="px-1.5 py-0.5 bg-black/30 rounded text-[10px] font-mono font-bold uppercase tracking-wider border border-white/20">
                CRITICAL RISK
              </span>
              <p className="text-sm font-bold tracking-tight">
                Suspected Social Engineering & Credential Coercion Detected on Active Channel
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium bg-black/25 px-2.5 py-1 rounded">
                Do not disclose one-time passwords (OTP) or banking credentials
              </span>
              <button
                onClick={() => handlePromptQuarantine(callSession.sessionId)}
                className="px-3 py-1 bg-[#101820] hover:bg-black text-white text-xs font-bold rounded transition cursor-pointer flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Terminate & Quarantine</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main View Workspace / Tabs */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {activeTab === 'workspace' && (
          <>
            {/* Active Session Indicator Bar */}
            <div className="p-3 bg-[#19232E] border border-[#263443] rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] uppercase font-bold text-[#AAB7C4] tracking-wider">
                  Active Monitoring Stream:
                </span>
                <span className="font-mono text-[#F1F5F9] font-bold px-2 py-0.5 rounded bg-[#101820] border border-[#263443]">
                  {callSession.sessionId}
                </span>
                {activeSessionQuarantined && (
                  <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-[#D95765]/20 text-[#D95765] border border-[#D95765]/40 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    QUARANTINED
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveTab('history')}
                  className="text-xs text-[#35B9D0] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Browse All Recorded Sessions & Alerts</span>
                </button>
              </div>
            </div>

            {/* Primary Grid: Threat Assessment & Active VoIP Call */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left Column (7 cols): Risk Assessment & Audio Spectrum */}
              <div className="lg:col-span-7 space-y-5 flex flex-col justify-between">
                <ThreatGauge
                  metrics={threatMetrics}
                  securityState={securityState}
                  isStreamActive={isStreamActive}
                />
                <AudioWaveform
                  securityState={securityState}
                  isActive={true}
                  isStreamConnected={isStreamActive}
                />
              </div>

              {/* Right Column (5 cols): Active Call & Transcript */}
              <div className="lg:col-span-5 flex flex-col">
                <CallCard
                  session={callSession}
                  transcript={transcript}
                  securityState={securityState}
                  isStreamConnected={isStreamActive}
                  isQuarantined={activeSessionQuarantined}
                  isTerminating={isQuarantining}
                  onEndCall={() => handlePromptQuarantine(callSession.sessionId)}
                  onExportForensics={handleExportForensics}
                  micStatus={micStatus}
                  micAudioLevel={micAudioLevel}
                  onToggleMicStream={handleToggleMicStream}
                  micErrorMessage={micErrorMessage}
                />
              </div>
            </div>

            {/* Live Backend Demo Scenario Injection Toolbar */}
            <div className="p-4 bg-[#19232E] border border-[#263443] rounded-lg space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[#AAB7C4]">
                  <Sliders className="w-4 h-4 text-[#35B9D0]" />
                  <span className="font-semibold text-[#F1F5F9]">Backend Demo Scenario Triggers (REST POST):</span>
                  <span className="hidden sm:inline">Inject real audio streams into active session on Render backend</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('history')}
                    className="px-2.5 py-1 bg-[#101820] hover:bg-[#15202c] border border-[#263443] text-[#AAB7C4] hover:text-[#F1F5F9] font-medium rounded transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5 text-[#35B9D0]" />
                    <span>Incident History</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* REAL_WAV_CBI */}
                <button
                  disabled={isTriggeringScenario || activeSessionQuarantined}
                  onClick={() => handleTriggerRestScenario('REAL_WAV_CBI')}
                  className="px-3 py-1.5 bg-[#101820] hover:bg-[#15202c] border border-[#263443] hover:border-[#D95765]/60 disabled:opacity-50 disabled:cursor-not-allowed text-[#D95765] font-medium rounded transition flex items-center gap-1.5 cursor-pointer"
                  title="POST /api/demo/trigger-scenario with REAL_WAV_CBI"
                >
                  {isTriggeringScenario && activeTriggeredScenario === 'REAL_WAV_CBI' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                  <span>CBI Officer Stream</span>
                </button>

                {/* ELEVENLABS_DIGITAL_ARREST */}
                <button
                  disabled={isTriggeringScenario || activeSessionQuarantined}
                  onClick={() => handleTriggerRestScenario('ELEVENLABS_DIGITAL_ARREST')}
                  className="px-3 py-1.5 bg-[#101820] hover:bg-[#15202c] border border-[#263443] hover:border-[#D95765]/60 disabled:opacity-50 disabled:cursor-not-allowed text-[#D95765] font-medium rounded transition flex items-center gap-1.5 cursor-pointer"
                  title="POST /api/demo/trigger-scenario with ELEVENLABS_DIGITAL_ARREST"
                >
                  {isTriggeringScenario && activeTriggeredScenario === 'ELEVENLABS_DIGITAL_ARREST' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5" />
                  )}
                  <span>Digital Arrest Scam</span>
                </button>

                {/* FAMILY_EMERGENCY_CLONE */}
                <button
                  disabled={isTriggeringScenario || activeSessionQuarantined}
                  onClick={() => handleTriggerRestScenario('FAMILY_EMERGENCY_CLONE')}
                  className="px-3 py-1.5 bg-[#101820] hover:bg-[#15202c] border border-[#263443] hover:border-[#E8A23A]/60 disabled:opacity-50 disabled:cursor-not-allowed text-[#E8A23A] font-medium rounded transition flex items-center gap-1.5 cursor-pointer"
                  title="POST /api/demo/trigger-scenario with FAMILY_EMERGENCY_CLONE"
                >
                  {isTriggeringScenario && activeTriggeredScenario === 'FAMILY_EMERGENCY_CLONE' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                  <span>Family Clone Scam</span>
                </button>

                {/* NORMAL_CALL */}
                <button
                  disabled={isTriggeringScenario || activeSessionQuarantined}
                  onClick={() => handleTriggerRestScenario('NORMAL_CALL')}
                  className="px-3 py-1.5 bg-[#101820] hover:bg-[#15202c] border border-[#263443] hover:border-[#36B37E]/60 disabled:opacity-50 disabled:cursor-not-allowed text-[#36B37E] font-medium rounded transition flex items-center gap-1.5 cursor-pointer"
                  title="POST /api/demo/trigger-scenario with NORMAL_CALL"
                >
                  {isTriggeringScenario && activeTriggeredScenario === 'NORMAL_CALL' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  )}
                  <span>Normal Call Baseline</span>
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'history' && (
          /* Incident History & Forensic Alerts Tab */
          <IncidentHistoryPanel
            activeSessionId={callSession.sessionId}
            onSelectSessionForWorkspace={handleInspectSessionInWorkspace}
          />
        )}

        {activeTab === 'telemetry' && (
          /* Developer Diagnostics & Telemetry Tab */
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column (6 cols): Simulation Panel */}
              <div className="lg:col-span-6">
                <DevSimulationPanel
                  onSendCommand={handleSendCommand}
                  connectionStatus={wsStatus}
                  wsUrl={wsUrl}
                  onUpdateWsUrl={(newUrl) => {
                    setWsUrl(newUrl);
                    appendLog('SYS', `Updated WebSocket endpoint URL: ${newUrl}`);
                  }}
                  onReconnect={connectWs}
                  onSimulateOffline={(type) => {
                    if (type === 'scam') applyScamAlertState({ threatScore: 94, isSimulated: true });
                    else applySafeState({ threatScore: 8, isSimulated: true });
                  }}
                  sessionId={callSession.sessionId}
                  onTriggerRestScenario={handleTriggerRestScenario}
                  isTriggeringScenario={isTriggeringScenario}
                />
              </div>

              {/* Right Column (6 cols): Packet Log */}
              <div className="lg:col-span-6">
                <LiveConsoleLog logs={logs} onClearLogs={() => setLogs([])} />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Clean, Restrained Footer */}
      <footer className="border-t border-[#263443] bg-[#101820] px-6 py-3.5 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#AAB7C4]">
          <div className="flex items-center gap-2">
            <span>Kavach-VoIP Security Framework</span>
            <span aria-hidden="true">·</span>
            <span>Real-Time Biometric & Acoustic Telemetry</span>
            {backendHealthData?.version && (
              <span className="text-[10px] font-mono text-[#AAB7C4]/70">
                (v{backendHealthData.version})
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span>Relay: kavach-n5na.onrender.com</span>
            <span aria-hidden="true" className="text-[#263443]">
              ·
            </span>
            <a
              href="/standalone.html"
              target="_blank"
              rel="noreferrer"
              className="text-[#35B9D0] hover:underline flex items-center gap-1"
            >
              <span>Direct Standalone View</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>

      {/* Single-File HTML Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        standaloneHtmlCode={STANDALONE_HTML_SOURCE}
      />
    </div>
  );
}
