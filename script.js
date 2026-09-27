(function() {
            'use strict';

            // ─── DOM refs ───
            const editorTextarea = document.getElementById('codeEditor');
            const editorWrapper = document.getElementById('editorWrapper');
            const previewFrame = document.getElementById('previewFrame');
            const previewContainer = document.getElementById('previewContainer');
            const previewStatus = document.getElementById('previewStatus');
            const consoleOutput = document.getElementById('consoleOutput');
            const runBtn = document.getElementById('runBtn');
            const clearBtn = document.getElementById('clearBtn');
            const clearConsoleBtn = document.getElementById('clearConsoleBtn');
            const toggleConsoleBtn = document.getElementById('toggleConsoleBtn');
            const downloadHtmlBtn = document.getElementById('downloadHtmlBtn');
            const downloadZipBtn = document.getElementById('downloadZipBtn');
            const resizeHandle = document.getElementById('resizeHandle');
            const mainContainer = document.getElementById('mainContainer');
            const consolePanel = document.getElementById('consolePanel');

            // ─── State ───
            let currentMode = 'html';
            let editor = null;
            let updateTimer = null;
            let isConsoleVisible = true;
            let consoleEntries = [];
            let isResizing = false;

            // ─── Default code ───
            const DEFAULT_HTML = `<div class="container">
            <h1>Hello, World!</h1>
            <p>Edit this code to see live changes.</p>
            <button id="clickBtn">Click me</button>
          </div>`;

            const DEFAULT_CSS = `body {
            font-family: system-ui, sans-serif;
            background: #f0f0f5;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
          }
          .container {
            background: #fff;
            padding: 2.5rem 3rem;
            border-radius: 1.5rem;
            box-shadow: 0 12px 40px rgba(0,0,0,0.08);
            text-align: center;
            max-width: 420px;
          }
          h1 {
            color: #1e1e2e;
            font-size: 1.8rem;
            margin-bottom: 0.5rem;
          }
          p {
            color: #5a5a7a;
            margin-bottom: 1.5rem;
          }
          button {
            background: #7c3aed;
            border: none;
            color: #fff;
            padding: 0.6rem 2rem;
            border-radius: 2rem;
            font-size: 1rem;
            cursor: pointer;
            transition: background 0.2s;
          }
          button:hover {
            background: #6d28d9;
          }`;

            const DEFAULT_JS = `document.getElementById('clickBtn')?.addEventListener('click', () => {
            console.log('Button clicked! 🎉');
            alert('Hello from your code!');
          });
          console.log('App started. ✨');`;

            // ─── Load from localStorage ───
            function loadStored() {
                try {
                    const html = localStorage.getItem('editor-html');
                    const css = localStorage.getItem('editor-css');
                    const js = localStorage.getItem('editor-js');
                    return {
                        html: html !== null ? html : DEFAULT_HTML,
                        css: css !== null ? css : DEFAULT_CSS,
                        js: js !== null ? js : DEFAULT_JS,
                    };
                } catch {
                    return { html: DEFAULT_HTML, css: DEFAULT_CSS, js: DEFAULT_JS };
                }
            }

            const stored = loadStored();

            // ─── Init CodeMirror ───
            function initEditor() {
                editor = CodeMirror.fromTextArea(editorTextarea, {
                    lineNumbers: true,
                    mode: 'htmlmixed',
                    theme: 'dracula',
                    matchBrackets: true,
                    autoCloseBrackets: true,
                    foldGutter: true,
                    gutters: ['CodeMirror-foldgutter', 'CodeMirror-linenumbers'],
                    extraKeys: {
                        'Ctrl-Enter': function() { runPreview(); },
                        'Cmd-Enter': function() { runPreview(); },
                        'Tab': function(cm) {
                            if (cm.somethingSelected()) {
                                cm.indentSelection('add');
                            } else {
                                cm.replaceSelection('  ', 'end');
                            }
                        },
                        'Shift-Tab': function(cm) {
                            cm.indentSelection('subtract');
                        },
                    },
                    indentUnit: 2,
                    tabSize: 2,
                    indentWithTabs: false,
                });

                // Set initial content
                const code = getCodeForMode(currentMode);
                editor.setValue(code);
                editor.refresh();

                // Auto-run on change (debounced)
                editor.on('change', function() {
                    saveCurrentCode();
                    schedulePreview();
                });

                // Handle editor focus
                editor.on('focus', function() {
                    // ensure the editor wrapper is visible
                });

                // Refresh after a tick
                setTimeout(() => editor.refresh(), 50);
            }

            // ─── Get code for current mode ───
            function getCodeForMode(mode) {
                const data = loadStored();
                switch (mode) {
                    case 'html':
                        return data.html;
                    case 'css':
                        return data.css;
                    case 'js':
                        return data.js;
                    default:
                        return '';
                }
            }

            // ─── Save current code to localStorage ───
            function saveCurrentCode() {
                if (!editor) return;
                const value = editor.getValue();
                const key = 'editor-' + currentMode;
                try {
                    localStorage.setItem(key, value);
                } catch (e) { /* ignore */ }
            }

            // ─── Switch editor mode ───
            function switchMode(mode) {
                if (mode === currentMode && editor) return;
                // Save current
                if (editor) {
                    saveCurrentCode();
                }
                currentMode = mode;
                // Update tabs
                document.querySelectorAll('.editor-tabs .tab').forEach(tab => {
                    tab.classList.toggle('active', tab.dataset.mode === mode);
                });
                // Update editor mode
                if (editor) {
                    let cmMode = 'htmlmixed';
                    if (mode === 'css') cmMode = 'css';
                    else if (mode === 'js') cmMode = 'javascript';
                    editor.setOption('mode', cmMode);
                    const code = getCodeForMode(mode);
                    editor.setValue(code);
                    editor.refresh();
                    // Focus
                    editor.focus();
                }
            }

            // ─── Build full HTML document ───
            function buildDocument(html, css, js) {
                return `<!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>${css}</style>
            </head>
            <body>
              ${html}
              <script>
                (function() {
                  // Console capture via postMessage
                  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
                  const methods = ['log','info','warn','error','debug'];
                  methods.forEach(m => {
                    console[m] = function(...args) {
                      try {
                        const serialized = args.map(arg => {
                          if (arg === undefined) return 'undefined';
                          if (arg === null) return 'null';
                          if (typeof arg === 'object') {
                            try { return JSON.stringify(arg); } catch { return String(arg); }
                          }
                          return String(arg);
                        });
                        window.parent.postMessage({ type: 'console', method: m, args: serialized }, '*');
                      } catch (_) {}
                      original[m].apply(console, args);
                    };
                  });
                  window.addEventListener('error', function(e) {
                    window.parent.postMessage({
                      type: 'console',
                      method: 'error',
                      args: [e.message + ' at ' + e.filename + ':' + e.lineno]
                    }, '*');
                  });
                  window.addEventListener('unhandledrejection', function(e) {
                    window.parent.postMessage({
                      type: 'console',
                      method: 'error',
                      args: ['Unhandled Promise rejection: ' + (e.reason || '')]
                    }, '*');
                  });
                })();
              <\/script>
              <script>${js}<\/script>
            </body>
            </html>`;
            }

            // ─── Run preview ───
            function runPreview() {
                if (!editor) return;
                saveCurrentCode();
                const data = loadStored();
                const html = data.html;
                const css = data.css;
                const js = data.js;

                const doc = buildDocument(html, css, js);
                try {
                    previewFrame.srcdoc = doc;
                    previewStatus.textContent = '● running';
                    previewStatus.className = 'status ok';
                } catch (e) {
                    previewStatus.textContent = '✕ error';
                    previewStatus.className = 'status';
                    console.error('Preview error:', e);
                }
            }

            // ─── Schedule preview (debounced) ───
            function schedulePreview() {
                clearTimeout(updateTimer);
                updateTimer = setTimeout(() => {
                    runPreview();
                }, 400);
            }

            // ─── Clear all code ───
            function clearAll() {
                if (!editor) return;
                if (!confirm('Clear all code? This cannot be undone.')) return;
                const empty = '';
                localStorage.setItem('editor-html', empty);
                localStorage.setItem('editor-css', empty);
                localStorage.setItem('editor-js', empty);
                editor.setValue(empty);
                runPreview();
                showToast('Cleared all code', 'info');
            }

            // ─── Console: capture messages from iframe ───
            function handleConsoleMessage(data) {
                const allowedMethods = ['log', 'info', 'warn', 'error', 'debug'];
                if (!data || data.type !== 'console' ||
                    !allowedMethods.includes(data.method) || !Array.isArray(data.args)) return;
                const { method, args } = data;
                const msg = args.join(' ');
                const entry = { method, msg, args, timestamp: Date.now() };
                consoleEntries.push(entry);
                renderConsole();
            }

            // ─── Render console ───
            function renderConsole() {
                if (consoleEntries.length === 0) {
                    consoleOutput.innerHTML = `<div class="empty">⏎ Console output will appear here …</div>`;
                    return;
                }
                let html = '';
                for (const entry of consoleEntries) {
                    const badge = entry.method;
                    const colorClass = badge;
                    // Format args with basic highlighting
                    let msgHtml = entry.args.map(arg => {
                        if (typeof arg === 'string') {
                            // Try to detect if it looks like JSON
                            if (arg.startsWith('{') || arg.startsWith('[')) {
                                try {
                                    JSON.parse(arg);
                                    return `<span class="object">${escapeHtml(arg)}</span>`;
                                } catch (_) {}
                            }
                            return `<span class="string">"${escapeHtml(arg)}"</span>`;
                        }
                        if (typeof arg === 'number') return `<span class="number">${arg}</span>`;
                        if (typeof arg === 'boolean') return `<span class="boolean">${arg}</span>`;
                        if (arg === 'undefined') return `<span class="undefined">undefined</span>`;
                        if (arg === 'null') return `<span class="null">null</span>`;
                        return escapeHtml(String(arg));
                    }).join(' ');
                    html += `<div class="entry">
                <span class="badge ${colorClass}">${badge}</span>
                <span class="msg">${msgHtml}</span>
              </div>`;
                }
                consoleOutput.innerHTML = html;
                consoleOutput.scrollTop = consoleOutput.scrollHeight;
            }

            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            // ─── Clear console ───
            function clearConsole() {
                consoleEntries = [];
                renderConsole();
            }

            // ─── Toast notifications ───
            function showToast(message, type = 'info') {
                const container = document.getElementById('toastContainer');
                const toast = document.createElement('div');
                toast.className = `toast ${type}`;
                toast.textContent = message;
                container.appendChild(toast);
                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transition = 'opacity 0.3s';
                    setTimeout(() => toast.remove(), 300);
                }, 3000);
            }

            // ─── Download as HTML ───
            function downloadHtml() {
                const data = loadStored();
                const doc = buildDocument(data.html, data.css, data.js);
                const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'project.html';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('Downloaded as HTML', 'success');
            }

            // ─── Download as ZIP ───
            function downloadZip() {
                const data = loadStored();
                if (typeof JSZip === 'undefined') {
                    showToast('JSZip library not loaded', 'error');
                    return;
                }
                const zip = new JSZip();
                zip.file('index.html', buildDocument(data.html, data.css, data.js));
                zip.file('style.css', data.css);
                zip.file('script.js', data.js);
                zip.generateAsync({ type: 'blob' }).then(function(blob) {
                    saveAs(blob, 'project.zip');
                    showToast('Downloaded as ZIP', 'success');
                }).catch(function(err) {
                    showToast('Error creating ZIP: ' + err.message, 'error');
                });
            }

            // ─── Preview size controls ───
            function setPreviewSize(size) {
                const container = previewContainer;
                container.className = 'preview-container size-' + size;
                document.querySelectorAll('.size-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.size === size);
                });
            }

            // ─── Toggle console ───
            function toggleConsole() {
                isConsoleVisible = !isConsoleVisible;
                consolePanel.style.display = isConsoleVisible ? 'flex' : 'none';
                toggleConsoleBtn.textContent = isConsoleVisible ? '⎚ Console' : '⎚ Show Console';
                // Refresh editor
                if (editor) setTimeout(() => editor.refresh(), 100);
            }

            // ─── Resize drag ───
            function initResize() {
                let startX, startY, startWidth, startHeight, isHorizontal;

                resizeHandle.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    const rect = mainContainer.getBoundingClientRect();
                    const isMobile = window.innerWidth <= 768;
                    isHorizontal = !isMobile;

                    if (isHorizontal) {
                        startX = e.clientX;
                        startWidth = document.getElementById('editorPanel').offsetWidth;
                    } else {
                        startY = e.clientY;
                        startHeight = document.getElementById('editorPanel').offsetHeight;
                    }
                    isResizing = true;
                    resizeHandle.classList.add('active');
                    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
                    document.body.style.userSelect = 'none';
                });

                document.addEventListener('mousemove', function(e) {
                    if (!isResizing) return;
                    const isMobile = window.innerWidth <= 768;
                    const containerWidth = mainContainer.offsetWidth;
                    const containerHeight = mainContainer.offsetHeight;

                    if (isMobile) {
                        // Vertical resize
                        const delta = e.clientY - startY;
                        const newHeight = Math.max(150, Math.min(containerHeight - 150, startHeight + delta));
                        document.getElementById('editorPanel').style.flex = '0 0 ' + newHeight + 'px';
                    } else {
                        // Horizontal resize
                        const delta = e.clientX - startX;
                        const newWidth = Math.max(200, Math.min(containerWidth - 200, startWidth + delta));
                        document.getElementById('editorPanel').style.flex = '0 0 ' + newWidth + 'px';
                    }
                });

                document.addEventListener('mouseup', function() {
                    if (isResizing) {
                        isResizing = false;
                        resizeHandle.classList.remove('active');
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                        if (editor) setTimeout(() => editor.refresh(), 50);
                    }
                });
            }

            // ─── Keyboard shortcuts ───
            document.addEventListener('keydown', function(e) {
                // Ctrl+Enter / Cmd+Enter
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    runPreview();
                }
                // Ctrl+S to save (and run)
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    saveCurrentCode();
                    runPreview();
                    showToast('Saved & ran', 'success');
                }
            });

            // ─── Message listener for console ───
            window.addEventListener('message', function(e) {
                if (e.source !== previewFrame.contentWindow) return;
                try {
                    const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                    if (data && data.type === 'console') {
                        handleConsoleMessage(data);
                    }
                } catch (_) { /* ignore non-JSON messages */ }
            });

            // ─── Tab switching ───
            document.querySelectorAll('.editor-tabs .tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    const mode = this.dataset.mode;
                    switchMode(mode);
                });
            });

            // ─── Init ───
            function init() {
                initEditor();

                // Set initial mode to HTML
                switchMode('html');

                // Run preview after a short delay
                setTimeout(() => {
                    runPreview();
                }, 300);

                // Load preview size from localStorage
                const savedSize = localStorage.getItem('preview-size') || 'desktop';
                setPreviewSize(savedSize);

                // Console visibility
                const savedConsole = localStorage.getItem('console-visible');
                if (savedConsole === 'false') {
                    isConsoleVisible = false;
                    consolePanel.style.display = 'none';
                    toggleConsoleBtn.textContent = '⎚ Show Console';
                }

                // ─── Event listeners ───
                runBtn.addEventListener('click', function() {
                    saveCurrentCode();
                    runPreview();
                });

                clearBtn.addEventListener('click', clearAll);

                clearConsoleBtn.addEventListener('click', clearConsole);

                toggleConsoleBtn.addEventListener('click', function() {
                    toggleConsole();
                    localStorage.setItem('console-visible', String(isConsoleVisible));
                });

                document.querySelectorAll('.size-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const size = this.dataset.size;
                        setPreviewSize(size);
                        localStorage.setItem('preview-size', size);
                    });
                });

                downloadHtmlBtn.addEventListener('click', downloadHtml);
                downloadZipBtn.addEventListener('click', downloadZip);

                // Resize
                initResize();

                // Handle window resize
                window.addEventListener('resize', function() {
                    if (editor) setTimeout(() => editor.refresh(), 100);
                });

                // Handle iframe load
                previewFrame.addEventListener('load', function() {
                    previewStatus.textContent = '● loaded';
                    previewStatus.className = 'status ok';
                });

                // Auto-run on first load
                setTimeout(() => {
                    if (previewFrame.srcdoc === '') {
                        runPreview();
                    }
                }, 500);

                // Click on preview to focus editor
                previewFrame.addEventListener('click', function() {
                    if (editor) editor.focus();
                });

                showToast('✨ Code Studio ready', 'info');
            }

            // ─── Run when DOM ready ───
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', init);
            } else {
                init();
            }

            // Expose some functions for debugging
            window.__editor = {
                runPreview,
                switchMode,
                setPreviewSize,
                clearConsole,
                getCode: () => loadStored(),
                setCode: (html, css, js) => {
                    if (html !== undefined) localStorage.setItem('editor-html', html);
                    if (css !== undefined) localStorage.setItem('editor-css', css);
                    if (js !== undefined) localStorage.setItem('editor-js', js);
                    if (editor) {
                        editor.setValue(getCodeForMode(currentMode));
                        runPreview();
                    }
                }
            };

        })();
