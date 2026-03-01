import { Hono } from "hono";

export const uiRoutes = new Hono();

const HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Enriched Leads</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f1117; color: #e2e8f0; font-size: 13px; }

    header {
      padding: 16px 24px;
      border-bottom: 1px solid #1e2533;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    header h1 { font-size: 16px; font-weight: 600; color: #f8fafc; }
    #count { color: #64748b; font-size: 12px; }

    .actions { margin-left: auto; display: flex; gap: 8px; }
    button {
      padding: 6px 14px;
      border: 1px solid #334155;
      border-radius: 6px;
      background: #1e2533;
      color: #e2e8f0;
      cursor: pointer;
      font-size: 12px;
    }
    button:hover { background: #2d3748; }
    button.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; }
    button.primary:hover { background: #2563eb; }

    .wrap { overflow-x: auto; }

    table { width: 100%; border-collapse: collapse; }
    thead th {
      position: sticky;
      top: 0;
      background: #161b27;
      padding: 10px 12px;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: #64748b;
      border-bottom: 1px solid #1e2533;
      white-space: nowrap;
    }
    tbody tr { border-bottom: 1px solid #1a2030; cursor: pointer; }
    tbody tr:hover { background: #161b27; }
    tbody tr.expanded { background: #161b27; }
    td { padding: 9px 12px; vertical-align: top; max-width: 280px; }

    .email { color: #60a5fa; font-family: monospace; font-size: 12px; white-space: nowrap; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 99px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .badge-B2B    { background: #1e3a5f; color: #60a5fa; }
    .badge-B2C    { background: #3b2a1a; color: #fb923c; }
    .badge-SaaS   { background: #1a2e1a; color: #4ade80; }
    .badge-Agency { background: #2d1b4e; color: #c084fc; }
    .badge-Ecom   { background: #1e1a3b; color: #818cf8; }
    .badge-Other  { background: #1e2533; color: #94a3b8; }

    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; color: #94a3b8; }
    .cta { color: #fbbf24; font-size: 12px; }
    .hiring-yes { color: #4ade80; font-weight: 600; }
    .hiring-no  { color: #374151; }
    .ts { color: #475569; font-size: 11px; white-space: nowrap; }

    /* Expanded detail row */
    .detail-row td { background: #0d1117; padding: 0; }
    .detail-inner { padding: 16px 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .detail-section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #475569; margin-bottom: 6px; }
    .detail-section p, .detail-section li { color: #cbd5e1; line-height: 1.6; font-size: 12px; }
    .detail-section ul { list-style: none; padding: 0; }
    .detail-section li::before { content: "→ "; color: #3b82f6; }
    .detail-section a { color: #60a5fa; text-decoration: none; }
    .detail-section a:hover { text-decoration: underline; }
    .contact-card { background: #161b27; border: 1px solid #1e2533; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; }
    .contact-card .name { font-weight: 600; color: #f1f5f9; }
    .contact-card .role { color: #64748b; font-size: 11px; margin-bottom: 4px; }

    #loading { text-align: center; padding: 60px; color: #475569; }
    #error   { text-align: center; padding: 60px; color: #f87171; }
  </style>
</head>
<body>
  <header>
    <h1>Enriched Leads</h1>
    <span id="count"></span>
    <div class="actions">
      <button onclick="load()">Refresh</button>
      <button class="primary" onclick="triggerExtract()">Run Extract</button>
    </div>
  </header>

  <div class="wrap">
    <div id="loading">Loading…</div>
    <table id="tbl" style="display:none">
      <thead>
        <tr>
          <th>Email</th>
          <th>Type</th>
          <th>Summary</th>
          <th>Primary CTA</th>
          <th>Hiring?</th>
          <th>Contacts</th>
          <th>Processed</th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
    <div id="error" style="display:none"></div>
  </div>

<script>
  let data = [];

  function badgeClass(type) {
    const map = { B2B: 'B2B', B2C: 'B2C', SaaS: 'SaaS', Agency: 'Agency', 'E-commerce': 'Ecom' };
    return 'badge badge-' + (map[type] || 'Other');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function renderDetail(lead) {
    const contacts = (lead.contacts || []).map(c => \`
      <div class="contact-card">
        <div class="name">\${c.name || '—'}</div>
        <div class="role">\${c.role || ''}</div>
        \${c.email ? \`<div><a href="mailto:\${c.email}">\${c.email}</a></div>\` : ''}
        \${c.phone ? \`<div>\${c.phone}</div>\` : ''}
        \${c.linkedIn ? \`<div><a href="\${c.linkedIn}" target="_blank">LinkedIn ↗</a></div>\` : ''}
      </div>\`).join('') || '<p style="color:#475569">None found</p>';

    const listItems = (arr) => (arr || []).length
      ? arr.map(s => \`<li>\${s}</li>\`).join('')
      : '<li style="color:#475569">None</li>';

    const linkItems = (arr) => (arr || []).length
      ? arr.map(s => \`<li><a href="\${s}" target="_blank">\${s}</a></li>\`).join('')
      : '<li style="color:#475569">None</li>';

    return \`
      <div class="detail-inner">
        <div>
          <div class="detail-section" style="margin-bottom:16px">
            <h3>Value Proposition</h3>
            <p>\${lead.valueProposition || '—'}</p>
          </div>
          <div class="detail-section" style="margin-bottom:16px">
            <h3>Target Audience</h3>
            <p>\${lead.targetAudience || '—'}</p>
          </div>
          <div class="detail-section" style="margin-bottom:16px">
            <h3>Hiring Signals</h3>
            <ul>\${listItems(lead.hiringSignals)}</ul>
          </div>
          <div class="detail-section">
            <h3>Recent News</h3>
            <ul>\${listItems(lead.recentNews)}</ul>
          </div>
        </div>
        <div>
          <div class="detail-section" style="margin-bottom:16px">
            <h3>Contacts</h3>
            \${contacts}
          </div>
          <div class="detail-section" style="margin-bottom:16px">
            <h3>Booking Links</h3>
            <ul>\${linkItems(lead.bookingLinks)}</ul>
          </div>
          <div class="detail-section">
            <h3>Social Links</h3>
            <ul>\${linkItems(lead.socialLinks)}</ul>
          </div>
        </div>
      </div>\`;
  }

  function toggleRow(idx) {
    const existingDetail = document.getElementById('detail-' + idx);
    if (existingDetail) {
      existingDetail.remove();
      document.getElementById('row-' + idx)?.classList.remove('expanded');
      return;
    }
    // Close any other open rows
    document.querySelectorAll('.detail-row').forEach(r => r.remove());
    document.querySelectorAll('tr.expanded').forEach(r => r.classList.remove('expanded'));

    const lead = data[idx];
    const row = document.getElementById('row-' + idx);
    row.classList.add('expanded');

    const detail = document.createElement('tr');
    detail.id = 'detail-' + idx;
    detail.className = 'detail-row';
    detail.innerHTML = \`<td colspan="7">\${renderDetail(lead)}</td>\`;
    row.after(detail);
  }

  function render(leads) {
    const tbody = document.getElementById('tbody');
    tbody.innerHTML = leads.map((lead, i) => {
      const hiring = (lead.hiringSignals || []).length > 0;
      return \`
        <tr id="row-\${i}" onclick="toggleRow(\${i})">
          <td class="email">\${lead.email}</td>
          <td><span class="\${badgeClass(lead.businessType)}">\${lead.businessType || '?'}</span></td>
          <td><div class="truncate" title="\${(lead.companySummary || '').replace(/"/g,'&quot;')}">\${lead.companySummary || '—'}</div></td>
          <td class="cta">\${lead.primaryCta || '—'}</td>
          <td class="\${hiring ? 'hiring-yes' : 'hiring-no'}">\${hiring ? 'Yes (' + lead.hiringSignals.length + ')' : 'No'}</td>
          <td style="color:#94a3b8">\${(lead.contacts || []).length}</td>
          <td class="ts">\${fmtDate(lead.processedAt)}</td>
        </tr>\`;
    }).join('');
    document.getElementById('count').textContent = leads.length + ' leads';
    document.getElementById('tbl').style.display = '';
    document.getElementById('loading').style.display = 'none';
  }

  async function load() {
    document.getElementById('loading').style.display = '';
    document.getElementById('loading').textContent = 'Loading…';
    document.getElementById('tbl').style.display = 'none';
    document.getElementById('error').style.display = 'none';
    try {
      const res = await fetch('/enrich/leads');
      data = await res.json();
      render(data);
    } catch (e) {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('error').style.display = '';
      document.getElementById('error').textContent = 'Failed to load: ' + e.message;
    }
  }

  async function triggerExtract() {
    const res = await fetch('/enrich/extract', { method: 'POST' });
    const body = await res.json();
    alert(body.status === 'started' ? 'Extraction started! Refresh in a minute.' : body.message);
  }

  load();
</script>
</body>
</html>`;

uiRoutes.get("/", (c) => c.html(HTML));
