"""
benchmark_latency.py
Lightweight test runner to benchmark end-to-end inference latency on a dummy 2.0s (32,000 float32) array.
Guarantees inference stays strictly under the 350ms budget for real-time call firewall operation.
"""
import os
import time
import librosa
import numpy as np
from vishing_detector import VishingDetector

LATENCY_BUDGET_MS = 350.0
NUM_ITERATIONS = 10
SAMPLE_RATE = 16000
WINDOW_DURATION_S = 2.0
WINDOW_SAMPLES = int(SAMPLE_RATE * WINDOW_DURATION_S)  # 32,000 samples


def benchmark_audio_input(detector: VishingDetector, audio_chunk: np.ndarray, label: str):
    print(f"\n>>> Benchmarking [{label}] ({len(audio_chunk)} float32 samples, {NUM_ITERATIONS} iterations)...")

    dsp_times, clf_times, asr_times, sem_times, total_times = [], [], [], [], []
    last_acoustic, last_semantic = None, None

    for i in range(NUM_ITERATIONS):
        t_start = time.perf_counter()

        # 1. Feature extraction
        t0 = time.perf_counter()
        feat_vec, dsp = detector.extract_features(audio_chunk)
        t_dsp = (time.perf_counter() - t0) * 1000.0

        # 2. Classifier inference
        t0 = time.perf_counter()
        prob = float(detector.clf.predict_proba([feat_vec])[0][1]) if detector.clf else 0.5
        t_clf = (time.perf_counter() - t0) * 1000.0

        # 3. Whisper transcription
        t0 = time.perf_counter()
        transcript = detector.transcribe(audio_chunk)
        t_asr = (time.perf_counter() - t0) * 1000.0

        # 4. Semantic coercion scoring
        t0 = time.perf_counter()
        semantic = detector.score_semantics(transcript)
        t_sem = (time.perf_counter() - t0) * 1000.0

        t_total = (time.perf_counter() - t_start) * 1000.0

        dsp_times.append(t_dsp)
        clf_times.append(t_clf)
        asr_times.append(t_asr)
        sem_times.append(t_sem)
        total_times.append(t_total)

        if i == 0:
            last_acoustic = {
                "deepfake_probability": round(prob, 2),
                "spectral_flatness_score": round(min(1.0, dsp["flatness"] * 10), 2),
                "high_freq_cutoff_hz": dsp["rolloff_hz"],
                "micro_tremor_present": bool(dsp["jitter"] >= 0.018),
                "detection_engine": "Trained-Model" if detector.clf else "Heuristic"
            }
            last_semantic = semantic

    avg_dsp = np.mean(dsp_times)
    avg_clf = np.mean(clf_times)
    avg_asr = np.mean(asr_times)
    avg_sem = np.mean(sem_times)
    avg_total = np.mean(total_times)
    p50_total = np.median(total_times)
    p95_total = np.percentile(total_times, 95)
    min_total = np.min(total_times)
    max_total = np.max(total_times)

    print("-" * 65)
    print("STAGE BREAKDOWN (Average over iterations):")
    print(f"  1. Acoustic DSP Biomarkers (83-dim) : {avg_dsp:6.2f} ms")
    print(f"  2. Deepfake ML Classifier (LightGBM): {avg_clf:6.2f} ms")
    print(f"  3. Faster-Whisper ASR (tiny.en int8): {avg_asr:6.2f} ms")
    print(f"  4. Semantic Coercion Taxonomy Match : {avg_sem:6.2f} ms")
    print("-" * 65)
    print("LATENCY STATISTICS:")
    print(f"  Mean Latency       : {avg_total:6.2f} ms")
    print(f"  Median (p50)       : {p50_total:6.2f} ms")
    print(f"  95th Percentile    : {p95_total:6.2f} ms")
    print(f"  Min / Max          : {min_total:6.2f} ms / {max_total:6.2f} ms")
    print(f"  Latency Budget     : {LATENCY_BUDGET_MS:6.2f} ms")
    print("-" * 65)

    passed = p95_total < LATENCY_BUDGET_MS
    status_label = "PASSED [STRICTLY UNDER 350ms BUDGET]" if passed else "FAILED [EXCEEDED 350ms BUDGET]"
    print(f"BENCHMARK STATUS: {status_label}")
    print(f"Sample Output -> Transcript: '{last_semantic['transcript_chunk']}'")
    print(f"                Acoustic: {last_acoustic}")
    print(f"                Semantic: {last_semantic}")
    return passed, p95_total


def run_benchmark():
    print("=" * 65)
    print("  REAL-TIME INFERENCE ENGINE LATENCY BENCHMARK (350ms BUDGET)")
    print("=" * 65)
    print(f"Target Budget: < {LATENCY_BUDGET_MS:.1f} ms per 2.0s chunk")

    print("\n[1/3] Initializing VishingDetector (LightGBM + Faster-Whisper int8 CPU)...")
    init_start = time.perf_counter()
    detector = VishingDetector(model_path="deepfake_audio.pkl", use_whisper=True)
    init_time_s = time.perf_counter() - init_start
    print(f"  Initialized in {init_time_s:.2f}s.")

    # 1. Warm-up
    print("\n[2/3] Performing warmup cycle...")
    warmup_chunk = np.zeros(WINDOW_SAMPLES, dtype=np.float32)
    _ = detector.analyze_window(warmup_chunk)
    print("  Warmup completed.")

    # 2. Benchmark dummy 2.0s float32 array
    print("\n[3/3] Running latency evaluations...")
    dummy_chunk = np.random.uniform(-0.15, 0.15, WINDOW_SAMPLES).astype(np.float32)
    dummy_passed, dummy_p95 = benchmark_audio_input(detector, dummy_chunk, "Dummy 2.0s Float32 Array")

    # 3. Benchmark real speech chunk if available
    sample_wav = "audio_samples/02_cbi_digital_arrest.wav"
    if os.path.exists(sample_wav):
        y, _ = librosa.load(sample_wav, sr=SAMPLE_RATE, mono=True)
        voiced_chunk = y[16000:16000 + WINDOW_SAMPLES] if len(y) >= 16000 + WINDOW_SAMPLES else y[:WINDOW_SAMPLES]
        speech_passed, speech_p95 = benchmark_audio_input(detector, voiced_chunk, "Real Voiced Speech Chunk")
    else:
        speech_passed, speech_p95 = True, 0.0

    print("\n" + "=" * 65)
    overall_passed = dummy_passed and speech_passed
    if overall_passed:
        print("FINAL VERDICT: ALL BENCHMARKS PASSED UNDER 350ms BUDGET!")
    else:
        print("FINAL VERDICT: ONE OR MORE BENCHMARKS EXCEEDED 350ms BUDGET!")
    print("=" * 65)

    if not overall_passed:
        raise RuntimeError(f"Latency benchmark exceeded {LATENCY_BUDGET_MS}ms budget.")
    return True


if __name__ == "__main__":
    run_benchmark()