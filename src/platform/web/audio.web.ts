// File: src/platform/web/audio.web.ts
// Description: Web implementation of AudioAdapter. URL/Blob playback uses a single
//   HTMLAudioElement; raw PCM playback (server TTS: mono s16le) uses one shared,
//   lazily-created AudioContext (buffers carry their own sample rate — the context
//   resamples on playback). Recording uses MediaRecorder over getUserMedia. All
//   failures surface as typed PlatformError values.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { AudioAdapter, AudioPlayOptions, PlatformError, SpeechSynthesisOptions } from '../types';

// Typed view of globalThis with the legacy WebKit AudioContext alias and the speech-synthesis
// globals. Guarded property access keeps this module safe in environments without Web Audio or
// speech synthesis (e.g. jsdom in unit tests).
const g = globalThis as typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
};

export const createWebAudioAdapter = (): AudioAdapter => {
  // Shared AudioContext for all PCM playback — created lazily on first use so
  // module import never touches browser audio APIs (autoplay policies).
  let audioContext: AudioContext | null = null;
  let currentSource: AudioBufferSourceNode | null = null;

  // Single element reused for URL/Blob playback.
  let audioElement: HTMLAudioElement | null = null;
  let currentObjectUrl: string | null = null;

  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];

  const getAudioContext = (): AudioContext => {
    if (!audioContext) {
      const Ctor = g.AudioContext || g.webkitAudioContext;
      if (!Ctor) {
        throw new PlatformError('audio', 'unavailable', 'Web Audio is not supported in this browser.');
      }
      audioContext = new Ctor();
    }
    return audioContext;
  };

  const stopPcmSource = () => {
    if (currentSource) {
      const source = currentSource;
      currentSource = null; // clear first so onended sees it as intentional
      try {
        source.stop();
      } catch {
        // Already stopped/never started — nothing to do.
      }
    }
  };

  const stopElement = () => {
    if (audioElement) {
      audioElement.pause();
      audioElement.removeAttribute('src');
      audioElement.load();
    }
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
  };

  return {
    isAvailable: () =>
      typeof g.Audio === 'function' ||
      Boolean(g.AudioContext || g.webkitAudioContext),

    async play(source: string | Blob, options?: AudioPlayOptions): Promise<void> {
      stopPcmSource();
      stopElement();

      if (!audioElement) {
        if (typeof g.Audio !== 'function') {
          throw new PlatformError('audio', 'unavailable', 'Audio playback is not supported in this browser.');
        }
        audioElement = new Audio();
      }
      const el = audioElement;

      if (typeof source === 'string') {
        el.src = source;
      } else {
        currentObjectUrl = URL.createObjectURL(source);
        el.src = currentObjectUrl;
      }
      el.playbackRate = options?.rate ?? 1.0;
      el.onended = () => {
        if (currentObjectUrl) {
          URL.revokeObjectURL(currentObjectUrl);
          currentObjectUrl = null;
        }
        options?.onEnded?.();
      };

      try {
        await el.play();
      } catch (e) {
        throw new PlatformError(
          'audio',
          'playback-failure',
          'Audio playback failed.',
          e instanceof Error ? e.message : String(e),
        );
      }
    },

    async playPcm16(data: ArrayBuffer, sampleRate: number, options?: AudioPlayOptions): Promise<void> {
      stopPcmSource();
      stopElement();

      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Decode mono signed 16-bit little-endian PCM into an AudioBuffer at the
      // payload's own sample rate; the context resamples during playback.
      const sampleCount = Math.floor(data.byteLength / 2);
      const buffer = ctx.createBuffer(1, sampleCount, sampleRate);
      const channel = buffer.getChannelData(0);
      const view = new DataView(data.slice(0));
      for (let i = 0; i < sampleCount; i++) {
        channel[i] = view.getInt16(i * 2, true) / 32768;
      }

      const bufferSource = ctx.createBufferSource();
      bufferSource.buffer = buffer;
      bufferSource.playbackRate.value = options?.rate ?? 1.0;
      bufferSource.connect(ctx.destination);

      bufferSource.onended = () => {
        if (currentSource === bufferSource) {
          currentSource = null;
        }
        options?.onEnded?.();
      };

      currentSource = bufferSource;
      try {
        bufferSource.start();
      } catch (e) {
        currentSource = null;
        throw new PlatformError(
          'audio',
          'playback-failure',
          'Audio playback failed.',
          e instanceof Error ? e.message : String(e),
        );
      }
    },

    async speak(text: string, options?: SpeechSynthesisOptions): Promise<void> {
      const synth = g.speechSynthesis;
      const Utterance = g.SpeechSynthesisUtterance;
      if (!synth || typeof Utterance !== 'function') {
        throw new PlatformError('audio', 'unavailable', 'Speech synthesis is not supported in this browser.');
      }
      // Take over the audio channel: stop any server-audio playback and clear any queued/ongoing
      // synthesis so this utterance is the only thing speaking.
      stopPcmSource();
      stopElement();
      synth.cancel();

      const utterance = new Utterance(text);
      utterance.lang = options?.lang ?? 'pt-PT';
      utterance.rate = options?.rate ?? 1.0;
      utterance.onend = () => options?.onEnded?.();
      // onerror fires after speak() has already resolved (async), so it cannot reject here; the
      // onEnded contract still fires so callers' spinners clear.
      utterance.onerror = () => options?.onEnded?.();
      synth.speak(utterance);
    },

    pause() {
      audioElement?.pause();
      // Buffer sources cannot pause; suspend the context instead.
      if (currentSource && audioContext && audioContext.state === 'running') {
        void audioContext.suspend();
      }
    },

    async resume() {
      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      if (audioElement && audioElement.src && audioElement.paused) {
        try {
          await audioElement.play();
        } catch (e) {
          throw new PlatformError(
            'audio',
            'playback-failure',
            'Audio playback could not resume.',
            e instanceof Error ? e.message : String(e),
          );
        }
      }
    },

    stop() {
      stopPcmSource();
      stopElement();
      // Cancel any in-progress speech-synthesis fallback too.
      g.speechSynthesis?.cancel();
      // Leave a suspended context ready for the next playback.
      if (audioContext && audioContext.state === 'suspended') {
        void audioContext.resume();
      }
    },

    isRecordingSupported: () =>
      typeof g.MediaRecorder === 'function' &&
      Boolean(g.navigator?.mediaDevices?.getUserMedia),

    async startRecording(): Promise<void> {
      if (!this.isRecordingSupported()) {
        throw new PlatformError('audio', 'unavailable', 'Audio recording is not supported in this browser.');
      }
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        return; // already recording — idempotent
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        const denied = e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        throw new PlatformError(
          'audio',
          denied ? 'permission-denied' : 'audio-capture',
          denied
            ? 'Microphone access was denied.'
            : 'The microphone could not be captured.',
          detail,
        );
      }
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) recordedChunks.push(event.data);
      };
      mediaRecorder.start();
    },

    stopRecording(): Promise<Blob> {
      return new Promise((resolve, reject) => {
        const recorder = mediaRecorder;
        if (!recorder || recorder.state === 'inactive') {
          reject(new PlatformError('audio', 'aborted', 'No recording is in progress.'));
          return;
        }
        recorder.onstop = () => {
          recorder.stream.getTracks().forEach((track) => track.stop());
          const blob = new Blob(recordedChunks, { type: recorder.mimeType || 'audio/webm' });
          recordedChunks = [];
          mediaRecorder = null;
          resolve(blob);
        };
        recorder.stop();
      });
    },
  };
};
