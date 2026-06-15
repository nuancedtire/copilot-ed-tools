#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync('/tmp/copilot-chat-export.json', 'utf8'));
const outDir = '/tmp/chat-browser/';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'data.js'), 'window.CHAT_DATA = ' + JSON.stringify(data) + ';');

// Write JS to a separate file to avoid any escaping issues
const appJs = `
(function() {
  var D = window.CHAT_DATA;
  if (!D) { document.getElementById('stats').textContent = 'ERROR: No data'; return; }

  var activeIdx = null;

  document.getElementById('stats').innerHTML =
    '<strong>' + D.totalSidebarItems + '</strong> sidebar items · ' +
    '<strong>' + D.extracted + '</strong> conversations<br>' +
    '<strong>' + D.patientEncounters + '</strong> patient encounters · ' +
    '<strong>' + D.nonPatientChats + '</strong> non-clinical';
  document.getElementById('export-meta').textContent =
    'Exported: ' + new Date(D.exportedAt).toLocaleString();

  renderList();

  function renderList() {
    var search = document.getElementById('search').value.toLowerCase();
    var filter = document.getElementById('filter').value;
    var list = document.getElementById('conv-list');
    var html = '';

    for (var i = 0; i < D.conversations.length; i++) {
      var c = D.conversations[i];
      if (filter === 'patient' && !c.isPatientEncounter) continue;
      if (filter === 'other' && c.isPatientEncounter) continue;

      var haystack = (c.title + ' ' + c.messages.map(function(m) { return m.content; }).join(' ')).toLowerCase();
      if (search && haystack.indexOf(search) === -1) continue;

      var demo = '';
      if (c.patientInfo) {
        demo = (c.patientInfo.age || '?') + (c.patientInfo.gender ? c.patientInfo.gender.charAt(0).toUpperCase() : '');
      }
      var badge = c.isPatientEncounter ? 'Patient' : 'Other';
      var badgeClass = c.isPatientEncounter ? 'badge-patient' : 'badge-other';
      var activeClass = activeIdx === c.idx ? ' active' : '';

      html += '<div class="conv-item' + activeClass + '" data-idx="' + c.idx + '">' +
        '<div class="title">' + esc(c.title.substring(0, 100)) + '</div>' +
        '<div class="meta">' +
          (demo ? '<span>' + demo + '</span>' : '') +
          '<span>' + c.messageCount + ' msgs</span>' +
          '<span class="badge ' + badgeClass + '">' + badge + '</span>' +
        '</div></div>';
    }

    list.innerHTML = html || '<div style="padding:2em;text-align:center;color:var(--muted)">No conversations match</div>';
  }

  // Event delegation for sidebar clicks
  document.getElementById('conv-list').addEventListener('click', function(e) {
    var item = e.target.closest('.conv-item');
    if (!item) return;
    var idx = parseInt(item.getAttribute('data-idx'), 10);
    if (!isNaN(idx)) selectConv(idx);
  });

  // Event delegation for message expand clicks
  document.getElementById('messages').addEventListener('click', function(e) {
    var btn = e.target.closest('.msg-expand');
    if (!btn) return;
    var msgId = btn.getAttribute('data-msg-id');
    var el = document.getElementById(msgId);
    if (el) {
      el.classList.remove('collapsed');
      btn.style.display = 'none';
    }
  });

  window.selectConv = function(idx) {
    activeIdx = idx;
    var conv = null;
    for (var i = 0; i < D.conversations.length; i++) {
      if (D.conversations[i].idx === idx) { conv = D.conversations[i]; break; }
    }
    if (!conv) return;

    renderList();

    var h = '<h3>' + esc(conv.title.substring(0, 150)) + '</h3>';
    if (conv.isPatientEncounter && conv.patientInfo) {
      var parts = [];
      if (conv.patientInfo.age) parts.push(conv.patientInfo.age + 'yr');
      if (conv.patientInfo.gender) parts.push(conv.patientInfo.gender);
      if (conv.patientInfo.complaint) parts.push(conv.patientInfo.complaint.substring(0, 80));
      h += '<div class="patient-tag">' + parts.join(' - ') + '</div>';
    }
    h += '<div class="meta-line">' + conv.messageCount + ' messages · Score: ' + conv.classificationScore + '</div>';
    document.getElementById('main-header').innerHTML = h;

    var msgsHtml = '';
    for (var i = 0; i < conv.messages.length; i++) {
      var m = conv.messages[i];
      var isUser = m.role === 'user';
      var msgClass = isUser ? 'msg-user' : 'msg-assistant';
      var label = isUser ? 'You' : 'Copilot';
      var isLong = m.content.length > 600;
      var msgId = 'msg-' + idx + '-' + i;

      msgsHtml += '<div class="msg ' + msgClass + '">' +
        '<div class="msg-header">' + label + ' · ' + (i+1) + '/' + conv.messages.length + ' · ' + fmt(m.content.length) + '</div>' +
        '<div id="' + msgId + '" class="msg-content' + (isLong ? ' collapsed' : '') + '">' + esc(m.content) + '</div>' +
        (isLong ? '<div class="msg-expand" data-msg-id="' + msgId + '">▼ Show full message (' + fmt(m.content.length) + ')</div>' : '') +
        '</div>';
    }
    document.getElementById('messages').innerHTML = msgsHtml;
    document.getElementById('messages').scrollTop = 0;
  };

  function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function fmt(n) {
    if (n < 500) return n + ' chars';
    return (n / 1000).toFixed(1) + 'k chars';
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      activeIdx = null;
      renderList();
      document.getElementById('main-header').innerHTML = '<h3>Select a conversation</h3>';
      document.getElementById('messages').innerHTML = '<div id="empty-state">Select a conversation from the sidebar</div>';
    }
  });

  window.renderList = renderList;
})();
`;

