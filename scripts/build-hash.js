#!/usr/bin/env node

/**
 * scripts/build-hash.js
 *
 * Optional deploy helper.  Computes a short hash from the contents of all
 * cached app files, then writes it into service-worker.js so the cache name
 * changes automatically on every deploy — no manual version bump needed.
 *
 * Usage:
 *   node scripts/build-hash.js          # run from the project root
 *
 * What it does:
 *   1. Reads every file listed in PRECACHE (same list as in service-worker.js).
 *   2. Computes a SHA-256 of their combined contents.
 *   3. Replaces the literal string  __BUILD_HASH__  in service-worker.js
 *      with the first 8 hex characters of that hash.
 *
 * Run this as a post-deploy step (e.g. in a GitHub Actions workflow or a
 * simple Makefile target) before you copy files to your server.
 *
 * No npm dependencies — uses only Node built-ins (fs, crypto, path).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

const PRECACHE_FILES = [
  'index.html',
  'styles.css',
  'manifest.json',
  'app.js',
  'core/schema.js',
  'core/state.js',
  'core/storage.js',
  'utils/helpers.js',
  'utils/rich-text.js',
  'utils/syntax.js',
  'utils/drag.js',
  'utils/resize.js',
  'ui/cards.js',
  'ui/stickies.js',
  'ui/note-editor.js',
  'ui/code-editor.js',
  'ui/modals.js',
  'features/ambient.js',
  'features/data.js',
  'features/drawer.js',
  'features/search.js',
  'features/sort-menu.js',
];

// Compute combined hash.
const hash = crypto.createHash('sha256');
for (const rel of PRECACHE_FILES) {
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs)) {
    hash.update(fs.readFileSync(abs));
  } else {
    console.warn(`  [warn] not found: ${rel}`);
  }
}
const digest = hash.digest('hex').slice(0, 8);
const swPath = path.join(ROOT, 'service-worker.js');
let swSrc = fs.readFileSync(swPath, 'utf8');

// Replace both the placeholder and any previous hash.
swSrc = swSrc.replace(
  /const BUILD_HASH = typeof __BUILD_HASH__[^;]+;/,
  `const BUILD_HASH = '${digest}';`
);
swSrc = swSrc.replace(/__BUILD_HASH__/g, digest);

fs.writeFileSync(swPath, swSrc, 'utf8');
console.log(`[build-hash] Cache version: make-${digest}`);