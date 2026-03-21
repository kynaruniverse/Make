/**
 * MAKÉ FEATURES — onboarding.js (V1)
 *
 * First-run experience shown to new users on first launch of app.html.
 * Shows a welcoming explanation of:
 *   1. What Maké is
 *   2. Where data is stored and who can see it (nobody)
 *   3. How the auto-backup protects their data
 *   4. Prompts them to choose a backup file location
 *
 * The backup file picker is the critical step — once they pick a folder,
 * auto-backups run silently every 10 saves giving native-app-level safety.
 *
 * Only shown once. State stored in localStorage under 'make_onboarded'.
 */

import { requestPersistence, writeBackupFile } from '../core/storage.js';

const ONBOARDED_KEY = 'make_onboarded';

/** Returns true if the user has completed onboarding. */
export function hasOnboarded() {
  return localStorage.getItem(ONBOARDED_KEY) === '1';
}

/** Mark onboarding complete. */
function markOnboarded() {
  localStorage.setItem(ONBOARDED_KEY, '1');
}

/**
 * showOnboarding()
 * Renders the full-screen onboarding overlay.
 * Resolves when the user completes or skips.
 */
export function showOnboarding() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.innerHTML = `
      <div class="ob-wrap">

        <!-- Slide 1: Welcome -->
        <div class="ob-slide active" data-slide="1">
          <div class="ob-logo">Maké</div>
          <div class="ob-emoji">👋</div>
          <h2 class="ob-title">Welcome to Maké</h2>
          <p class="ob-body">
            Your personal command center for notes, code snippets, links
            and sticky notes — all in one beautiful place.
          </p>
          <p class="ob-body" style="margin-top:10px">
            Before you start, we want to be upfront about something
            important: <strong>where your data lives, and who can see it.</strong>
          </p>
          <button class="ob-btn-primary" data-next="2">Next →</button>
        </div>

        <!-- Slide 2: Privacy -->
        <div class="ob-slide" data-slide="2">
          <div class="ob-emoji">🔒</div>
          <h2 class="ob-title">Your data stays<br>on your device</h2>
          <div class="ob-privacy-cards">
            <div class="ob-pcard">
              <span class="ob-pcard-icon">📱</span>
              <div>
                <strong>Stored only on this device</strong><br>
                Everything you write is saved in a private database on your phone or computer. It never gets sent to any server.
              </div>
            </div>
            <div class="ob-pcard">
              <span class="ob-pcard-icon">🚫</span>
              <div>
                <strong>Nobody else can see it</strong><br>
                Not us, not anyone. We have no server, no account system, no way to access your notes even if we wanted to.
              </div>
            </div>
            <div class="ob-pcard">
              <span class="ob-pcard-icon">📴</span>
              <div>
                <strong>Works completely offline</strong><br>
                Once loaded, Maké works without any internet connection. Your notes are always available.
              </div>
            </div>
          </div>
          <button class="ob-btn-primary" data-next="3">Next →</button>
          <button class="ob-btn-ghost" data-next="1">← Back</button>
        </div>

        <!-- Slide 3: Backup -->
        <div class="ob-slide" data-slide="3">
          <div class="ob-emoji">💾</div>
          <h2 class="ob-title">Set up your<br>backup file</h2>
          <p class="ob-body">
            Because everything lives on your device, we want to make sure
            it's safe. Maké can automatically save a backup file to your
            phone or computer — somewhere <em>you</em> choose.
          </p>
          <div class="ob-backup-explainer">
            <div class="ob-be-row">
              <span class="ob-be-icon">📁</span>
              <span>You pick a folder — Documents, iCloud, Google Drive, anywhere you like</span>
            </div>
            <div class="ob-be-row">
              <span class="ob-be-icon">🔄</span>
              <span>Maké updates the file automatically every 10 saves — completely silent</span>
            </div>
            <div class="ob-be-row">
              <span class="ob-be-icon">♻️</span>
              <span>If anything ever goes wrong, tap "Restore from backup" to get everything back instantly</span>
            </div>
          </div>
          <button class="ob-btn-primary" id="ob-backup-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Choose backup location
          </button>
          <button class="ob-btn-ghost" id="ob-skip-backup-btn">Skip for now — I'll do this later</button>
          <button class="ob-btn-ghost" data-next="2" style="margin-top:4px">← Back</button>
        </div>

        <!-- Slide 4: Done -->
        <div class="ob-slide" data-slide="4">
          <div class="ob-emoji">🚀</div>
          <h2 class="ob-title">You're all set!</h2>
          <p class="ob-body">
            Your notes are private, protected and backed up.
            Maké is ready to use.
          </p>
          <div class="ob-tips">
            <div class="ob-tip"><span>💡</span><span>Tap <strong>+</strong> to create your first note, code snippet, link or sticky</span></div>
            <div class="ob-tip"><span>⭐</span><span>Long-press any card to edit, duplicate or favourite it</span></div>
            <div class="ob-tip"><span>⌘K</span><span>Use Ctrl+K (or ⌘K on Mac) to search everything instantly</span></div>
          </div>
          <button class="ob-btn-primary" id="ob-done-btn">Start using Maké</button>
        </div>

        <!-- Progress dots -->
        <div class="ob-dots">
          <span class="ob-dot active" data-dot="1"></span>
          <span class="ob-dot" data-dot="2"></span>
          <span class="ob-dot" data-dot="3"></span>
          <span class="ob-dot" data-dot="4"></span>
        </div>

      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('ob-visible'));

    // ── Navigation ──────────────────────────────────────────
    function goTo(n) {
      overlay.querySelectorAll('.ob-slide').forEach(s => {
        s.classList.toggle('active', +s.dataset.slide === n);
      });
      overlay.querySelectorAll('.ob-dot').forEach(d => {
        d.classList.toggle('active', +d.dataset.dot === n);
      });
    }

    overlay.querySelectorAll('[data-next]').forEach(btn => {
      btn.addEventListener('click', () => goTo(+btn.dataset.next));
    });

    // ── Backup button ────────────────────────────────────────
    document.getElementById('ob-backup-btn').addEventListener('click', async () => {
      const btn = document.getElementById('ob-backup-btn');
      btn.textContent = 'Choosing location…';
      btn.disabled = true;

      // Request persistence first
      await requestPersistence();

      // Trigger the file picker (empty array — no existing items yet)
      const ok = await writeBackupFile([], true);

      if (ok !== false) {
        btn.innerHTML = '✓ Backup location saved!';
        btn.style.background = '#4caf7a';
        setTimeout(() => goTo(4), 900);
      } else {
        // User cancelled
        btn.disabled = false;
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Choose backup location`;
      }
    });

    // ── Skip backup ──────────────────────────────────────────
    document.getElementById('ob-skip-backup-btn').addEventListener('click', async () => {
      await requestPersistence(); // still request persistence even if they skip file backup
      goTo(4);
    });

    // ── Done ─────────────────────────────────────────────────
    document.getElementById('ob-done-btn').addEventListener('click', () => {
      markOnboarded();
      overlay.classList.remove('ob-visible');
      setTimeout(() => { overlay.remove(); resolve(); }, 400);
    });
  });
}

/**
 * resetOnboarding()
 * Clears the onboarded flag so the welcome screen shows again on next call
 * to showOnboarding(). Called from the Settings modal "Show welcome screen again" button.
 * No page reload needed — showOnboarding() can be called directly after this.
 */
export function resetOnboarding() {
  localStorage.removeItem(ONBOARDED_KEY);
}
