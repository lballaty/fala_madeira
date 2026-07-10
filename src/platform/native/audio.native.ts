// File: src/platform/native/audio.native.ts
// Description: Native (Capacitor) AudioAdapter — DELIBERATE delegation to the web adapter.
//   Capacitor's WKWebView on iOS supports Web Audio, HTMLAudioElement, and
//   getUserMedia/MediaRecorder (iOS 14.3+), so playback, PCM TTS output, and microphone
//   recording all work in-webview without a native plugin; no Capacitor audio plugin is
//   pulled in (decision recorded at capacitor-setup, 2026-07-09).
//   TODO(ios-build): add NSMicrophoneUsageDescription to ios/App/App/Info.plist
//   (getUserMedia requires it), configure the native AVAudioSession (playback category,
//   ducking, mute-switch behavior), and revisit a native recorder plugin only if WKWebView
//   capture quality proves insufficient on device.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { AudioAdapter } from '../types';
import { createWebAudioAdapter } from '../web/audio.web';

export const createNativeAudioAdapter = (): AudioAdapter => createWebAudioAdapter();
