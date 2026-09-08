#!/usr/bin/env python3
"""
jarvis_voice_daemon.py — Porcupine wake-word daemon for Jarvis SIEM.

Listens to the default mic, detects the "jarvis" wake word (built-in
Porcupine keyword), and writes state transitions to two sinks:

  1. voice.log          — parsed by siem_ingest.py -> SQLite -> dashboard API
  2. data/voice_state.json — polled by Flask /ws/voice for real-time updates

Workflow after wake-word detection:
  voice_state=listening  (wake word heard)
  -> capture speech (incl. a short pre-wake buffer) until silence or timeout
  -> transcribe via Google (vosk local / sphinx fallbacks)
  -> voice_state=thinking   (transcribing)
  -> resolve intent via SIEM server; speak the reply via TTS
  -> voice_state=speaking   (reply shown/spoken)
  -> voice_state=idle       (back to listen mode)

Sensitivity, capture timing, and STT tier are env/CLI configurable — see
VOICE_* env vars, --capture-timeout, --sensitivity, --server-url.
TTS output uses voice_tts.py (piper -> espeak-ng -> acknowledgment beep).

Access key resolution order (first match wins):
  1. --access-key (raw key string, or path to file if it exists on disk)
  2. --access-key-file (explicit file path)
  3. PORCUPINE_ACCESS_KEY env var (file path or raw key)

Env vars:
    JACK_SILENT=1       — suppress JACK warnings from PyAudio/Porcupine
    PYTHONUNBUFFERED=1  — ensure logs flush immediately
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import signal
import sys
import time
import wave
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pyaudio
import pvporcupine
import speech_recognition as sr

from siem_voice import resolve_intent
import voice_tts

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
VOICE_LOG = BASE_DIR / "voice" / "voice.log"
STATE_FILE = BASE_DIR / "data" / "voice_state.json"
DATA_DIR = BASE_DIR / "data"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DEFAULT_KEYWORD = "jarvis"
AUDIO_RATE = 16000  # Porcupine expects 16 kHz
LOG = logging.getLogger("jarvis_voice")

# Capture tuning (env-overridable)
SPEECH_RMS = float(os.getenv("VOICE_SPEECH_RMS", "0.02"))   # min RMS to count as speech
END_SILENCE_FRAMES = int(os.getenv("VOICE_END_SILENCE_FRAMES", "25"))  # ~0.8s of silence ends capture
PRE_WAKE_FRAMES = int(os.getenv("VOICE_PRE_WAKE_FRAMES", "15"))  # ring buffer before wake word
VOICE_HEARTBEAT = float(os.getenv("VOICE_HEARTBEAT", "25"))  # seconds between state heartbeats

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def write_state(state: dict) -> None:
    """Write the current voice state to the JSON file Flask polls."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2) + "\n")


def log_voice_event(state: str, text: str = "", source: str = "mic") -> None:
    """Append a voice event line to voice.log."""
    ts = datetime.now(timezone.utc).isoformat()
    line = f"[{ts}] voice_state={state} voice_text={text} voice_source={source}\n"
    try:
        VOICE_LOG.parent.mkdir(parents=True, exist_ok=True)
        with open(VOICE_LOG, "a") as fh:
            fh.write(line)
            fh.flush()
        LOG.info("voice.log: state=%s text=%r source=%s", state, text, source)
    except Exception as exc:
        LOG.error("Failed to write voice.log: %s", exc)


# ---------------------------------------------------------------------------
# Speech recognition
# ---------------------------------------------------------------------------

