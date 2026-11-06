// ============================================
// js/assistant.js — Main Application & Immersive UI Logic
// ============================================

// ===================== STATE =====================
const state = {
  token: localStorage.getItem('maya-token') || null,
  user: JSON.parse(localStorage.getItem('maya-user') || 'null'),
  isProcessing: false,
  currentView: 'chat', // 'chat' or 'tasks'
  isVoiceMode: false,
};

// ===================== API HELPER =====================
const API_BASE = '/api';

async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  const authHeader = state.token ? ['Bearer', state.token].join(' ') : '';

  const headers = {
    'Content-Type': 'application/json',
    ...(authHeader ? { Authorization: authHeader } : {}),
  };


  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error.message);
    throw error;
  }
}

// ===================== AUTH =====================
function showAuth(mode = 'login') {
  const authScreen = document.getElementById('auth-screen');
  const chatScreen = document.getElementById('chat-screen');
  authScreen.style.display = 'flex';
  chatScreen.style.display = 'none';

  const isRegister = mode === 'register';
  document.getElementById('auth-title').textContent = isRegister
    ? 'Create Account'
    : 'Welcome Back';
  document.getElementById('auth-subtitle').textContent = isRegister
    ? 'Join Maya AI ❣️'
    : 'Sign in to Maya AI ❣️';
  document.getElementById('auth-name-group').style.display = isRegister
    ? 'block'
    : 'none';
  document.getElementById('auth-submit-btn').textContent = isRegister
    ? 'Create Account'
    : 'Initialize Session';
  document.getElementById('auth-toggle-text').innerHTML = isRegister
    ? 'Already have an account? <a onclick="showAuth(\'login\')">Sign in</a>'
    : 'Don\'t have an account? <a onclick="showAuth(\'register\')">Create one</a>';
  document.getElementById('auth-form').dataset.mode = mode;
}

function showChat() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('chat-screen').style.display = 'flex';
  document.getElementById('user-name-display').textContent = state.user?.name || 'friend';

  const messages = document.getElementById('messages');
  if (messages.children.length === 0) {
    addMessage(
      'assistant',
      `Hey ${state.user?.name || 'there'}. I'm Maya — your neural companion. Type a thought, tap the mic, or open Immersive Voice for a full-field conversation.`
    );
  }
}

