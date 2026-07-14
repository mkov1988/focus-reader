import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const docsDir = path.join(projectRoot, 'docs', 'native-parity');
const outputHtmlPath = path.join(projectRoot, 'public', 'parity-viewer.html');

console.log('Building Native Parity Viewer...');

try {
  // Read and sort markdown files in the docs/native-parity folder
  const files = fs.readdirSync(docsDir)
    .filter(file => file.endsWith('.md'))
    .sort();

  const documents = [];

  for (const file of files) {
    const filePath = path.join(docsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract ID (e.g., "00" from "00-INDEX.md")
    const id = file.split('-')[0];

    // Extract Title (first line starting with #)
    const lines = content.split('\n');
    let title = file;
    for (const line of lines) {
      if (line.trim().startsWith('#')) {
        title = line.replace('#', '').trim();
        break;
      }
    }

    documents.push({
      id,
      filename: file,
      title,
      content
    });
  }

  console.log(`Found ${documents.length} markdown documents.`);

  // HTML Template for the viewer
  const htmlTemplate = `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Focus Reader - Native Parity Tracker</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap" rel="stylesheet">
  <!-- Marked Markdown Parser CDN -->
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <!-- PrismJS syntax highlighting -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-typescript.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-bash.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-diff.min.js"></script>

  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#fdfbf7',
              100: '#f5ebd6',
              200: '#ebd9ba',
              500: '#8c6239',
              600: '#6c4a2a',
              700: '#54391e',
              800: '#3a2a1e',
              900: '#261b13',
            },
            sand: {
              50: '#fcfaf6',
              100: '#f3ebd6',
              200: '#ecdcb6',
              300: '#dec795',
              800: '#2b1e17',
              900: '#1a120e',
            }
          },
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
            serif: ['Fraunces', 'serif'],
          }
        }
      }
    }
  </script>
  <style>
    body {
      font-family: 'Inter', sans-serif;
    }
    .serif-title {
      font-family: 'Fraunces', serif;
    }
    /* Style task checkboxes inside markdown lists */
    li:has(input[type="checkbox"]) {
      display: flex;
      align-items: flex-start;
      list-style-type: none;
      margin-left: -1.25rem !important;
    }
    /* Styling Prism code blocks inside prose */
    pre[class*="language-"] {
      border-radius: 0.5rem;
      margin: 1.5rem 0;
      background: #27201b !important;
    }
    code[class*="language-"] {
      font-size: 0.875rem !important;
    }
  </style>
</head>
<body class="h-full bg-sand-50 text-sand-900 dark:bg-sand-900 dark:text-sand-100 transition-colors duration-200">
  <div class="h-full flex overflow-hidden" id="app">
    <!-- Sidebar / Drawer -->
    <div :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'" class="fixed inset-y-0 left-0 z-40 w-80 -translate-x-full bg-brand-100 border-r border-brand-200 dark:bg-brand-900 dark:border-brand-800 transition-transform duration-300 md:relative md:translate-x-0 flex flex-col h-full flex-shrink-0">
      <!-- Sidebar Header -->
      <div class="p-4 border-b border-brand-200 dark:border-brand-800 flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 rounded-lg bg-brand-800 flex items-center justify-center text-brand-100 font-bold serif-title">F</div>
          <div>
            <h1 class="text-sm font-bold tracking-tight text-brand-800 dark:text-brand-100">Focus Reader</h1>
            <p class="text-xs text-brand-600 dark:text-brand-300">Native Parity Tracker</p>
          </div>
        </div>
        <!-- Close Button (Mobile Only) -->
        <button onclick="toggleSidebar(false)" class="md:hidden p-1.5 rounded-lg hover:bg-brand-200 dark:hover:bg-brand-800">
          <svg class="w-5 h-5 text-brand-800 dark:text-brand-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Navigation List -->
      <nav class="flex-1 overflow-y-auto p-4 space-y-1" id="doc-nav">
        <!-- JS will populate list items -->
      </nav>
      
      <!-- Reset Button / Meta -->
      <div class="p-4 border-t border-brand-200 dark:border-brand-800 bg-brand-100/50 dark:bg-brand-900/30 text-xs flex justify-between items-center text-brand-700 dark:text-brand-200">
        <span>App IP: 10.0.0.199</span>
        <button onclick="resetProgress()" class="hover:text-red-500 font-medium underline">Reset Progress</button>
      </div>
    </div>

    <!-- Backdrop for Mobile Sidebar -->
    <div id="backdrop" onclick="toggleSidebar(false)" class="fixed inset-0 bg-black/40 z-30 hidden md:hidden"></div>

    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Top Navbar -->
      <header class="h-16 border-b border-brand-200 bg-sand-50/80 backdrop-blur-md dark:border-brand-800 dark:bg-sand-900/80 sticky top-0 z-20 px-4 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <!-- Sidebar Toggle -->
          <button onclick="toggleSidebar(true)" class="md:hidden p-2 -ml-2 rounded-lg hover:bg-brand-200 dark:hover:bg-brand-800">
            <svg class="w-6 h-6 text-brand-800 dark:text-brand-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          <h2 id="active-title" class="text-base font-bold serif-title text-brand-800 dark:text-brand-100 truncate max-w-xs sm:max-w-md md:max-w-xl">Loading...</h2>
        </div>

        <!-- Toolbar Options -->
        <div class="flex items-center space-x-2">
          <!-- Dark Mode Toggle -->
          <button onclick="toggleDarkMode()" class="p-2 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-800 text-brand-800 dark:text-brand-100">
            <!-- Moon Icon -->
            <svg id="moon-icon" class="w-5 h-5 hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
            <!-- Sun Icon -->
            <svg id="sun-icon" class="w-5 h-5 hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          </button>
        </div>
      </header>

      <!-- Main Content Scroll Container -->
      <main class="flex-1 overflow-y-auto px-4 py-6 md:px-8 max-w-4xl w-full mx-auto" id="content-container">
        <!-- Progress Info Panel -->
        <div id="progress-panel" class="mb-6 p-4 rounded-xl border border-brand-200 bg-brand-100 dark:border-brand-800 dark:bg-brand-900/20 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
          <div>
            <h3 class="text-sm font-semibold text-brand-900 dark:text-brand-100">Package Progress</h3>
            <p id="progress-text" class="text-xs text-brand-700 dark:text-brand-200">0 of 0 tasks completed (0%)</p>
          </div>
          <div class="w-full sm:w-48 bg-brand-200 dark:bg-brand-800 h-2 rounded-full overflow-hidden">
            <div id="progress-bar" class="bg-brand-600 dark:bg-brand-500 h-full rounded-full transition-all duration-300" style="width: 0%"></div>
          </div>
        </div>

        <!-- Markdown Render Output -->
        <article id="markdown-output" class="prose max-w-none prose-sm sm:prose-base dark:prose-invert prose-headings:font-serif prose-headings:text-brand-800 dark:prose-headings:text-brand-100 prose-a:text-brand-600 dark:prose-a:text-brand-400 prose-code:text-brand-900 dark:prose-code:text-brand-200 prose-pre:p-0">
          <!-- Rendered Markdown goes here -->
        </article>
      </main>
    </div>
  </div>

  <script>
    // Embedded Markdown data
    const DOCS = ${JSON.stringify(documents)};

    let currentDocId = localStorage.getItem('parity-current-doc') || '00';
    let sidebarOpen = false;

    // Initialize App
    function init() {
      // Set Theme
      const savedTheme = localStorage.getItem('parity-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      setTheme(savedTheme);

      // Render Sidebar
      renderSidebar();

      // Render Active Document
      selectDoc(currentDocId);
    }

    function toggleDarkMode() {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'light' : 'dark');
    }

    function setTheme(theme) {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.getElementById('sun-icon').classList.remove('hidden');
        document.getElementById('moon-icon').classList.add('hidden');
      } else {
        document.documentElement.classList.remove('dark');
        document.getElementById('moon-icon').classList.remove('hidden');
        document.getElementById('sun-icon').classList.add('hidden');
      }
      localStorage.setItem('parity-theme', theme);
    }

    function toggleSidebar(open) {
      sidebarOpen = open;
      const sidebar = document.querySelector('#app > div:first-child');
      const backdrop = document.getElementById('backdrop');
      
      if (open) {
        sidebar.classList.remove('-translate-x-full');
        sidebar.classList.add('translate-x-0');
        backdrop.classList.remove('hidden');
      } else {
        sidebar.classList.add('-translate-x-full');
        sidebar.classList.remove('translate-x-0');
        backdrop.classList.add('hidden');
      }
    }

    function renderSidebar() {
      const nav = document.getElementById('doc-nav');
      nav.innerHTML = '';

      DOCS.forEach(doc => {
        const stats = getDocChecklistStats(doc.id, doc.content);
        const hasChecklist = stats.total > 0;
        const progressPercentage = hasChecklist ? Math.round((stats.completed / stats.total) * 100) : 0;
        const isSelected = doc.id === currentDocId;

        // Build side link
        const btn = document.createElement('button');
        btn.className = \`w-full text-left p-3 rounded-xl flex items-center justify-between transition-colors \${
          isSelected 
            ? 'bg-brand-500 text-white shadow-sm' 
            : 'hover:bg-brand-200/60 text-brand-800 dark:text-brand-200 dark:hover:bg-brand-800/40'
        }\`;
        btn.onclick = () => {
          selectDoc(doc.id);
          toggleSidebar(false);
        };

        // Text labels
        const textWrapper = document.createElement('div');
        textWrapper.className = 'truncate pr-2';
        
        const label = document.createElement('div');
        label.className = \`text-xs font-semibold uppercase tracking-wider \${isSelected ? 'text-brand-100' : 'text-brand-500 dark:text-brand-400'}\`;
        label.innerText = doc.id === '00' ? 'Index' : \`Package \${doc.id}\`;
        
        const title = document.createElement('div');
        title.className = 'text-sm font-medium truncate';
        title.innerText = doc.id === '00' ? doc.title : doc.title.split(':').pop().trim();
        
        textWrapper.appendChild(label);
        textWrapper.appendChild(title);

        btn.appendChild(textWrapper);

        // Progress text (no callout pill)
        if (hasChecklist) {
          const pill = document.createElement('span');
          pill.className = \`text-xs font-semibold ml-2 flex-shrink-0 \${
            isSelected
              ? 'text-brand-100'
              : progressPercentage === 100
                ? 'text-green-600 dark:text-green-400'
                : 'text-brand-500 dark:text-brand-400'
          }\`;
          pill.innerText = \`\${stats.completed}/\${stats.total}\`;
          btn.appendChild(pill);
        }

        nav.appendChild(btn);
      });
    }

    function getDocChecklistStats(docId, mdContent) {
      // Find all [ ] and [x] in the text
      const regex = /\\[([ xX])\\]/g;
      let total = 0;
      let completed = 0;
      let match;

      while ((match = regex.exec(mdContent)) !== null) {
        total++;
        const key = \`parity-\${docId}-task-\${total - 1}\`;
        const localVal = localStorage.getItem(key);
        if (localVal === 'true' || (localVal === null && match[1].toLowerCase() === 'x')) {
          completed++;
        }
      }
      return { total, completed };
    }

    function selectDoc(docId) {
      currentDocId = docId;
      localStorage.setItem('parity-current-doc', docId);

      const doc = DOCS.find(d => d.id === docId);
      if (!doc) return;

      // Update UI title
      document.getElementById('active-title').innerText = doc.title;

      // Highlight selected item in sidebar
      renderSidebar();

      // Render Markdown Content
      const output = document.getElementById('markdown-output');
      
      // Pre-process checkboxes
      let processedMarkdown = doc.content;
      let checkboxIndex = 0;
      
      // Replace [ ] and [x] in markdown with token placeholders
      processedMarkdown = processedMarkdown.replace(/\\[ \\]/g, () => \`[CHECKBOX-EMPTY-\${checkboxIndex++}]\`);
      processedMarkdown = processedMarkdown.replace(/\\[[xX]\\]/g, () => \`[CHECKBOX-CHECKED-\${checkboxIndex++}]\`);

      // Render to HTML using marked
      let html = marked.parse(processedMarkdown);

      // Post-process HTML: replace tokens with styled checkboxes
      for (let i = 0; i < checkboxIndex; i++) {
        const key = \`parity-\${docId}-task-\${i}\`;
        // Load initial state from localStorage (or default to false)
        const isChecked = localStorage.getItem(key) === 'true';

        const checkboxHtml = \`<input type="checkbox" data-doc="\${docId}" data-idx="\${i}" \${isChecked ? 'checked' : ''} class="parity-task-checkbox w-5 h-5 mt-1 rounded border-brand-500 text-brand-600 focus:ring-brand-500 mr-2.5 cursor-pointer flex-shrink-0 transition-colors duration-200" />\`;
        
        html = html.replace(\`[CHECKBOX-EMPTY-\${i}]\`, checkboxHtml);
        html = html.replace(\`[CHECKBOX-CHECKED-\${i}]\`, checkboxHtml);
      }

      output.innerHTML = html;

      // Enable checklist event listeners
      const checkboxes = output.querySelectorAll('.parity-task-checkbox');
      checkboxes.forEach(cb => {
        cb.addEventListener('change', (e) => {
          const docId = cb.getAttribute('data-doc');
          const idx = cb.getAttribute('data-idx');
          const key = \`parity-\${docId}-task-\${idx}\`;
          
          localStorage.setItem(key, cb.checked);
          
          // Re-render stats & sidebar progress without refreshing document text
          updateProgressMeter(docId, doc.content);
          renderSidebar();
        });
      });

      // Update Progress Meter
      updateProgressMeter(docId, doc.content);

      // Trigger Prism syntax highlighting
      Prism.highlightAllUnder(output);

      // Scroll content area back to top
      document.getElementById('content-container').scrollTop = 0;
    }

    function updateProgressMeter(docId, mdContent) {
      const stats = getDocChecklistStats(docId, mdContent);
      const panel = document.getElementById('progress-panel');
      const text = document.getElementById('progress-text');
      const bar = document.getElementById('progress-bar');

      if (stats.total === 0) {
        panel.classList.add('hidden');
      } else {
        panel.classList.remove('hidden');
        const percentage = Math.round((stats.completed / stats.total) * 100);
        text.innerText = \`\${stats.completed} of \${stats.total} tasks completed (\${percentage}%)\`;
        bar.style.width = \`\${percentage}%\`;
      }
    }

    function resetProgress() {
      if (confirm('Are you sure you want to reset all checklist progress?')) {
        // Clear all localStorage entries starting with 'parity-'
        Object.keys(localStorage)
          .filter(key => key.startsWith('parity-') && !key.includes('current-doc') && !key.includes('theme'))
          .forEach(key => localStorage.removeItem(key));
        
        // Re-initialize active view
        selectDoc(currentDocId);
      }
    }

    // Run init on load
    window.addEventListener('DOMContentLoaded', init);
  </script>
</body>
</html>`;

  fs.writeFileSync(outputHtmlPath, htmlTemplate, 'utf8');
  console.log(`Success! Native Parity Viewer HTML written to ${outputHtmlPath}`);
  console.log('You can now start your dev server and visit http://10.0.0.199:5173/parity-viewer.html');
} catch (error) {
  console.error('Error generating Parity Viewer:', error);
  process.exit(1);
}
