import {
  BackendHealthResponse,
  BackendSessionRecord,
  SessionAlertsResponse,
  QuarantineResponse,
  DemoScenarioType,
  TriggerScenarioResponse,
} from '../types';

export const BACKEND_CONFIG = {
  REST_BASE_URL: 'https://kavach-n5na.onrender.com',
  HEALTH_URL: 'https://kavach-n5na.onrender.com/health',
  SESSIONS_URL: 'https://kavach-n5na.onrender.com/api/sessions',
  SESSION_ALERTS_URL: (sessionId: string) =>
    `https://kavach-n5na.onrender.com/api/sessions/${encodeURIComponent(sessionId)}/alerts`,
  QUARANTINE_URL: (sessionId: string) =>
    `https://kavach-n5na.onrender.com/api/sessions/${encodeURIComponent(sessionId)}/quarantine`,
  DEMO_TRIGGER_SCENARIO_URL: 'https://kavach-n5na.onrender.com/api/demo/trigger-scenario',
  API_DOCS_URL: 'https://kavach-n5na.onrender.com/docs',
  DEFAULT_WS_URL: 'wss://kavach-n5na.onrender.com/ws/call-stream/demo-session-1',
  WS_URL_FOR_SESSION: (sessionId: string) =>
    `wss://kavach-n5na.onrender.com/ws/call-stream/${encodeURIComponent(sessionId)}`,
} as const;

export interface HealthCheckResult {
  ok: boolean;
  latencyMs: number;
  data?: BackendHealthResponse;
  error?: string;
}

/**
 * Fetch health status from GET /health
 * Validates response.ok and parses health data
 */
export async function checkBackendHealth(targetUrl: string = BACKEND_CONFIG.HEALTH_URL): Promise<HealthCheckResult> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);
    const latency = Math.round(performance.now() - start);

    if (!res.ok) {
      return {
        ok: false,
        latencyMs: latency,
        error: `HTTP ${res.status} ${res.statusText}`,
      };
    }

    const data: BackendHealthResponse = await res.json();
    return {
      ok: data.status === 'ok' || res.status === 200,
      latencyMs: latency,
      data,
    };
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    return {
      ok: false,
      latencyMs: latency,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Fetch incident sessions history from GET /api/sessions
 * Returns parsed sessions array
 */
export async function fetchIncidentSessions(): Promise<{ sessions: BackendSessionRecord[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(BACKEND_CONFIG.SESSIONS_URL, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Failed to fetch incident sessions: HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.sessions)) {
      throw new Error('Invalid sessions payload received from server');
    }

    return { sessions: data.sessions };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Fetch session alerts and firewall actions from GET /api/sessions/{session_id}/alerts
 */
export async function fetchSessionAlerts(sessionId: string): Promise<SessionAlertsResponse> {
  if (!sessionId || !sessionId.trim()) {
    throw new Error('Session ID is required to fetch alerts');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(BACKEND_CONFIG.SESSION_ALERTS_URL(sessionId.trim()), {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Failed to fetch alerts for session "${sessionId}": HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return {
      session: data.session || null,
      alerts: Array.isArray(data.alerts) ? data.alerts : [],
      firewall_actions: Array.isArray(data.firewall_actions) ? data.firewall_actions : [],
    };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Trigger manual quarantine for a session via POST /api/sessions/{session_id}/quarantine
 */
export async function quarantineSession(sessionId: string): Promise<QuarantineResponse> {
  if (!sessionId || !sessionId.trim()) {
    throw new Error('Session ID is required to quarantine call');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(BACKEND_CONFIG.QUARANTINE_URL(sessionId.trim()), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      let errMsg = `Quarantine failed: HTTP ${res.status} ${res.statusText}`;
      try {
        const errorData = await res.json();
        if (errorData?.detail || errorData?.error) {
          errMsg = errorData.detail || errorData.error;
        }
      } catch {
        // ignore json parse failure
      }
      throw new Error(errMsg);
    }

    const data: QuarantineResponse = await res.json();
    return data;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Trigger a demo scenario on backend via POST /api/demo/trigger-scenario
 * Body: { "session_id": string, "scenario": DemoScenarioType }
 */
export async function triggerDemoScenario(
  sessionId: string,
  scenario: DemoScenarioType
): Promise<TriggerScenarioResponse> {
  if (!sessionId || !sessionId.trim()) {
    throw new Error('Session ID is required to trigger a demo scenario');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(BACKEND_CONFIG.DEMO_TRIGGER_SCENARIO_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId.trim(),
        scenario,
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      let errMsg = `Failed to trigger scenario: HTTP ${res.status} ${res.statusText}`;
      try {
        const errorData = await res.json();
        if (errorData?.detail) {
          errMsg = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
        } else if (errorData?.error) {
          errMsg = errorData.error;
        }
      } catch {
        // ignore json parse error
      }
      throw new Error(errMsg);
    }

    const data: TriggerScenarioResponse = await res.json();
    data.http_status = res.status;
    return data;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}
