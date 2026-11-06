/* ==========================================================
   MAYA FILE INTELLIGENCE
   File: public/js/file-assistant.js

   IMPORTANT:
   - This file contains JavaScript only.
   - Keep the styles in public/css/file-assistant.css.
   - Expected backend base: /api/file-assistant
   ========================================================== */

(() => {
  'use strict';

  const ROOT_ID = 'maya-file-assistant';
  const API_BASE = '/api/file-assistant';
  const MAX_FILES_PER_TASK = 3;
  const MAX_FILES_PER_UPLOAD = 3;
  const ACCEPTED_TYPES = '.pdf,.docx,.txt,.csv,.xlsx';

  function initializeMayaFileAssistant() {
    const root = document.getElementById(ROOT_ID);

    if (!root) {
      console.warn(`[MAYA FILE AI] #${ROOT_ID} was not found. Check index.html.`);
      return;
    }

    // Prevent duplicate initialization if this script is accidentally included twice.
    if (root.dataset.initialized === 'true') return;
    root.dataset.initialized = 'true';

    const chatScreen = document.getElementById('chat-screen');
    const openButton = document.getElementById('open-file-assistant-btn');

    if (!chatScreen) {
      console.error('[MAYA FILE AI] #chat-screen was not found.');
      return;
    }

    let uploadedFiles = [];
    let lastResult = '';
    let isUploading = false;
    let isRunningTask = false;

    // ------------------------------------------------------
    // Build the workspace. CSS is loaded separately.
    // ------------------------------------------------------
    root.hidden = true;
    root.innerHTML = `
      <section class="maya-fa-shell" aria-labelledby="maya-fa-title">
        <header class="maya-fa-topbar">
          <div class="maya-fa-heading">
            <div class="maya-fa-logo" aria-hidden="true">✦</div>
            <div class="maya-fa-heading-copy">
              <span class="maya-fa-kicker">MAYA NEURAL WORKSPACE // MODULE 01</span>
              <h2 id="maya-fa-title">File Intelligence</h2>
              <p class="maya-fa-subtitle">Upload documents, describe a task, and let MAYA turn information into useful work.</p>
            </div>
          </div>
          <button class="maya-fa-back" id="maya-fa-back" type="button">← Back to chat</button>
        </header>

        <div class="maya-fa-grid">
          <section class="maya-fa-card" aria-labelledby="maya-fa-upload-heading">
            <div class="maya-fa-card-heading">
              <span class="maya-fa-step">01</span>
              <div>
                <h3 id="maya-fa-upload-heading">Add your files</h3>
                <p>Choose the documents MAYA should read.</p>
              </div>
            </div>

            <label class="maya-fa-drop" id="maya-fa-drop" for="maya-fa-input" tabindex="0">
              <span class="maya-fa-upload-icon" aria-hidden="true">⇧</span>
              <strong>Choose files to upload</strong>
              <span>PDF, DOCX, TXT, CSV or XLSX · Up to 8 MB each · 3 files per upload</span>
              <em>Browse your device</em>
            </label>
            <input id="maya-fa-input" class="maya-fa-file-input" type="file" accept="${ACCEPTED_TYPES}" multiple />

            <div class="maya-fa-actions">
              <button class="maya-fa-button" id="maya-fa-upload" type="button">＋ Upload files</button>
            </div>

            <p class="maya-fa-status" id="maya-fa-upload-status" role="status" aria-live="polite">No files uploaded yet.</p>
            <ul class="maya-fa-file-list" id="maya-fa-file-list" aria-label="Uploaded files"></ul>
          </section>

          <section class="maya-fa-card" aria-labelledby="maya-fa-task-heading">
            <div class="maya-fa-card-heading">
              <span class="maya-fa-step">02</span>
              <div>
                <h3 id="maya-fa-task-heading">Give MAYA a task</h3>
                <p>Describe the result you want in plain language.</p>
              </div>
            </div>

            <label class="maya-fa-visually-hidden" for="maya-fa-task">Task instructions</label>
            <textarea id="maya-fa-task" maxlength="2000" placeholder="Example: Read this chapter and create clear study notes with important definitions and 10 MCQs."></textarea>

            <div class="maya-fa-examples" aria-label="Suggested tasks">
              <button class="maya-fa-chip" type="button" data-task="Summarize the selected files into clear sections and list the key points.">Summarize</button>
              <button class="maya-fa-chip" type="button" data-task="Create detailed study notes with definitions and important points.">Study notes</button>
              <button class="maya-fa-chip" type="button" data-task="Compare the selected files and explain the important similarities and differences.">Compare files</button>
              <button class="maya-fa-chip" type="button" data-task="Create 20 multiple-choice questions with four options and an answer key.">Make MCQs</button>
            </div>

            <div class="maya-fa-actions">
              <button class="maya-fa-button" id="maya-fa-run" type="button" disabled>✦ Run task</button>
              <button class="maya-fa-button secondary" id="maya-fa-clear" type="button">Clear prompt</button>
            </div>
            <p class="maya-fa-status" id="maya-fa-task-status" role="status" aria-live="polite">Upload and select at least one file to begin.</p>
          </section>
        </div>

        <section class="maya-fa-result maya-fa-hidden" id="maya-fa-result-section" aria-labelledby="maya-fa-result-heading">
          <div class="maya-fa-result-head">
            <div class="maya-fa-result-title">
              <span class="maya-fa-result-mark" aria-hidden="true">✧</span>
              <div>
                <h3 id="maya-fa-result-heading">MAYA's result</h3>
                <p>Generated from your selected files and instruction.</p>
              </div>
            </div>
            <div class="maya-fa-result-actions">
              <button class="maya-fa-button secondary" id="maya-fa-speak" type="button">◖ Read aloud</button>
              <button class="maya-fa-button" id="maya-fa-download" type="button">↓ Download result</button>
            </div>
          </div>
          <pre class="maya-fa-result-content" id="maya-fa-result-content"></pre>
        </section>
      </section>
    `;

    const $ = (id) => root.querySelector(`#${id}`);
    const fileInput = $('maya-fa-input');
    const dropArea = $('maya-fa-drop');
    const uploadButton = $('maya-fa-upload');
    const runButton = $('maya-fa-run');
    const taskInput = $('maya-fa-task');
    const fileList = $('maya-fa-file-list');
    const uploadStatus = $('maya-fa-upload-status');
    const taskStatus = $('maya-fa-task-status');
    const resultSection = $('maya-fa-result-section');
    const resultContent = $('maya-fa-result-content');

    // ------------------------------------------------------
    // Utility functions
    // ------------------------------------------------------
    function setStatus(element, message, isError = false) {
      if (!element) return;
      element.textContent = message;
      element.classList.toggle('error', Boolean(isError));
    }

    function formatFileSize(bytes) {
      if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    async function apiRequest(path, options = {}) {
      let response;
      try {
        response = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers: {
            ...(options.headers || {})
          }
        });
      } catch (error) {
        throw new Error('Cannot reach MAYA server. Check that the Express server is running.');
      }

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error(`Server returned an invalid response (HTTP ${response.status}).`);
      }

      if (!response.ok || data?.ok !== true) {
        throw new Error(data?.error || `Request failed (HTTP ${response.status}).`);
      }

      return data;
    }

    function setWorkspaceOpen(open) {
      root.hidden = !open;
      chatScreen.classList.toggle('file-assistant-open', open);
      openButton?.classList.toggle('active', open);
      openButton?.setAttribute('aria-pressed', String(open));

      if (open) {
        root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        $('maya-fa-task').focus({ preventScroll: true });
      } else {
        openButton?.focus({ preventScroll: true });
      }
    }

    // ------------------------------------------------------
    // File selection and rendering
    // ------------------------------------------------------
    function getSelectedIds() {
      return [...fileList.querySelectorAll('input[type="checkbox"]:checked')]
        .map((checkbox) => checkbox.value);
    }

    function updateRunButton() {
      const selectedCount = getSelectedIds().length;
      runButton.disabled = isUploading || isRunningTask || selectedCount < 1 || selectedCount > MAX_FILES_PER_TASK;
    }

    function renderFiles() {
      fileList.replaceChildren();

      if (uploadedFiles.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'maya-fa-empty-files';
        empty.textContent = 'Your uploaded files will appear here.';
        fileList.append(empty);
        updateRunButton();
        return;
      }

      uploadedFiles.forEach((file) => {
        const item = document.createElement('li');
        item.className = 'maya-fa-file';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.value = file.id;
        checkbox.setAttribute('aria-label', `Select ${file.originalName}`);
        checkbox.addEventListener('change', () => {
          const selected = getSelectedIds();
          if (selected.length > MAX_FILES_PER_TASK) {
            checkbox.checked = false;
            setStatus(taskStatus, `Select no more than ${MAX_FILES_PER_TASK} files for one task.`, true);
          } else {
            setStatus(taskStatus, 'Files selected. Enter an instruction and run your task.');
          }
          updateRunButton();
        });

        const name = document.createElement('span');
        name.className = 'maya-fa-file-name';
        name.textContent = `${file.originalName} · ${formatFileSize(file.size)}`;

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'maya-fa-remove';
        remove.textContent = '×';
        remove.title = `Remove ${file.originalName}`;
        remove.setAttribute('aria-label', `Remove ${file.originalName}`);
        remove.addEventListener('click', () => removeFile(file.id));

        item.append(checkbox, name, remove);
        fileList.append(item);
      });

      updateRunButton();
    }

    // ------------------------------------------------------
    // Upload documents
    // Backend contract: POST /upload, multipart field name "files"
    // ------------------------------------------------------
    async function uploadSelectedFiles() {
      const selectedFiles = [...(fileInput.files || [])];

      if (selectedFiles.length === 0) {
        setStatus(uploadStatus, 'Choose one or more files first.', true);
        return;
      }

      if (selectedFiles.length > MAX_FILES_PER_UPLOAD) {
        setStatus(uploadStatus, `Choose no more than ${MAX_FILES_PER_UPLOAD} files per upload.`, true);
        return;
      }

      const maxBytes = 8 * 1024 * 1024;
      const tooLarge = selectedFiles.find((file) => file.size > maxBytes);
      if (tooLarge) {
        setStatus(uploadStatus, `${tooLarge.name} is larger than 8 MB.`, true);
        return;
      }

      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append('files', file));

      isUploading = true;
      uploadButton.disabled = true;
      fileInput.disabled = true;
      updateRunButton();
      setStatus(uploadStatus, 'Uploading files and extracting their text…');

      try {
        const data = await apiRequest('/upload', {
          method: 'POST',
          body: formData
        });

        const newFiles = Array.isArray(data.files) ? data.files : [];
        if (newFiles.length === 0) {
          throw new Error('The server did not return any uploaded file records.');
        }

        uploadedFiles = [...uploadedFiles, ...newFiles];
        renderFiles();
        fileInput.value = '';

        setStatus(uploadStatus, `${newFiles.length} file(s) uploaded and text extracted successfully.`);
        setStatus(taskStatus, 'Select up to 3 files, enter a task, and run it.');
      } catch (error) {
        setStatus(uploadStatus, error.message, true);
      } finally {
        isUploading = false;
        uploadButton.disabled = false;
        fileInput.disabled = false;
        updateRunButton();
      }
    }

    // ------------------------------------------------------
    // Delete a document
    // Backend contract: DELETE /files/:id
    // ------------------------------------------------------
    async function removeFile(id) {
      const file = uploadedFiles.find((entry) => entry.id === id);
      if (!file) return;

      try {
        await apiRequest(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
        uploadedFiles = uploadedFiles.filter((entry) => entry.id !== id);
        renderFiles();
        setStatus(uploadStatus, `${file.originalName} removed.`);
      } catch (error) {
        setStatus(uploadStatus, error.message, true);
      }
    }

    // ------------------------------------------------------
    // Run the AI task
    // Backend contract: POST /ask with { fileIds, instruction }
    // ------------------------------------------------------
    async function runTask(instructionOverride) {
      const instruction = String(instructionOverride ?? taskInput.value ?? '').trim();
      const fileIds = getSelectedIds();

      if (fileIds.length === 0) {
        const error = new Error('Upload and select at least one file first.');
        setStatus(taskStatus, error.message, true);
        throw error;
      }

      if (fileIds.length > MAX_FILES_PER_TASK) {
        const error = new Error(`Select no more than ${MAX_FILES_PER_TASK} files for one task.`);
        setStatus(taskStatus, error.message, true);
        throw error;
      }

      if (!instruction) {
        const error = new Error('Write a task for MAYA first.');
        setStatus(taskStatus, error.message, true);
        throw error;
      }

      if (instruction.length > 2000) {
        const error = new Error('Task instructions must be 2,000 characters or fewer.');
        setStatus(taskStatus, error.message, true);
        throw error;
      }

      isRunningTask = true;
      updateRunButton();
      runButton.textContent = '◌ MAYA is working…';
      $('maya-fa-clear').disabled = true;
      $('maya-fa-speak').disabled = true;
      $('maya-fa-download').disabled = true;
      resultSection.classList.add('maya-fa-hidden');
      setStatus(taskStatus, 'MAYA is analyzing the selected files and preparing your result…');

      try {
        const data = await apiRequest('/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileIds, instruction })
        });

        lastResult = typeof data.result === 'string' ? data.result.trim() : '';
        if (!lastResult) throw new Error('MAYA returned an empty result. Try a more specific instruction.');

        resultContent.textContent = lastResult;
        resultSection.classList.remove('maya-fa-hidden');
        $('maya-fa-speak').disabled = false;
        $('maya-fa-download').disabled = false;
        setStatus(taskStatus, 'Task completed. Review or download MAYA’s result below.');
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return lastResult;
      } catch (error) {
        setStatus(taskStatus, error.message, true);
        throw error;
      } finally {
        isRunningTask = false;
        runButton.textContent = '✦ Run task';
        $('maya-fa-clear').disabled = false;
        updateRunButton();
      }
    }

    // ------------------------------------------------------
    // Read result with the browser speech engine
    // ------------------------------------------------------
    function speakResult() {
      if (!lastResult) {
        setStatus(taskStatus, 'There is no result to read yet.', true);
        return;
      }

      if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
        setStatus(taskStatus, 'Speech output is not supported in this browser.', true);
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(lastResult.slice(0, 12000));

      const voiceSelect = document.getElementById('voice-select');
      const voices = window.speechSynthesis.getVoices();
      const selectedVoice = voices.find((voice) => voice.name === voiceSelect?.value);
      if (selectedVoice) utterance.voice = selectedVoice;

      const rateControl = document.getElementById('voice-rate');
      const pitchControl = document.getElementById('voice-pitch');
      utterance.rate = Number(rateControl?.value) || 0.94;
      utterance.pitch = Number(pitchControl?.value) || 0.94;

      window.speechSynthesis.speak(utterance);
    }

    // ------------------------------------------------------
    // Download result as Markdown
    // ------------------------------------------------------
    function downloadResult() {
      if (!lastResult) {
        setStatus(taskStatus, 'There is no result to download yet.', true);
        return;
      }

      const blob = new Blob([lastResult], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `maya-result-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ------------------------------------------------------
    // Event listeners
    // ------------------------------------------------------
    openButton?.addEventListener('click', () => setWorkspaceOpen(true));
    $('maya-fa-back').addEventListener('click', () => setWorkspaceOpen(false));
    uploadButton.addEventListener('click', uploadSelectedFiles);
    runButton.addEventListener('click', () => runTask().catch(() => {}));
    $('maya-fa-speak').addEventListener('click', speakResult);
    $('maya-fa-download').addEventListener('click', downloadResult);

    $('maya-fa-clear').addEventListener('click', () => {
      taskInput.value = '';
      lastResult = '';
      resultContent.textContent = '';
      resultSection.classList.add('maya-fa-hidden');
      setStatus(taskStatus, 'Task prompt cleared. Uploaded files are still available.');
    });

    root.querySelectorAll('[data-task]').forEach((button) => {
      button.addEventListener('click', () => {
        taskInput.value = button.dataset.task || '';
        taskInput.focus();
      });
    });

    fileInput.addEventListener('change', () => {
      const count = fileInput.files?.length || 0;
      if (count) setStatus(uploadStatus, `${count} file(s) selected. Click Upload files to continue.`);
    });

    // Allow drag-and-drop onto the styled upload area.
    ['dragenter', 'dragover'].forEach((eventName) => {
      dropArea.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropArea.classList.add('is-dragging');
      });
    });
    ['dragleave', 'drop'].forEach((eventName) => {
      dropArea.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropArea.classList.remove('is-dragging');
      });
    });
    dropArea.addEventListener('drop', (event) => {
      const files = event.dataTransfer?.files;
      if (!files?.length) return;
      fileInput.files = files;
      setStatus(uploadStatus, `${files.length} file(s) selected. Click Upload files to continue.`);
    });

    // Initial empty state.
    renderFiles();

    // Public API for integration with the existing voice assistant.
    window.MAYAFileAssistant = Object.freeze({
      open: () => setWorkspaceOpen(true),
      close: () => setWorkspaceOpen(false),
      runTask: (instruction) => runTask(instruction),
      getUploadedFiles: () => uploadedFiles.map(({ id, originalName, size }) => ({ id, originalName, size })),
      stopSpeaking: () => window.speechSynthesis?.cancel()
    });

    console.info('✦ MAYA File Intelligence initialized.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMayaFileAssistant, { once: true });
  } else {
    initializeMayaFileAssistant();
  }
})();