async function handleAuth(event) {
  event.preventDefault();
  const form = document.getElementById('auth-form');
  const mode = form.dataset.mode;
  const btn = document.getElementById('auth-submit-btn');

  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  btn.disabled = true;
  btn.textContent = 'Please wait...';

  try {
    let data;

    if (mode === 'register') {
      const name = document.getElementById('auth-name').value.trim();
      data = await api('/agent/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
    } else {
      data = await api('/agent/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
    }

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('maya-token', data.token);
    localStorage.setItem('maya-user', JSON.stringify(data.user));

    showToast(`Welcome${mode === 'register' ? '' : ' back'}, ${data.user.name}! ❣️`, 'success');
    showChat();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = mode === 'register' ? 'Create Account' : 'Initialize Session';
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('maya-token');
  localStorage.removeItem('maya-user');
  document.getElementById('messages').innerHTML = '';
  showAuth();
  showToast('Signed out. See you soon! 👋');
}

// ===================== CHAT =====================
function addMessage(role, content, toolResults = []) {
  const messages = document.getElementById('messages');

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'YOU' : 'M';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (toolResults.length > 0) {
    toolResults.forEach((tr) => {
      const badge = document.createElement('div');
      badge.className = 'tool-badge';
      badge.textContent = `🔧 ${tr.tool}${tr.result.success ? ' ✓' : ' ✗'}`;
      bubble.appendChild(badge);
    });
  }

  const textSpan = document.createElement('span');
  textSpan.textContent = content;
  bubble.appendChild(textSpan);

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);
  messages.appendChild(msgDiv);

  messages.scrollTop = messages.scrollHeight;
}

function showTypingIndicator() {
  const messages = document.getElementById('messages');
  const indicator = document.createElement('div');
  indicator.className = 'message assistant';
  indicator.id = 'typing-indicator';
  indicator.innerHTML = `
    <div class="message-avatar">M</div>
    <div class="message-bubble">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  messages.appendChild(indicator);
  messages.scrollTop = messages.scrollHeight;
}

function removeTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.remove();
}

function setStatus(text, type = 'normal') {
  const statusBar = document.getElementById('status-bar');
  if (!statusBar) return;
  const statusDot = statusBar.querySelector('.status-dot');
  const statusText = statusBar.querySelector('.status-text');

  if (statusText) statusText.textContent = text;
  if (statusDot) statusDot.className = `status-dot ${type}`;
  if (window.immersive) {
    if (type === 'error') immersive.setCore('error');
    else if (text.toLowerCase().includes('listen')) immersive.setCore('listening');
    else if (text.toLowerCase().includes('think')) immersive.setCore('thinking');
    else immersive.setCore('idle');
  }
}

// -------------------------------------------------
// sendMessage — Core send & speak loop
// -------------------------------------------------
async function sendMessage(text) {
  if (!text.trim() || state.isProcessing) return;

  state.isProcessing = true;

  // Show user message in chat
  addMessage('user', text);

  // Clear input
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = '';
  }

  // Update Voice Mode transcript if active
  if (state.isVoiceMode) {
    updateVoiceModeTranscript(`" ${text} "`, 'user');
    setOrbState('thinking');
  }

  showTypingIndicator();
  setStatus('Maya is thinking...', 'processing');
  if (window.immersive) immersive.setCore('thinking');

  try {
    const data = await api('/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ message: text }),
    });

    removeTypingIndicator();
    addMessage('assistant', data.reply, data.toolResults || []);
    setStatus('Ready', 'normal');

    if (state.isVoiceMode) {
      updateVoiceModeTranscript(data.reply, 'assistant');
      setOrbState('speaking');
    }
    if (window.immersive) immersive.setCore(state.isVoiceMode ? 'speaking' : 'idle');

    if (voiceService.getStatus().ttsSupported) {
      await voiceService.speak(data.reply);
    }

    if (state.isVoiceMode) {
      setOrbState('idle');
    }
    if (window.immersive) immersive.setCore('idle');
  } catch (error) {
    removeTypingIndicator();
    addMessage('assistant', `Oops, something went wrong: ${error.message} 😔`);
    setStatus('Error', 'error');
    if (state.isVoiceMode) {
      updateVoiceModeTranscript(`Error: ${error.message}`, 'error');
      setOrbState('idle');
    }
  } finally {
    state.isProcessing = false;
  }
}

// ===================== ORB & VOICE MODE =====================
function setOrbState(orbState = 'idle') {
  const orb = document.getElementById('maya-large-orb');
  const dot = document.getElementById('voice-mode-dot');
  if (!orb) return;

  orb.className = `maya-orb ${orbState}`;
  if (window.immersive) immersive.setCore(orbState);

  if (dot) {
    if (orbState === 'listening') dot.className = 'status-dot processing';
    else if (orbState === 'speaking') dot.className = 'status-dot';
    else dot.className = 'status-dot';
  }
}

function updateVoiceModeTranscript(text, role = 'assistant') {
  const box = document.getElementById('voice-transcript-text');
  if (!box) return;
  box.textContent = text;
  box.className = role === 'user' ? 'voice-transcript-user' : 'voice-transcript-assistant';
}

function enterVoiceMode() {
  state.isVoiceMode = true;
  document.getElementById('voice-mode-overlay').style.display = 'flex';
  setOrbState('idle');
  updateVoiceModeTranscript('Tap the mic or orb below and start talking with Maya ❣️', 'placeholder');
}

function exitVoiceMode() {
  state.isVoiceMode = false;
  voiceService.stopListening();
  voiceService.stopSpeaking();
  document.getElementById('voice-mode-overlay').style.display = 'none';
}

// ===================== MIC HANDLER =====================
async function handleMicButton() {
  const micBtn = document.getElementById('mic-btn');
  const voiceModeMicBtn = document.getElementById('voice-mode-mic-btn');
  const status = voiceService.getStatus();

  if (!status.sttSupported) {
    showToast('Speech recognition is not supported in this browser. Try Chrome or Edge!', 'error');
    return;
  }

  if (status.isListening) {
    voiceService.stopListening();
    if (micBtn) micBtn.classList.remove('listening');
    if (voiceModeMicBtn) voiceModeMicBtn.classList.remove('active');
    setOrbState('idle');
    setStatus('Ready', 'normal');
    return;
  }

  if (micBtn) micBtn.classList.add('listening');
  if (voiceModeMicBtn) voiceModeMicBtn.classList.add('active');
  setOrbState('listening');
  setStatus('Listening... speak now 🎤', 'processing');

  if (state.isVoiceMode) {
    updateVoiceModeTranscript('Listening to you...', 'placeholder');
  }

  try {
    const text = await voiceService.startListening((interim) => {
      const chatInput = document.getElementById('chat-input');
      if (chatInput && !state.isVoiceMode) chatInput.value = interim;
      if (state.isVoiceMode) updateVoiceModeTranscript(interim, 'user');
    });

    if (micBtn) micBtn.classList.remove('listening');
    if (voiceModeMicBtn) voiceModeMicBtn.classList.remove('active');
    const chatInput = document.getElementById('chat-input');
    if (chatInput) chatInput.value = '';

    await sendMessage(text);
  } catch (error) {
    if (micBtn) micBtn.classList.remove('listening');
    if (voiceModeMicBtn) voiceModeMicBtn.classList.remove('active');
    setOrbState('idle');
    setStatus('Ready', 'normal');
    if (!error.message.includes('No speech')) {
      showToast(error.message, 'error');
    }
  }
}

// ===================== TASK PANEL =====================
async function toggleTaskPanel() {
  const chatContainer = document.querySelector('.chat-container');
  const workspace = document.querySelector('.workspace');
  const taskPanel = document.getElementById('task-panel');

  if (state.currentView === 'chat') {
    state.currentView = 'tasks';
    if (workspace) workspace.style.display = 'none';
    if (chatContainer) chatContainer.style.display = 'none';
    taskPanel.classList.add('active');
    await loadTasks();
  } else {
    state.currentView = 'chat';
    if (workspace) workspace.style.display = '';
    if (chatContainer) chatContainer.style.display = 'flex';
    taskPanel.classList.remove('active');
  }
}

async function loadTasks() {
  const taskList = document.getElementById('task-list');
  taskList.innerHTML = '<p class="empty-state">Loading tasks...</p>';

  try {
    const data = await api('/tasks');

    if (data.tasks.length === 0) {
      taskList.innerHTML = `
        <div class="empty-state">
          <div style="font-size: 40px; margin-bottom: 10px;">📝</div>
          <p>No tasks yet!</p>
          <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Ask Maya: "Add a task to study physics"</p>
        </div>
      `;
      return;
    }

    taskList.innerHTML = '';
    data.tasks.forEach((task) => {
      const item = document.createElement('div');
      item.className = `task-item ${task.status === 'completed' ? 'completed' : ''}`;

      const dueDateStr = task.dueDate
        ? new Date(task.dueDate).toLocaleDateString()
        : '';

      item.innerHTML = `
        <div class="task-checkbox ${task.status === 'completed' ? 'completed' : ''}"
             onclick="toggleTask('${task._id}', '${task.status}')"></div>
        <div class="task-info">
          <h3>${task.title}</h3>
          <div class="task-meta">
            <span class="priority-badge ${task.priority}">${task.priority}</span>
            ${dueDateStr ? ` · Due: ${dueDateStr}` : ''}
            ${task.tags?.length ? ` · ${task.tags.join(', ')}` : ''}
          </div>
        </div>
      `;

      taskList.appendChild(item);
    });
  } catch (error) {
    taskList.innerHTML = `<p class="empty-state">Error: ${error.message}</p>`;
  }
}

async function toggleTask(taskId, currentStatus) {
  const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';

  try {
    await api(`/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus }),
    });
    await loadTasks();
    showToast(newStatus === 'completed' ? 'Task completed! 🎉' : 'Task reopened.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ===================== VOICE & WARMTH SETTINGS =====================
function populateVoiceSelect() {
  const select = document.getElementById('voice-select');
  if (!select) return;

  const voices = voiceService.getVoices();
  const currentSettings = voiceService.getSettings();

  select.innerHTML = '<option value="">Auto (Default Best Voice)</option>';

  voices.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.name;
    const isPreferred = v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Zira');
    opt.textContent = `${isPreferred ? '✨ ' : ''}${v.name} (${v.lang})`;
    if (currentSettings.voiceName === v.name) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function openVoiceModal() {
  const modal = document.getElementById('voice-modal');
  if (!modal) return;

  populateVoiceSelect();
  const settings = voiceService.getSettings();

  const rateSlider = document.getElementById('voice-rate');
  const pitchSlider = document.getElementById('voice-pitch');
  const langSelect = document.getElementById('stt-lang-select');
  const rateVal = document.getElementById('rate-value');
  const pitchVal = document.getElementById('pitch-value');

  if (rateSlider) {
    rateSlider.value = settings.rate;
    if (rateVal) rateVal.textContent = `${settings.rate.toFixed(2)}x`;
  }
  if (pitchSlider) {
    pitchSlider.value = settings.pitch;
    if (pitchVal) pitchVal.textContent = settings.pitch.toFixed(2);
  }
  if (langSelect && settings.lang) {
    langSelect.value = settings.lang;
  }

  // Highlight active preset button
  document.querySelectorAll('.warmth-preset-btn').forEach((btn) => {
    if (btn.dataset.preset === settings.preset) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  modal.style.display = 'flex';
}

function closeVoiceModal() {
  const modal = document.getElementById('voice-modal');
  if (modal) modal.style.display = 'none';
  voiceService.stopSpeaking();
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ===================== EVENT LISTENERS =====================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('auth-form').addEventListener('submit', handleAuth);

  // Chat input
  const chatInput = document.getElementById('chat-input');
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = e.target.value.trim();
      if (text) sendMessage(text);
    }
  });

  document.getElementById('send-btn').addEventListener('click', () => {
    const text = chatInput.value.trim();
    if (text) sendMessage(text);
  });

  // Mic buttons
  document.getElementById('mic-btn').addEventListener('click', handleMicButton);
  const voiceModeMicBtn = document.getElementById('voice-mode-mic-btn');
  if (voiceModeMicBtn) voiceModeMicBtn.addEventListener('click', handleMicButton);
  const largeOrb = document.getElementById('maya-large-orb');
  if (largeOrb) largeOrb.addEventListener('click', handleMicButton);

  // Voice mode toggle
  document.getElementById('enter-voice-mode-btn').addEventListener('click', enterVoiceMode);
  document.getElementById('exit-voice-mode-btn').addEventListener('click', exitVoiceMode);

  // Quick suggestion chips
  document.querySelectorAll('.chip-btn').forEach((chip) => {
    chip.addEventListener('click', () => {
      const prompt = chip.dataset.prompt;
      if (prompt) sendMessage(prompt);
    });
  });

  // Warmth tone presets
  document.querySelectorAll('.warmth-preset-btn').forEach((presetBtn) => {
    presetBtn.addEventListener('click', () => {
      document.querySelectorAll('.warmth-preset-btn').forEach((b) => b.classList.remove('active'));
      presetBtn.classList.add('active');

      const presetKey = presetBtn.dataset.preset;
      voiceService.applyPreset(presetKey);

      const s = voiceService.getSettings();
      const rSlider = document.getElementById('voice-rate');
      const pSlider = document.getElementById('voice-pitch');
      if (rSlider) rSlider.value = s.rate;
      if (pSlider) pSlider.value = s.pitch;
      document.getElementById('rate-value').textContent = `${s.rate.toFixed(2)}x`;
      document.getElementById('pitch-value').textContent = s.pitch.toFixed(2);

      showToast(`Applied preset: ${presetBtn.querySelector('.warmth-preset-title').textContent}`, 'success');
    });
  });

  // Task & voice modals
  document.getElementById('task-toggle-btn').addEventListener('click', toggleTaskPanel);
  document.getElementById('back-to-chat-btn').addEventListener('click', toggleTaskPanel);
  document.getElementById('logout-btn').addEventListener('click', logout);

  document.getElementById('voice-settings-btn').addEventListener('click', openVoiceModal);
  document.getElementById('voice-modal-close-btn').addEventListener('click', closeVoiceModal);
  document.getElementById('save-voice-btn').addEventListener('click', closeVoiceModal);

  document.getElementById('voice-select').addEventListener('change', (e) => {
    voiceService.setVoice(e.target.value);
  });

  document.getElementById('voice-rate').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    voiceService.setRate(val);
    document.getElementById('rate-value').textContent = `${val.toFixed(2)}x`;
  });

  document.getElementById('voice-pitch').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    voiceService.setPitch(val);
    document.getElementById('pitch-value').textContent = val.toFixed(2);
  });

  document.getElementById('stt-lang-select').addEventListener('change', (e) => {
    voiceService.setLanguage(e.target.value);
    showToast(`Microphone set to: ${e.target.options[e.target.selectedIndex].text}`, 'info');
  });

  document.getElementById('test-voice-btn').addEventListener('click', () => {
    const name = state.user?.name || 'friend';
    voiceService.speak(`Hey ${name}! I'm Maya, your loving AI companion. How does my voice sound to you now? ❣️`);
  });

  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = populateVoiceSelect;
  }

  // Auth check
  if (state.token && state.user) {
    showChat();
  } else {
    showAuth();
  }
});
