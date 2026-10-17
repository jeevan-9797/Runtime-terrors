"""
Kavach-VoIP — Real-time audio ring buffer for sliding-window inference.

Accepts raw 16-bit little-endian PCM bytes from the WebSocket, normalises them
to ``np.float32`` in [-1.0, 1.0], and yields fixed-size analysis windows using
a stride-based trigger so the detector runs at a predictable cadence regardless
of how the network fragments the audio stream.

Defaults (configurable per-instance):
  • sample_rate          = 16 000 Hz
  • window_duration_sec  =     2.0 s  → 32 000 samples per window
  • stride_duration_sec  =     0.5 s  →  8 000 new samples trigger a window
"""

from __future__ import annotations

from collections import deque
from typing import Optional

import numpy as np


class CallRingBuffer:
    """
    Circular audio buffer that accumulates PCM chunks and emits fixed-size
    analysis windows on a stride boundary.

    Parameters
    ----------
    sample_rate : int
        Expected sample rate of incoming audio (default 16 000 Hz).
    window_duration_sec : float
        Length of each analysis window in seconds (default 2.0 s).
    stride_duration_sec : float
        How many seconds of *new* audio must arrive before the next window
        is emitted (default 0.5 s).
    """

    def __init__(
        self,
        sample_rate: int = 16_000,
        window_duration_sec: float = 2.0,
        stride_duration_sec: float = 0.5,
    ) -> None:
        self.sample_rate = sample_rate
        self.window_size = int(sample_rate * window_duration_sec)   # 32 000
        self.stride_size = int(sample_rate * stride_duration_sec)   #  8 000

        # Internal ring implemented as a bounded deque — old samples fall off
        # the left automatically once we exceed ``window_size``.
        self._buf: deque[float] = deque(maxlen=self.window_size)

        # How many fresh samples have arrived since the last window was popped.
        self._new_samples: int = 0

    # ── public API ────────────────────────────────────────────────────────

    def append_pcm16_bytes(self, raw_bytes: bytes) -> None:
        """
        Ingest raw 16-bit signed little-endian PCM bytes.

        Steps:
          1. Interpret as ``np.int16``.
          2. Normalise to ``np.float32`` in [-1.0, 1.0].
          3. Append each sample to the internal ring deque.

        Parameters
        ----------
        raw_bytes : bytes
            Raw PCM-16 LE audio data.  Length must be a multiple of 2 (one
            ``int16`` = 2 bytes).  Odd trailing bytes are silently truncated.
        """
        if len(raw_bytes) < 2:
            return

        # Truncate to an even byte count so np.frombuffer doesn't raise.
        usable = len(raw_bytes) - (len(raw_bytes) % 2)
        int16_samples = np.frombuffer(raw_bytes[:usable], dtype=np.int16)

        # Normalise: int16 range is [-32768, 32767].
        float32_samples = int16_samples.astype(np.float32) / 32768.0

        self._buf.extend(float32_samples.tolist())
        self._new_samples += len(float32_samples)

    def pop_window_if_ready(self) -> Optional[np.ndarray]:
        """
        Return the current analysis window if enough new audio has arrived.

        Returns
        -------
        np.ndarray | None
            A ``(window_size,)`` ``float32`` array if at least ``stride_size``
            new samples have accumulated **and** the buffer contains a full
            window; otherwise ``None``.
        """
        if self._new_samples < self.stride_size:
            return None
        if len(self._buf) < self.window_size:
            return None

        # Reset the new-sample counter (but keep the ring data for overlap).
        self._new_samples = 0

        return np.array(self._buf, dtype=np.float32)

    # ── diagnostics ───────────────────────────────────────────────────────

    @property
    def buffered_samples(self) -> int:
        """Number of samples currently held in the ring."""
        return len(self._buf)

    @property
    def pending_new_samples(self) -> int:
        """Samples received since the last window was popped."""
        return self._new_samples

    def reset(self) -> None:
        """Flush the buffer and counters (e.g. on call hang-up)."""
        self._buf.clear()
        self._new_samples = 0
