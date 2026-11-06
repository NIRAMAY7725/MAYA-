(() => {
  'use strict';

  const root = document.getElementById('maya-file-assistant');
  if (!root) return;

  const API_BASE = root.dataset.apiBase || '/api/file-assistant';
  const ACCEPTED = '.pdf,.docx,.txt,.csv,.xlsx';
  let uploadedFiles = [];
  let lastResult = '';

  root.innerHTML = `
    <section class="maya-fa-shell">
      <header class="maya-fa-heading">
        <div class="maya-fa-logo" aria-hidden="true">✦</div>
        <div>
          <h2>MAYA File Intelligence</h2>
          <p class="maya-fa-subtitle">Upload documents, ask a task, and let MAYA prepare the result.</p>
        </div>
      </header>

      <div class="maya-fa-grid">
        <section class="maya-fa-card">
          <h3>① Upload your files</h3>
          <label class="maya-fa-drop" for="maya-fa-input">
            <div aria-hidden="true" style="font-size:27px">⇧</div>
            <strong>Choose files to upload</strong>
            <span>PDF, DOCX, TXT, CSV, XLSX · up to 8 MB each · 3 files</span>
          </label>
          <input id="maya-fa-input" type="file" accept="${ACCEPTED}" multiple>
          <div class="maya-fa-actions">
            <button class="maya-fa-button" id="maya-fa-upload" type="button">Upload files</button>
          </div>
          <p class="maya-fa-status" id="maya-fa-upload-status" aria-live="polite">No files uploaded yet.</p>
          <ul class="maya-fa-file-list" id="maya-fa-file-list"></ul>
        </section>

        <section class="maya-fa-card">
          <h3>② Tell MAYA what to do</h3>
          <textarea id="maya-fa-task" maxlength="2000" placeholder="Example: Read this chapter and create clear study notes with important definitions and 10 MCQs."></textarea>
          <div class="maya-fa-examples">
            <button class="maya-fa-chip" type="button" data-task="Summarize the selected files into clear sections and list the key points.">Summarize</button>
            <button class="maya-fa-chip" type="button" data-task="Create detailed study notes with definitions and important points.">Study notes</button>
            <button class="maya-fa-chip" type="button" data-task="Compare the selected files and explain the important similarities and differences.">Compare files</button>
            <button class="maya-fa-chip" type="button" data-task="Create 20 multiple-choice questions with four options and an answer key.">Make MCQs</button>
          </div>
          <div class="maya-fa-actions">
            <button class="maya-fa-button" id="maya-fa-run" type="button" disabled>✦ Run task</button>
            <button class="maya-fa-button secondary" id="maya-fa-clear" type="button">Clear</button>
          </div>
          <p class="maya-fa-status" id="maya-fa-task-status" aria-live="polite">Upload and select at least one file to begin.</p>
        </section>
      </div>

      <section class="maya-fa-result maya-fa-hidden" id="maya-fa-result-section">
        <div class="maya-fa-actions" style="justify-content:space-between;align-items:center">
          <h3 style="margin:0">③ MAYA's result</h3>
          <div class="maya-fa-actions" style="margin:0">
            <button class="maya-fa-button secondary" id="maya-fa-speak" type="button">🔊 Read aloud</button>
            <button class="maya-fa-button" id="maya-fa-download" type="button">↓ Download result</button>
          </div>
        </div>
        <pre class="maya-fa-result-content" id="maya-fa-result-content"></pre>
      </section>
    </section>
  `;

  const el = (id) => root.querySelector(`#${id}`);
  const input = el('maya-fa-input');
  const uploadButton = el('maya-fa-upload');
  const runButton = el('maya-fa-run');
  const taskInput = el('maya-fa-task');
  const fileList = el('maya-fa-file-list');

  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle('error', isError);
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, options);
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Server returned an invalid response (${response.status}).`);
    }
    if (!response.ok || !data.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }

  function renderFiles() {
    fileList.replaceChildren();
    for (const file of uploadedFiles) {
      const item = document.createElement('li');
      item.className = 'maya-fa-file';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.value = file.id;
      checkbox.setAttribute('aria-label', `Select ${file.originalName}`);
      checkbox.addEventListener('change', updateRunButton);

      const name = document.createElement('span');
      name.className = 'maya-fa-file-name';
      name.textContent = `${file.originalName} (${Math.max(1, Math.round(file.size / 1024))} KB)`;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'maya-fa-remove';
      remove.textContent = '×';
      remove.title = 'Remove file';
      remove.addEventListener('click', () => removeFile(file.id));

      item.append(checkbox, name, remove);
      fileList.append(item);
    }
    updateRunButton();
  }

  function getSelectedIds() {
    return [...fileList.querySelectorAll('input[type="checkbox"]:checked')].map((box) => box.value);
  }

  function updateRunButton() {
    runButton.disabled = getSelectedIds().length === 0;
  }

  async function uploadSelectedFiles() {
    const selected = [...input.files];
    if (!selected.length) {
      setStatus(el('maya-fa-upload-status'), 'Choose one or more files first.', true);
      return;
    }
    if (selected.length > 3) {
      setStatus(el('maya-fa-upload-status'), 'Select no more than 3 files at once.', true);
      return;
    }

    const formData = new FormData();
    selected.forEach((file) => formData.append('files', file));
    uploadButton.disabled = true;
    setStatus(el('maya-fa-upload-status'), 'Uploading and extracting text…');

    try {
      const data = await apiRequest('/upload', { method: 'POST', body: formData });
      uploadedFiles = [...uploadedFiles, ...data.files];
      renderFiles();
      input.value = '';
      setStatus(el('maya-fa-upload-status'), `${data.files.length} file(s) uploaded and ready for analysis.`);
      setStatus(el('maya-fa-task-status'), 'Choose the files and enter your task.');
    } catch (error) {
      setStatus(el('maya-fa-upload-status'), error.message, true);
    } finally {
      uploadButton.disabled = false;
    }
  }

  async function removeFile(id) {
    try {
      await apiRequest(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (error) {
      setStatus(el('maya-fa-upload-status'), error.message, true);
      return;
    }
    uploadedFiles = uploadedFiles.filter((file) => file.id !== id);
    renderFiles();
    setStatus(el('maya-fa-upload-status'), 'File removed from this session.');
  }

  async function runTask(instructionOverride) {
    const instruction = String(instructionOverride || taskInput.value || '').trim();
    const fileIds = getSelectedIds();

    if (!fileIds.length) throw new Error('Upload and select at least one file first.');
    if (!instruction) throw new Error('Write a task for MAYA first.');

    runButton.disabled = true;
    setStatus(el('maya-fa-task-status'), 'MAYA is reading your files and preparing the result…');
    el('maya-fa-result-section').classList.add('maya-fa-hidden');

    try {
      const data = await apiRequest('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds, instruction })
      });
      lastResult = data.result;
      el('maya-fa-result-content').textContent = lastResult;
      el('maya-fa-result-section').classList.remove('maya-fa-hidden');
      setStatus(el('maya-fa-task-status'), 'Task completed. Review the result below.');
      el('maya-fa-result-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return lastResult;
    } catch (error) {
      setStatus(el('maya-fa-task-status'), error.message, true);
      throw error;
    } finally {
      updateRunButton();
    }
  }

  uploadButton.addEventListener('click', uploadSelectedFiles);
  runButton.addEventListener('click', () => runTask().catch(() => {}));
  fileList.addEventListener('change', updateRunButton);

  root.querySelectorAll('[data-task]').forEach((button) => {
    button.addEventListener('click', () => {
      taskInput.value = button.dataset.task;
      taskInput.focus();
    });
  });

  el('maya-fa-clear').addEventListener('click', () => {
    taskInput.value = '';
    lastResult = '';
    el('maya-fa-result-content').textContent = '';
    el('maya-fa-result-section').classList.add('maya-fa-hidden');
    setStatus(el('maya-fa-task-status'), 'Task cleared. Your uploaded files are still available.');
  });

  el('maya-fa-download').addEventListener('click', () => {
    if (!lastResult) return;
    const blob = new Blob([lastResult], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `maya-result-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  el('maya-fa-speak').addEventListener('click', () => {
    if (!lastResult || !('speechSynthesis' in window)) {
      setStatus(el('maya-fa-task-status'), 'Speech output is not supported in this browser.', true);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(lastResult.slice(0, 12000));
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  });

  // Hook for your existing voice.js / speech-recognition code:
  // window.MAYAFileAssistant.runTask("Summarize the uploaded PDF");
  window.MAYAFileAssistant = {
    runTask,
    getUploadedFiles: () => uploadedFiles.map(({ id, originalName, size }) => ({ id, originalName, size })),
    stopSpeaking: () => window.speechSynthesis?.cancel()
  };
})();
