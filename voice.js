// ============================================
// js/voice.js — Immersive & Warm Voice Service
// ============================================
// Features:
// 1. Natural warmth tuning (rate & pitch calibration for fatigue-free listening)
// 2. Curated warmth presets (Soothing Companion, Warm Bestie, Study Partner, Late Night)
// 3. Web Audio API gentle activation chimes
// 4. Smooth STT speech recognition
// ============================================

const voiceService = (() => {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;

  let recognition = null;
  let isListening = false;
  let cachedVoices = [];
  let audioCtx = null;

  // Warmth Presets
  const PRESETS = {
    soothing: {
      id: 'soothing',
      title: '🌸 Soothing Companion',
      desc: 'Relaxed & gentle — perfect for long listening without fatigue',
      rate: 0.94,
      pitch: 0.94,
    },
    warm_bestie: {
      id: 'warm_bestie',
      title: '✨ Warm Bestie',
      desc: 'Cheerful, upbeat, friendly and natural',
      rate: 1.0,
      pitch: 1.0,
    },
    study_buddy: {
      id: 'study_buddy',
      title: '📚 Focus Study Partner',
      desc: 'Crisp, steady, articulate and clear',
      rate: 1.02,
      pitch: 0.98,
    },
    late_night: {
      id: 'late_night',
      title: '🌙 Late Night Calm',
      desc: 'Soft, slow, calming and peaceful',
      rate: 0.88,
      pitch: 0.90,
    },
  };

  // Settings persisted in localStorage
  const settings = {
    voiceName: localStorage.getItem('maya_voice_name') || '',
    preset: localStorage.getItem('maya_voice_preset') || 'soothing',
    rate: parseFloat(localStorage.getItem('maya_voice_rate') || '0.94'),
    pitch: parseFloat(localStorage.getItem('maya_voice_pitch') || '0.94'),
    lang: localStorage.getItem('maya_stt_lang') || 'en-IN',
  };

  // -------------------------------------------------
  // Web Audio Chimes (Soft, pleasant audio feedback)
  // -------------------------------------------------
  function playChime(type = 'start') {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;

      if (type === 'start') {
        // Soft rising chime: 440Hz -> 587Hz (A4 to D5)
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(587.33, now + 0.12);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.06, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else {
        // Soft falling chime: 587Hz -> 440Hz
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.12);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.05, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch (e) {
      // AudioContext not allowed before user gesture
    }
  }

  function updateVoices() {
    if (!synth) return [];
    cachedVoices = synth.getVoices() || [];
    return cachedVoices;
  }

  if (synth) {
    updateVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = updateVoices;
    }
  }

  function init() {
    if (!SpeechRecognition) return false;

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = settings.lang || 'en-IN';
    recognition.maxAlternatives = 1;

    return true;
  }

  // -------------------------------------------------
  // Pick the most soothing, natural voice available
  // -------------------------------------------------
  function getBestVoice() {
    const voices = updateVoices();
    if (!voices || voices.length === 0) return null;

    if (settings.voiceName) {
      const saved = voices.find((v) => v.name === settings.voiceName);
      if (saved) return saved;
    }

    // Prioritize natural / neural voices (smoothest for long listening)
    const naturalVoice = voices.find(
      (v) =>
        (v.name.includes('Natural') || v.name.includes('Online')) &&
        (v.name.includes('Jenny') || v.name.includes('Neerja') || v.name.includes('Sonia') || v.name.includes('Aria'))
    );
    if (naturalVoice) return naturalVoice;

    // Google Female voices
    const googleVoice = voices.find(
      (v) =>
        v.name.includes('Google') &&
        (v.name.includes('UK English Female') || v.name.includes('US English'))
    );
    if (googleVoice) return googleVoice;

    // Windows Zira or standard female
    const femaleVoice = voices.find(
      (v) =>
        v.name.includes('Zira') ||
        v.name.includes('Samantha') ||
        v.name.includes('Female')
    );
    if (femaleVoice) return femaleVoice;

    return voices.find((v) => v.lang.startsWith('en')) || voices[0];
  }

  // -------------------------------------------------
  // Speech Recognition (STT)
  // -------------------------------------------------
  function startListening(onInterim = null) {
    return new Promise((resolve, reject) => {
      stopSpeaking();

      if (!recognition) {
        init();
        if (!recognition) {
          reject(new Error('Speech recognition not supported in this browser.'));
          return;
        }
      }

      if (isListening) {
        recognition.stop();
      }

      playChime('start');
      recognition.lang = settings.lang || 'en-IN';
      let finalTranscript = '';

      recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        if (onInterim && interimTranscript) {
          onInterim(interimTranscript);
        }
      };

      recognition.onend = () => {
        isListening = false;
        playChime('end');
        if (finalTranscript.trim()) {
          resolve(finalTranscript.trim());
        } else {
          reject(new Error('No speech detected.'));
        }
      };

      recognition.onerror = (event) => {
        isListening = false;
        let message = 'Speech recognition error.';
        switch (event.error) {
          case 'no-speech':
            message = 'No speech detected. Try again.';
            break;
          case 'audio-capture':
            message = 'No microphone found.';
            break;
          case 'not-allowed':
            message = 'Microphone permission denied.';
            break;
        }
        reject(new Error(message));
      };

      recognition.start();
      isListening = true;
    });
  }

  function stopListening() {
    if (recognition && isListening) {
      recognition.stop();
      isListening = false;
    }
  }

  // -------------------------------------------------
  // Speech Synthesis (TTS) with Warmth Smoothing
  // -------------------------------------------------
  function speak(text, options = {}) {
    return new Promise((resolve) => {
      if (!synth) {
        resolve();
        return;
      }

      synth.cancel();

      // Clean text to eliminate awkward audio stumbles:
      // Remove emojis, special characters, URLs, and markdown
      const cleanText = text
        .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, '')
        .replace(/[~`@#$%^&*()[\]_{}|\\<>\/+=]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/\s+/g, ' ')
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanText);

      // Warmth settings (relaxed rate and smooth pitch)
      utterance.rate = options.rate !== undefined ? options.rate : settings.rate;
      utterance.pitch = options.pitch !== undefined ? options.pitch : settings.pitch;
      utterance.volume = 1.0;

      const voice = options.voice || (options.voiceName ? cachedVoices.find(v => v.name === options.voiceName) : getBestVoice());
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = (e) => {
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          console.warn('TTS error:', e.error);
        }
        resolve();
      };

      synth.speak(utterance);
    });
  }

  function stopSpeaking() {
    if (synth) {
      synth.cancel();
    }
  }

  // -------------------------------------------------
  // Presets & Customization
  // -------------------------------------------------
  function applyPreset(presetKey) {
    const p = PRESETS[presetKey];
    if (!p) return;

    settings.preset = presetKey;
    settings.rate = p.rate;
    settings.pitch = p.pitch;

    localStorage.setItem('maya_voice_preset', presetKey);
    localStorage.setItem('maya_voice_rate', p.rate);
    localStorage.setItem('maya_voice_pitch', p.pitch);
  }

  function setVoice(name) {
    settings.voiceName = name;
    localStorage.setItem('maya_voice_name', name);
  }

  function setRate(rate) {
    settings.rate = parseFloat(rate);
    localStorage.setItem('maya_voice_rate', rate);
  }

  function setPitch(pitch) {
    settings.pitch = parseFloat(pitch);
    localStorage.setItem('maya_voice_pitch', pitch);
  }

  function setLanguage(lang) {
    settings.lang = lang;
    localStorage.setItem('maya_stt_lang', lang);
    if (recognition) {
      recognition.lang = lang;
    }
  }

  function getSettings() {
    return { ...settings, activeVoice: getBestVoice(), presets: PRESETS };
  }

  function getVoices() {
    return updateVoices();
  }

  function getStatus() {
    return {
      sttSupported: !!SpeechRecognition,
      ttsSupported: !!synth,
      isListening,
      isSpeaking: synth ? synth.speaking : false,
    };
  }

  init();

  return {
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    applyPreset,
    getVoices,
    setVoice,
    setRate,
    setPitch,
    setLanguage,
    getSettings,
    getStatus,
    PRESETS,
  };
})();