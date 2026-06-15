#!/usr/bin/env node
/**
 * test-server.js — Tiny static file server for Playwright test fixtures.
 * Serves the project root so fixtures can reference:
 *   /prompts.js, /content.js, /styles.css, /tests/fixtures/...
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.TEST_PORT || 4321;
const ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  const urlPath = new URL(req.url, 'http://localhost').pathname;

  // Normalise — strip leading slash and resolve safely
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(ROOT, safe);

  // Security: only serve files under ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Test server on http://localhost:${PORT}  (root: ${ROOT})`);
});

// Graceful shutdown
process.on('SIGINT', () => { server.close(); process.exit(); });
process.on('SIGTERM', () => { server.close(); process.exit(); });