class Transcriber:
    """Transcribe a WAV blob. Google first, optional local vosk, sphinx fallback.

    Set VOICE_STT_OFFLINE=1 to skip the network tier (privacy/air-gapped runs).
    Set VOICE_STT_ENGINE=vosk (plus VOSK_MODEL=/path/to/model) to enable the
    local speech-to-text tier before the slow sphinx fallback.
    """

    def __init__(self) -> None:
        self._rec = sr.Recognizer()
        self._offline = os.getenv("VOICE_STT_OFFLINE", "0") == "1"
        self._vosk = None
        if os.getenv("VOICE_STT_ENGINE", "").lower() in ("vosk", "local"):
            try:
                from vosk import KaldiRecognizer, Model, SetLogLevel  # type: ignore
                model_path = os.getenv("VOSK_MODEL", "")
                if model_path:
                    SetLogLevel(-1)
                    self._vosk = (Model(model_path), KaldiRecognizer)
                    LOG.info("Vosk local STT enabled (model: %s)", model_path)
                else:
                    LOG.warning("VOICE_STT_ENGINE=vosk but VOSK_MODEL not set; skipping")
            except Exception as exc:
                LOG.warning("Vosk unavailable: %s", exc)

    def _decode_audio(self, audio_frames: list[bytes], sample_rate: int) -> sr.AudioData:
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)  # 16-bit
            wav.setframerate(sample_rate)
            for frame in audio_frames:
                wav.writeframes(frame)
        buf.seek(0)
        with sr.AudioFile(buf) as source:
            return self._rec.record(source)

    def transcribe(self, audio_frames: list[bytes], sample_rate: int) -> str:
        """Convert raw PCM frames to text."""
        audio = self._decode_audio(audio_frames, sample_rate)

        # Tier 1: Google Web Speech (network)
        if not self._offline:
            try:
                text = self._rec.recognize_google(audio)
                LOG.info("STT Google: %r", text)
                return text
            except sr.RequestError as exc:
                LOG.warning("Google STT unavailable: %s - falling back", exc)
            except sr.UnknownValueError:
                LOG.info("STT: audio heard but not understood (Google)")
                return ""

        # Tier 2: local vosk model (offline)
        if self._vosk is not None:
            try:
                model, recognizer_cls = self._vosk
                raw = io.BytesIO()
                with wave.open(raw, "wb") as wav:
                    wav.setnchannels(1)
                    wav.setsampwidth(2)
                    wav.setframerate(sample_rate)
                    for frame in audio_frames:
                        wav.writeframes(frame)
                wav_data = raw.getvalue()
                rec = recognizer_cls(model, sample_rate)
                res = rec.AcceptWaveform(wav_data)
                text = json.loads(rec.Result()).get("text", "")
                if text:
                    LOG.info("STT vosk: %r", text)
                    return text
            except Exception as exc:
                LOG.warning("Vosk STT failed: %s", exc)

        # Tier 3: pocketsphinx (offline fallback)
        try:
            text = self._rec.recognize_sphinx(audio)
            LOG.info("STT sphinx: %r", text)
            return text
        except Exception as exc:
            LOG.warning("sphinx STT failed: %s", exc)
            return ""


# ---------------------------------------------------------------------------
# Silence detection
# ---------------------------------------------------------------------------

def is_silence(frames: list[bytes], threshold: float = 0.01) -> bool:
    """Return True if the RMS of the last few frames is below threshold."""
    if not frames:
        return True
    recent = frames[-10:]
    samples = np.frombuffer(b"".join(recent), dtype=np.int16).astype(np.float32) / 32768.0
    rms = float(np.sqrt(np.mean(samples**2)))
    return rms < threshold


# ---------------------------------------------------------------------------
# Main daemon
# ---------------------------------------------------------------------------

_running = True


def _handle_signal(signum, frame):
    global _running
    LOG.info("Signal %d - shutting down", signum)
    _running = False


def _resolve_access_key(args) -> str | None:
    """Resolve the Porcupine access key from CLI args and env vars."""
    # 1. --access-key (raw key, or file path if it exists on disk)
    key = args.access_key
    if key and os.path.isfile(key):
        try:
            key = Path(key).read_text().strip()
            LOG.info("Loaded access key from file: %s", args.access_key)
        except Exception as exc:
            LOG.error("Failed to read access key file %s: %s", args.access_key, exc)
            key = None

    # 2. --access-key-file (explicit file path)
    if not key and args.access_key_file:
        try:
            key = Path(args.access_key_file).read_text().strip()
            LOG.info("Loaded access key from --access-key-file: %s", args.access_key_file)
        except Exception as exc:
            LOG.error("Failed to read --access-key-file %s: %s", args.access_key_file, exc)

    # 3. PORCUPINE_ACCESS_KEY env var (file path or raw key)
    if not key:
        env_key = os.getenv("PORCUPINE_ACCESS_KEY", "")
        if env_key and os.path.isfile(env_key):
            try:
                key = Path(env_key).read_text().strip()
                LOG.info("Loaded access key from PORCUPINE_ACCESS_KEY file: %s", env_key)
            except Exception as exc:
                LOG.error("Failed to read PORCUPINE_ACCESS_KEY file %s: %s", env_key, exc)
        elif env_key:
            key = env_key

    return key