fs.writeFileSync(path.join(outDir, 'app.js'), appJs);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Copilot Chat History — Patient Encounters</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    --bg: #f5f5f5;
    --sidebar-bg: #1e1e2e;
    --sidebar-text: #cdd6f4;
    --card-bg: #fff;
    --text: #1e1e2e;
    --muted: #6c7086;
    --patient: #a6e3a1;
    --patient-bg: #e6f9e6;
    --nonpatient: #f9e2af;
    --user-msg: #e6f0ff;
    --assistant-msg: #f5f5f5;
    --border: #e0e0e0;
    --accent: #0078d4;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #11111b;
      --sidebar-bg: #181825;
      --sidebar-text: #cdd6f4;
      --card-bg: #1e1e2e;
      --text: #cdd6f4;
      --muted: #6c7086;
      --patient: #a6e3a1;
      --patient-bg: #1a2e1a;
      --nonpatient: #f9e2af;
      --user-msg: #1a2a3a;
      --assistant-msg: #1e1e2e;
      --border: #313244;
      --accent: #89b4fa;
    }
  }
  body {
    margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg); color: var(--text); display: flex; height: 100vh;
  }
  #sidebar {
    width: 380px; min-width: 280px; background: var(--sidebar-bg); color: var(--sidebar-text);
    display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid var(--border);
  }
  #sidebar-header { padding: 1em; border-bottom: 1px solid var(--border); }
  #sidebar-header h2 { margin: 0 0 0.3em; font-size: 1.1em; }
  #stats { font-size: 0.78em; color: var(--muted); line-height: 1.5; }
  #stats strong { color: var(--sidebar-text); }
  #filter-bar { padding: 0.6em 1em; border-bottom: 1px solid var(--border); display: flex; gap: 0.4em; flex-wrap: wrap; }
  #filter-bar input, #filter-bar select {
    padding: 0.5em 0.7em; border-radius: 4px; border: 1px solid var(--border);
    background: var(--card-bg); color: var(--text); font-size: 0.82em; font-family: inherit;
  }
  #filter-bar input { flex: 1; min-width: 100px; }
  #filter-bar input:focus, #filter-bar select:focus { outline: none; border-color: var(--accent); }
  #conv-list { flex: 1; overflow-y: auto; }
  .conv-item {
    padding: 0.7em 1em; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05);
    transition: background 0.15s; font-size: 0.84em; line-height: 1.4;
  }
  .conv-item:hover { background: rgba(255,255,255,0.06); }
  .conv-item.active { background: rgba(137,180,250,0.15); border-left: 3px solid var(--accent); padding-left: calc(1em - 3px); }
  .conv-item .title { font-weight: 500; margin-bottom: 0.15em; }
  .conv-item .meta { font-size: 0.78em; color: var(--muted); display: flex; gap: 0.8em; flex-wrap: wrap; }
  .badge { font-size: 0.7em; padding: 1px 6px; border-radius: 3px; font-weight: 600; }
  .badge-patient { background: var(--patient); color: #1a3a1a; }
  .badge-other { background: var(--nonpatient); color: #3a2a1a; }
  #main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  #main-header { padding: 1em 1.5em; border-bottom: 1px solid var(--border); background: var(--card-bg); flex-shrink: 0; }
  #main-header h3 { margin: 0 0 0.3em; font-size: 1em; }
  .patient-tag { display: inline-block; margin-top: 0.3em; font-size: 0.8em; padding: 2px 10px;
    border-radius: 4px; background: var(--patient-bg); color: var(--patient); font-weight: 600; }
  .meta-line { font-size: 0.75em; color: var(--muted); margin-top: 0.3em; }
  #messages { flex: 1; overflow-y: auto; padding: 1em 1.5em; }
  .msg { margin-bottom: 1.2em; padding: 1em 1.2em; border-radius: 8px;
    border: 1px solid var(--border); font-size: 0.88em; line-height: 1.6; }
  .msg-user { background: var(--user-msg); }
  .msg-assistant { background: var(--assistant-msg); }
  .msg-header { font-size: 0.72em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
    margin-bottom: 0.6em; color: var(--muted); }
  .msg-content { white-space: pre-wrap; word-break: break-word; }
  .msg-content.collapsed { max-height: 250px; overflow: hidden; position: relative; }
  .msg-content.collapsed::after {
    content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 60px;
    background: linear-gradient(transparent, var(--user-msg));
  }
  .msg-assistant .msg-content.collapsed::after { background: linear-gradient(transparent, var(--assistant-msg)); }
  .msg-expand { font-size: 0.75em; color: var(--accent); cursor: pointer; margin-top: 0.2em; font-weight: 600; }
  .msg-expand:hover { text-decoration: underline; }
  #empty-state { display: flex; align-items: center; justify-content: center; height: 100%;
    color: var(--muted); font-size: 0.9em; }
  .export-meta { font-size: 0.7em; color: var(--muted); padding: 0.5em 1em; border-top: 1px solid var(--border); }
</style>
</head>
<body>

<div id="sidebar">
  <div id="sidebar-header">
    <h2>Copilot Chat History</h2>
    <div id="stats">Loading...</div>
  </div>
  <div id="filter-bar">
    <input type="text" id="search" placeholder="Search..." oninput="renderList()">
    <select id="filter" onchange="renderList()">
      <option value="all">All</option>
      <option value="patient">Patient only</option>
      <option value="other">Non-patient</option>
    </select>
  </div>
  <div id="conv-list"></div>
  <div class="export-meta" id="export-meta"></div>
</div>

<div id="main">
  <div id="main-header"><h3>Select a conversation</h3></div>
  <div id="messages"><div id="empty-state">Select a conversation from the sidebar</div></div>
</div>

<script src="data.js"></script>
<script src="app.js"></script>
</body>
</html>`;

fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log('Built: /tmp/chat-browser/ (index.html + data.js + app.js)');
