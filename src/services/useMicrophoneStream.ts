import { useState, useRef, useCallback, useEffect } from 'react';

export type MicStreamStatus =
  | 'inactive'
  | 'requesting'
  | 'streaming'
  | 'muted'
  | 'denied'
  | 'error';

interface UseMicrophoneStreamReturn {
  status: MicStreamStatus;
  errorMessage: string | null;
  audioLevel: number; // 0 - 100
  bytesSent: number;
  startStreaming: (ws: WebSocket | null) => Promise<boolean>;
  stopStreaming: () => void;
  toggleMute: () => void;
  isMuted: boolean;
}

/**
 * Resample Float32 buffer to 16000 Hz
 */
function downsampleTo16k(buffer: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === 16000) return buffer;
  const ratio = sampleRate / 16000;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

/**
 * Convert Float32Array to 16-bit PCM (little-endian)
 */
function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export function useMicrophoneStream(): UseMicrophoneStreamReturn {
  const [status, setStatus] = useState<MicStreamStatus>('inactive');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [bytesSent, setBytesSent] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isMutedRef = useRef(false);
  const pcmBufferAccumulatorRef = useRef<Int16Array[]>([]);
  const accumulatedSamplesRef = useRef(0);

  // Sync ref with state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const stopStreaming = useCallback(() => {
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // ignore
      }
      sourceRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }

    pcmBufferAccumulatorRef.current = [];
    accumulatedSamplesRef.current = 0;
    setStatus('inactive');
    setAudioLevel(0);
  }, []);

  const startStreaming = useCallback(
    async (ws: WebSocket | null): Promise<boolean> => {
      stopStreaming();
      setErrorMessage(null);
      setBytesSent(0);

      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setStatus('error');
        setErrorMessage('Cannot stream microphone: WebSocket is not connected.');
        return false;
      }

      wsRef.current = ws;
      setStatus('requesting');

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Web Audio mediaDevices API is not supported in this environment.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        streamRef.current = stream;

        // Create Web Audio context
        const AudioContextClass =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;

        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }

        const source = audioCtx.createMediaStreamSource(stream);
        sourceRef.current = source;

        // Process audio in chunks of 4096 samples
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        const CHUNK_SAMPLE_TARGET = 8000; // 0.5s at 16000 Hz = 8000 samples = 16000 bytes

        processor.onaudioprocess = (e) => {
          if (isMutedRef.current) {
            setAudioLevel(0);
            return;
          }

          const inputData = e.inputBuffer.getChannelData(0);

          // Calculate RMS level for visual meter
          let sumSquares = 0;
          for (let i = 0; i < inputData.length; i++) {
            sumSquares += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sumSquares / inputData.length);
          const level = Math.min(100, Math.round(rms * 250));
          setAudioLevel(level);

          // Downsample input from native sampleRate to 16000 Hz
          const downsampled = downsampleTo16k(inputData, audioCtx.sampleRate);
          const pcmBuffer = floatTo16BitPCM(downsampled);
          const int16Array = new Int16Array(pcmBuffer);

          pcmBufferAccumulatorRef.current.push(int16Array);
          accumulatedSamplesRef.current += int16Array.length;

          // Dispatch 16 kHz 16-bit mono PCM bytes when >= 0.5s buffer accumulated
          if (accumulatedSamplesRef.current >= CHUNK_SAMPLE_TARGET) {
            const totalSamples = accumulatedSamplesRef.current;
            const merged = new Int16Array(totalSamples);
            let offset = 0;
            for (const chunk of pcmBufferAccumulatorRef.current) {
              merged.set(chunk, offset);
              offset += chunk.length;
            }

            // Reset accumulator
            pcmBufferAccumulatorRef.current = [];
            accumulatedSamplesRef.current = 0;

            // Transmit raw PCM ArrayBuffer to WebSocket
            const currentWs = wsRef.current;
            if (currentWs && currentWs.readyState === WebSocket.OPEN) {
              try {
                currentWs.send(merged.buffer);
                setBytesSent((prev) => prev + merged.byteLength);
              } catch (err) {
                console.warn('Failed to send PCM audio chunk over WebSocket:', err);
              }
            }
          }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);

        setStatus('streaming');
        return true;
      } catch (err: unknown) {
        stopStreaming();
        const msg =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Microphone permission was denied by browser.'
            : err instanceof Error
            ? err.message
            : 'Failed to access microphone';

        setStatus(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'error');
        setErrorMessage(msg);
        return false;
      }
    },
    [stopStreaming]
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, [stopStreaming]);

  return {
    status,
    errorMessage,
    audioLevel,
    bytesSent,
    startStreaming,
    stopStreaming,
    toggleMute,
    isMuted,
  };
}
