export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
export type BackendHealthStatus = 'online' | 'offline' | 'checking';
export type SecurityState = 'safe' | 'scam' | 'analyzing' | 'unverified';

export interface ThreatMetrics {
  threatScore: number; // 0 - 100
  urgencyLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  urgencyDetail?: string;
  voiceStress: number; // 0 - 100
  voiceStressDetail?: string;
  syntheticVoiceProb: number; // 0 - 100
  syntheticVoiceDetail?: string;
  reputationScore: 'High Trust' | 'Neutral' | 'Suspicious' | 'Blacklisted' | 'High Risk (VoIP Spoof)';
  reputationDetail?: string;
  flaggedKeywords: string[];
  detectedIntent?: string;
  recommendedAction: string;
  explanation?: string;
  isSimulated?: boolean;
}

export interface CallSession {
  sessionId: string;
  callerNumber: string;
  callerName: string;
  gateway: string;
  protocol: string;
  durationSeconds: number;
  codec: string;
  jitterMs: number;
  packetLossPercent: number;
}

export interface TranscriptSnippet {
  id: string;
  speaker: 'Caller' | 'Receiver';
  timestamp: string;
  text: string;
  isFlagged?: boolean;
  flagged?: boolean;
}

export interface WsLogEntry {
  id: string;
  timestamp: string;
  direction: 'IN' | 'OUT' | 'SYS';
  raw: string;
  parsed?: Record<string, unknown> | null;
  isAlert?: boolean;
}

export interface BackendSessionRecord {
  id: string;
  session_id: string;
  caller_number: string;
  started_at: string;
  ended_at: string | null;
  peak_risk_score: number;
  final_verdict: string;
  call_status: string;
}

export interface BackendAlertRecord {
  id: string;
  session_id: string;
  chunk_id: number;
  synthetic_probability: number;
  coercion_score: number;
  overall_score: number;
  transcript_snippet: string;
  scam_category: string;
  vocoder_signature: string;
  created_at: string;
}

export interface BackendFirewallAction {
  id: string;
  session_id: string;
  action_taken: string;
  rule_payload: string;
  triggered_at: string;
}

export interface SessionAlertsResponse {
  session: BackendSessionRecord | null;
  alerts: BackendAlertRecord[];
  firewall_actions: BackendFirewallAction[];
}

export interface BackendHealthResponse {
  status: string;
  service: string;
  version: string;
  active_sessions?: number;
  db_mode?: string;
  ml_mode?: string;
  weights_loaded?: boolean;
  whisper_enabled?: boolean;
  warmup_latency_ms?: number;
}

export interface QuarantineResponse {
  status: string;
  session_id: string;
  action: string;
  error?: string;
}

export type DemoScenarioType =
  | 'REAL_WAV_CBI'
  | 'ELEVENLABS_DIGITAL_ARREST'
  | 'FAMILY_EMERGENCY_CLONE'
  | 'NORMAL_CALL';

export type WsScenarioCommand =
  | 'PLAY_REAL_WAV'
  | 'SCENARIO_DIGITAL_ARREST'
  | 'SCENARIO_FAMILY_CLONE'
  | 'SCENARIO_NORMAL';

export interface TriggerScenarioResponse {
  status: string;
  session_id: string;
  scenario?: string;
  playing_real_wav?: boolean;
  details?: string;
  error?: string;
  active_sessions?: string[];
  http_status?: number;
}

export type ScenarioLifecycleStatus = 'idle' | 'starting' | 'running' | 'completed' | 'failed';

export const SCENARIO_TO_WS_COMMAND: Record<DemoScenarioType, WsScenarioCommand> = {
  REAL_WAV_CBI: 'PLAY_REAL_WAV',
  ELEVENLABS_DIGITAL_ARREST: 'SCENARIO_DIGITAL_ARREST',
  FAMILY_EMERGENCY_CLONE: 'SCENARIO_FAMILY_CLONE',
  NORMAL_CALL: 'SCENARIO_NORMAL',
};