def main() -> None:
    global _running

    parser = argparse.ArgumentParser(description="Jarvis voice wake-word daemon")
    parser.add_argument("--keyword", default=DEFAULT_KEYWORD,
                        help=f"Porcupine built-in keyword (default: {DEFAULT_KEYWORD})")
    parser.add_argument("--keyword-path", default=None,
                        help="Path to a custom trained keyword .ppn (overrides --keyword)")
    parser.add_argument("--access-key", default=None,
                        help="Picovoice access key string, or path to file containing the key")
    parser.add_argument("--access-key-file", default=None,
                        help="Path to a file containing the Porcupine access key")
    parser.add_argument("--capture-timeout", type=float, default=5.0,
                        help="Seconds of post-wake audio to capture (default: 5.0)")
    parser.add_argument("--sensitivity", type=float, default=0.5,
                        help="Wake-word sensitivity 0.0..1.0 (default: 0.5)")
    parser.add_argument("--server-url", default=os.getenv("VOICE_SERVER_URL", "http://127.0.0.1:8170"),
                        help="SIEM server URL for intent resolution (default: env VOICE_SERVER_URL or local)")
    parser.add_argument("--verbose", action="store_true", help="Debug logging")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    access_key = _resolve_access_key(args)
    if not access_key:
        LOG.error(
            "No Porcupine access key available. Set PORCUPINE_ACCESS_KEY env var, "
            "pass --access-key-file <path>, or put the key in a file and reference it "
            "via --access-key."
        )
        log_voice_event("error", text="No Porcupine access key configured")
        sys.exit(1)
    if access_key.strip().upper().startswith("YOUR_"):
        LOG.error(
            "PORCUPINE_ACCESS_KEY is still the placeholder ('%s...'). Sign in at "
            "picovoice.ai -> AccessKey, paste the real key into data/pv_access_key.txt.",
            access_key.strip()[:20],
        )
        log_voice_event("error", text="Porcupine access key is the placeholder")
        sys.exit(1)

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    # Suppress JACK warnings
    if os.getenv("JACK_SILENT") == "1":
        os.environ["JACK_NO_LOG"] = "1"

    # Initialize Porcupine
    try:
        if args.keyword_path:
            keyword_path = Path(args.keyword_path).resolve()
            if not keyword_path.is_file():
                LOG.error("Keyword file not found: %s", keyword_path)
                sys.exit(1)
            args.keyword = keyword_path.stem
            detector = pvporcupine.create(
                access_key=access_key,
                keywords=[],
                keyword_paths=[str(keyword_path)],
                sensitivities=[max(0.0, min(1.0, args.sensitivity))],
            )
        else:
            detector = pvporcupine.create(
                access_key=access_key,
                keywords=[args.keyword],
                sensitivities=[max(0.0, min(1.0, args.sensitivity))],
            )
        LOG.info("Porcupine initialized: keyword=%s frame_length=%d sample_rate=%d",
                 args.keyword, detector.frame_length, detector.sample_rate)
    except Exception as exc:
        LOG.error("Porcupine init failed: %s", exc)
        log_voice_event("error", text=f"Porcupine init failed: {exc}")
        sys.exit(1)

    # Initialize PyAudio
    try:
        pa = pyaudio.PyAudio()
        device_info = pa.get_default_input_device_info()
        device_index = int(device_info["index"])
        LOG.info("Using audio device: %s (index=%d)", device_info["name"], device_index)
        stream = pa.open(
            input_device_index=device_index,
            channels=1,
            rate=detector.sample_rate,
            format=pyaudio.paInt16,
            frames_per_buffer=detector.frame_length,
            input=True,
        )
        LOG.info("Audio stream opened: %d Hz, %d frames/chunk",
                 detector.sample_rate, detector.frame_length)
    except Exception as exc:
        LOG.error("PyAudio init failed: %s", exc)
        log_voice_event("error", text=f"Audio init failed: {exc}")
        detector.delete()
        sys.exit(1)

    transcriber = Transcriber()

    # State tracking
    current_state = "idle"
    write_state({"state": current_state, "keyword": args.keyword,
                 "ts": datetime.now(timezone.utc).isoformat()})
    log_voice_event("listening", source="mic")
    current_state = "listening"
    write_state({"state": current_state, "keyword": args.keyword,
                 "ts": datetime.now(timezone.utc).isoformat()})

    post_wake_frames: list[bytes] = []
    pre_wake_ring: list[bytes] = []
    post_wake_start = 0.0
    capturing_after_wake = False
    heard_speech = False
    silence_count = 0
    last_heartbeat = time.time()

    LOG.info("Daemon running - listening for '%s' wake word", args.keyword)

    try:
        while _running:
            # Read a frame from the mic
            try:
                pcm = stream.read(detector.frame_length, exception_on_overflow=False)
            except Exception as exc:
                LOG.warning("Audio read error: %s - retrying", exc)
                time.sleep(0.05)
                continue

            # Maintain the pre-wake ring buffer (audio right before the wake
            # word) so the first syllable of a command is never clipped.
            pre_wake_ring.append(pcm)
            if len(pre_wake_ring) > PRE_WAKE_FRAMES:
                pre_wake_ring.pop(0)

            # Periodic heartbeat so the server watchdog can tell a silent-but-
            # alive daemon apart from a dead one.
            if time.time() - last_heartbeat >= VOICE_HEARTBEAT:
                write_state({"state": current_state, "keyword": args.keyword,
                             "ts": datetime.now(timezone.utc).isoformat(),
                             "event": "heartbeat"})
                last_heartbeat = time.time()

            # Run Porcupine detection
            try:
                result = detector.process(pcm)
            except Exception as exc:
                LOG.warning("Porcupine process error: %s", exc)
                continue

            # Wake word detected (result is the keyword index, >= 0). Ignore
            # re-triggers while already capturing a command.
            if result >= 0 and not capturing_after_wake:
                LOG.info("WAKE WORD DETECTED: keyword_index=%d", result)
                log_voice_event("listening", text="Wake word detected", source="mic")
                current_state = "listening"
                write_state({"state": current_state, "keyword": args.keyword,
                            "ts": datetime.now(timezone.utc).isoformat(),
                            "event": "wake_word"})
                capturing_after_wake = True
                post_wake_frames = list(pre_wake_ring)
                post_wake_start = time.time()
                heard_speech = False
                silence_count = 0
                continue

            # Capture speech after wake word
            if capturing_after_wake:
                post_wake_frames.append(pcm)
                elapsed = time.time() - post_wake_start

                if is_silence([pcm], threshold=SPEECH_RMS):
                    if heard_speech:
                        silence_count += 1
                else:
                    heard_speech = True
                    silence_count = 0

                # End capture on max window, or on sustained silence after speech.
                if elapsed >= args.capture_timeout or (heard_speech and silence_count >= END_SILENCE_FRAMES):
                    capturing_after_wake = False
                    LOG.info("Capture ended: %d frames, %.1f seconds",
                             len(post_wake_frames), elapsed)

                    if post_wake_frames:
                        # Transcribe
                        log_voice_event("thinking", text="Transcribing...", source="mic")
                        current_state = "thinking"
                        write_state({"state": current_state, "keyword": args.keyword,
                                    "ts": datetime.now(timezone.utc).isoformat(),
                                    "event": "thinking"})

                        text = transcriber.transcribe(post_wake_frames, detector.sample_rate)
                        LOG.info("Transcription: %r", text)

                        if text:
                            intent_res = resolve_intent(text, server_url=args.server_url)
                            reply = intent_res.get("reply") or text
                            LOG.info("Intent %s -> %r", intent_res.get("intent"), reply)
                            log_voice_event("speaking", text=reply, source="mic")
                            current_state = "speaking"
                            write_state({"state": current_state, "keyword": args.keyword,
                                        "ts": datetime.now(timezone.utc).isoformat(),
                                        "event": "speaking", "text": reply,
                                        "transcript": text.strip(),
                                        "intent": intent_res.get("intent")})
                            voice_tts.tts.say(reply)
                        else:
                            log_voice_event("speaking", text="(no speech recognized)", source="mic")
                            current_state = "speaking"
                            write_state({"state": current_state, "keyword": args.keyword,
                                        "ts": datetime.now(timezone.utc).isoformat(),
                                        "event": "speaking",
                                        "text": "(no speech recognized)"})
                    else:
                        log_voice_event("speaking", text="(no audio captured)", source="mic")

                    # Back to idle
                    current_state = "idle"
                    write_state({"state": current_state, "keyword": args.keyword,
                                "ts": datetime.now(timezone.utc).isoformat()})
                    log_voice_event("idle", source="mic")
                    post_wake_frames = []
                    pre_wake_ring = []

            # Heartbeat every 10 seconds
            if int(time.time()) % 10 == 0:
                write_state({"state": current_state, "keyword": args.keyword,
                            "ts": datetime.now(timezone.utc).isoformat()})

    except Exception as exc:
        LOG.exception("Daemon error: %s", exc)
        log_voice_event("error", text=f"Daemon crashed: {exc}")
    finally:
        stream.stop_stream()
        stream.close()
        pa.terminate()
        detector.delete()
        log_voice_event("idle", source="mic")
        write_state({"state": "idle", "keyword": args.keyword,
                    "ts": datetime.now(timezone.utc).isoformat(), "event": "shutdown"})
        LOG.info("Daemon stopped")


if __name__ == "__main__":
    main()
