"""
Kavach-VoIP — End-to-End WebSocket & REST Integration Test.

Tests:
  1. GET /health
  2. POST /api/demo/seed & GET /api/sessions
  3. GET /api/sessions/{session_id}/alerts
  4. Live WebSocket stream:
     - Normal scenario frame reception
     - Scenario injection (ELEVENLABS_DIGITAL_ARREST escalation)
     - Binary PCM-16 audio streaming through real ML engine
     - SOC Quarantine killswitch pushing CALL_TERMINATED
  5. Audio file streaming via stream_wav_file_to_session
"""

import asyncio
import json
import os
import time
import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from main import app
from demo_replay import stream_wav_file_to_session


def run_e2e_tests():
    print("=" * 65)
    print("Kavach-VoIP Phase 5: End-to-End System & WebSocket Verification")
    print("=" * 65)

    with TestClient(app) as client:
        # ── 1. Health Endpoint ────────────────────────────────────────────────
        print("\n[1] Checking GET /health ...")
        health = client.get("/health").json()
        print("    Response:", json.dumps(health, indent=2))
        assert health["status"] == "ok"
        assert health["version"] == "0.5.0"
        assert "ml_mode" in health
        print("    [PASS] Health check verified.")

        # ── 2. Demo Seeder & Sessions List ────────────────────────────────────
        print("\n[2] Triggering POST /api/demo/seed ...")
        seed_resp = client.post("/api/demo/seed").json()
        print("    Seed response:", json.dumps(seed_resp, indent=2))
        assert seed_resp["status"] == "success"
        assert seed_resp["seeded_sessions"] == 4

        print("    Fetching GET /api/sessions ...")
        sessions_resp = client.get("/api/sessions").json()
        sessions = sessions_resp["sessions"]
        session_ids = [s["session_id"] for s in sessions]
        print(f"    Found {len(sessions)} sessions: {session_ids}")
        assert "call-da-98201" in session_ids
        assert "call-otp-88002" in session_ids
        assert "call-safe-94480" in session_ids
        assert "call-clone-70112" in session_ids
        print("    [PASS] Seeded sessions verified in database.")

        # ── 3. Session Alerts & Quarantine Details ────────────────────────────
        print("\n[3] Checking GET /api/sessions/call-da-98201/alerts ...")
        da_details = client.get("/api/sessions/call-da-98201/alerts").json()
        print(f"    Session Verdict: {da_details['session']['final_verdict']}")
        print(f"    Alerts count: {len(da_details['alerts'])}")
        print(f"    Firewall Actions count: {len(da_details['firewall_actions'])}")
        assert len(da_details["alerts"]) >= 2
        assert len(da_details["firewall_actions"]) >= 1
        print("    [PASS] Session detail & alerts verified.")

        # ── 4. Live WebSocket Stream ──────────────────────────────────────────
        print("\n[4] Connecting to WebSocket /ws/call-stream/e2e-live-test ...")
        test_session_id = "e2e-live-test"

        with client.websocket_connect(f"/ws/call-stream/{test_session_id}") as ws:
            # a) Receive initial default normal frame
            frame1_raw = ws.receive_text()
            frame1 = json.loads(frame1_raw)
            print(f"    Initial frame received (Chunk {frame1['chunk_id']}):")
            print(f"      Risk Level: {frame1['composite_risk']['risk_level']}")
            print(f"      Transcript: {frame1['semantic_metrics']['transcript_delta']}")
            assert frame1["composite_risk"]["risk_level"] == "SAFE"

            # b) Trigger Scenario Injection via Text Command
            print("\n    Injecting SCENARIO_DIGITAL_ARREST command...")
            ws.send_text(json.dumps({"command": "SCENARIO_DIGITAL_ARREST"}))

            # Receive escalated frames
            escalated = False
            for _ in range(5):
                f_raw = ws.receive_text()
                f = json.loads(f_raw)
                print(f"      Frame {f['chunk_id']}: Score={f['composite_risk']['overall_score']} Level={f['composite_risk']['risk_level']} Vocoder={f['acoustic_metrics']['vocoder_signature']}")
                if f["composite_risk"]["risk_level"] in ("HIGH", "CRITICAL"):
                    escalated = True
                    break

            assert escalated, "Expected risk escalation after SCENARIO_DIGITAL_ARREST!"
            print("    [PASS] Threat scenario successfully escalated risk score.")

            # c) Stream Raw Binary PCM-16 Audio Frame
            print("\n    Streaming 2 seconds of 16kHz audio PCM bytes (32,000 samples)...")
            sr = 16000
            t = np.linspace(0, 2.0, 32000, endpoint=False)
            tone = (0.5 * np.sin(2 * np.pi * 440 * t) * 32767).astype(np.int16).tobytes()

            # Send in 0.5s chunks
            chunk_len = len(tone) // 4
            for i in range(4):
                ws.send_bytes(tone[i * chunk_len : (i + 1) * chunk_len])

            audio_analyzed = False
            for _ in range(4):
                f_raw = ws.receive_text()
                f = json.loads(f_raw)
                if "processing_latency_ms" in f and f["processing_latency_ms"] > 0:
                    print(f"      Audio inference frame (Chunk {f['chunk_id']}): Latency={f['processing_latency_ms']}ms Synth={f['acoustic_metrics']['synthetic_probability']}")
                    audio_analyzed = True
                    break

            assert audio_analyzed, "Expected frame from real ML audio inference!"
            print("    [PASS] Binary PCM-16 audio analyzed by ML engine.")

            # d) Test SOC Quarantine Push Over WebSocket
            print("\n    Triggering SOC Killswitch POST /api/sessions/e2e-live-test/quarantine ...")
            q_resp = client.post(f"/api/sessions/{test_session_id}/quarantine").json()
            print(f"    Quarantine HTTP response: {q_resp}")
            assert q_resp["status"] == "quarantined"

            # Check WebSocket receives CALL_TERMINATED event
            term_msg_raw = ws.receive_text()
            term_msg = json.loads(term_msg_raw)
            print(f"    WebSocket received event: {term_msg}")
            assert term_msg.get("event") == "CALL_TERMINATED"
            assert term_msg.get("action") == "QUARANTINED_BY_SOC"
            print("    [PASS] SOC quarantine killswitch pushed event and closed stream.")

        # ── 5. Test Audio File Streamer (stream_wav_file_to_session) ──────────
        print("\n[5] Testing stream_wav_file_to_session on synthetic .wav ...")
        temp_wav = "test_calibration.wav"
        t = np.linspace(0, 2.5, int(16000 * 2.5), endpoint=False)
        sig = (0.3 * np.sin(2 * np.pi * 500 * t)).astype(np.float32)
        sf.write(temp_wav, sig, 16000)

        async def _test_wav_stream():
            frames = []
            async for frame in stream_wav_file_to_session(temp_wav, "wav-test-session", chunk_sec=0.5):
                frames.append(frame)
                if len(frames) >= 1:
                    break
            return frames

        wav_frames = asyncio.run(_test_wav_stream())
        if os.path.exists(temp_wav):
            os.remove(temp_wav)

        assert len(wav_frames) >= 1, "Expected at least 1 frame from wav streaming"
        print(f"    Streamed wav frame: Chunk {wav_frames[0].chunk_id}, Latency={wav_frames[0].processing_latency_ms}ms")
        print("    [PASS] stream_wav_file_to_session successfully sliced and analyzed audio.")

        print("\n" + "=" * 65)
        print(">>> ALL PHASE 5 END-TO-END VERIFICATION CHECKS PASSED! <<<")
        print("=" * 65)


if __name__ == "__main__":
    run_e2e_tests()
