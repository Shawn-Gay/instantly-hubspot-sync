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
    td { padding: 9px 12px; vertical-align: top; }

    .email { color: #60a5fa; font-family: monospace; font-size: 12px; white-space: nowrap; }
    .company { font-weight: 500; color: #f1f5f9; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 99px;
      font-size: 10px;
      font-weight: 600;
      white-space: nowrap;
      margin: 1px 2px 1px 0;
    }
    .badge-yes     { background: #14532d; color: #4ade80; }
    .badge-no      { background: #1c1917; color: #57534e; }
    .badge-storm   { background: #3b2a1a; color: #fb923c; }
    .badge-service { background: #1e2a3b; color: #7dd3fc; }
    .badge-gap     { background: #2d1515; color: #f87171; }

    .lead-capture { color: #94a3b8; font-size: 12px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ts { color: #475569; font-size: 11px; white-space: nowrap; }

    /* Expanded detail row */
    .detail-row td { background: #0d1117; padding: 0; }
    .detail-inner { padding: 16px 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .detail-section { margin-bottom: 16px; }
    .detail-section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #475569; margin-bottom: 6px; }
    .detail-section p, .detail-section li { color: #cbd5e1; line-height: 1.6; font-size: 12px; }
    .detail-section ul { list-style: none; padding: 0; }
    .detail-section li::before { content: "→ "; color: #3b82f6; }
    .detail-section .empty { color: #374151; }

    .bool-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }
    .bool-item { font-size: 12px; color: #94a3b8; background: #161b27; padding: 6px 10px; border-radius: 4px; border: 1px solid #1e2533; }
    .bool-item strong { color: #f1f5f9; display: block; margin-bottom: 2px; font-size: 10px; text-transform: uppercase; }

    #loading { text-align: center; padding: 60px; color: #475569; }
    #error   { text-align: center; padding: 60px; color: #f87171; }

    /* ── Examples Modal ── */
    #exModal {
      position: fixed; inset: 0; background: rgba(0,0,0,.75);
      z-index: 100; display: flex; align-items: flex-start;
      justify-content: center; padding: 40px 20px; overflow-y: auto;
    }
    .modal-box {
      background: #161b27; border: 1px solid #1e2533; border-radius: 10px;
      width: 100%; max-width: 720px; flex-shrink: 0;
    }
    .modal-header {
      display: flex; align-items: center; padding: 16px 20px;
      border-bottom: 1px solid #1e2533;
    }
    .modal-header h2 { font-size: 14px; font-weight: 600; color: #f1f5f9; flex: 1; margin: 0; }
    .modal-close { background: none; border: none; color: #64748b; font-size: 20px; line-height: 1; cursor: pointer; padding: 0 4px; }
    .modal-close:hover { color: #e2e8f0; background: none; }
    .modal-tabs { display: flex; gap: 4px; padding: 12px 20px 0; border-bottom: 1px solid #1e2533; }
    .tab-btn {
      padding: 6px 14px; border-radius: 6px 6px 0 0; font-size: 12px;
      border: 1px solid transparent; border-bottom: none;
      cursor: pointer; color: #64748b; background: none;
    }
    .tab-btn.active { background: #0d1117; color: #e2e8f0; border-color: #1e2533; border-bottom-color: #0d1117; }
    .modal-body { padding: 20px; background: #0d1117; border-radius: 0 0 10px 10px; }
    .ex-meta {
      font-size: 11px; color: #94a3b8; margin-bottom: 14px;
      padding: 8px 12px; background: #1a2030; border-radius: 4px;
      border-left: 3px solid #3b82f6; line-height: 1.7;
    }
    .ex-subject {
      font-size: 11px; color: #94a3b8; margin-bottom: 14px;
      padding: 6px 12px; background: #161b27; border-radius: 4px;
      border: 1px solid #1e2533;
    }
    .ex-subject strong { color: #60a5fa; }
    .ex-body p { font-size: 12.5px; line-height: 1.8; color: #cbd5e1; margin-bottom: 10px; }
    .ex-body p:last-child { margin-bottom: 0; }
    .ex-var { color: #fbbf24; font-style: italic; background: rgba(251,191,36,.1); padding: 0 4px; border-radius: 3px; }
    .ex-hint { color: #475569; font-size: 11px; font-style: italic; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .call-block { display: flex; flex-direction: column; gap: 12px; }
    .call-line { font-size: 12.5px; line-height: 1.75; color: #cbd5e1; }
    .call-role { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; display: inline-block; min-width: 46px; margin-right: 4px; }
    .call-role.sdr { color: #60a5fa; }
    .call-role.owner { color: #a78bfa; }
  </style>
</head>
<body>
  <header>
    <h1>Enriched Leads — Roofing</h1>
    <span id="count"></span>
    <div class="actions">
      <button onclick="showExamples()">Show Examples</button>
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
          <th>Company</th>
          <th>Services</th>
          <th>Emergency?</th>
          <th>Lead Capture</th>
          <th>Storm</th>
          <th>Gaps</th>
          <th>Processed</th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
    <div id="error" style="display:none"></div>
  </div>

<!-- Examples Modal -->
<div id="exModal" style="display:none" onclick="if(event.target===this)closeExamples()">
  <div class="modal-box">
    <div class="modal-header">
      <h2>Outreach Examples</h2>
      <button class="modal-close" onclick="closeExamples()">&#x2715;</button>
    </div>
    <div class="modal-tabs">
      <button class="tab-btn active" onclick="switchTab(0)">&#x2709; Storm / Emergency</button>
      <button class="tab-btn" onclick="switchTab(1)">&#x2709; High-Ticket / Commercial</button>
      <button class="tab-btn" onclick="switchTab(2)">&#x260E; Cold Call Script</button>
    </div>
    <div class="modal-body">

      <!-- Tab 0: Storm / Emergency Cold Email -->
      <div class="tab-content active">
        <div class="ex-meta">
          <strong>Target:</strong> Gus Roofing &nbsp;&middot;&nbsp;
          Emergency: &#x2705; &nbsp;&middot;&nbsp; Storm: Hail mentions &nbsp;&middot;&nbsp;
          No webchat &nbsp;&middot;&nbsp; Free Estimates: &#x2705;
        </div>
        <div class="ex-subject"><strong>Subject:</strong> missed hail calls / Gus Roofing</div>
        <div class="ex-body">
          <p>Hey Gus,</p>
          <p>
            <span class="ex-var">{{generatedIcebreaker}}</span>
            <span class="ex-hint"> &mdash; e.g., "Saw you guys are the go-to for hail damage repair around Greeley and love that you offer 5-year workmanship warranties."</span>
          </p>
          <p>I was looking at your site and noticed you offer 24/7 emergency services and free estimates &mdash; but there's no web-chat or after-hours text-back system on the site.</p>
          <p>When hail hits Colorado, roofers usually miss 30%+ of inbound calls because you're out on ladders or driving. Homeowners just call the next roofer on Google if you don't pick up.</p>
          <p>We build AI Receptionists specifically for roofers that answer calls 24/7, book your free estimates directly on your calendar, and text callers back immediately if you miss them.</p>
          <p>Open to a quick 3-minute demo video showing how it would work for Gus Roofing?</p>
          <p style="color:#64748b">Best,<br>[Your Name]</p>
        </div>
      </div>

      <!-- Tab 1: High-Ticket / Commercial Cold Email -->
      <div class="tab-content">
        <div class="ex-meta">
          <strong>Target:</strong> Exceptional Exteriors &amp; Renovations &nbsp;&middot;&nbsp;
          Commercial: &#x2705; &nbsp;&middot;&nbsp; High-Ticket: Metal Roofs &nbsp;&middot;&nbsp;
          30+ Years in business &nbsp;&middot;&nbsp; No reviews widget
        </div>
        <div class="ex-subject"><strong>Subject:</strong> Metal roofing leads for Exceptional Exteriors</div>
        <div class="ex-body">
          <p>Hi Dennis,</p>
          <p>
            <span class="ex-var">{{generatedIcebreaker}}</span>
            <span class="ex-hint"> &mdash; e.g., "Massive respect for keeping Exceptional Exteriors locally owned in Pittsburgh for over 30 years."</span>
          </p>
          <p>I noticed you specialize in high-ticket Everlast Metal roofs and commercial jobs. Because those jobs carry such a high ticket value, missing just one lead who fills out your basic contact form and gets impatient can cost you $30k+.</p>
          <p>We help commercial roofers bridge the gap between their website and their phone &mdash; an AI webchat and voice receptionist that pre-qualifies metal/commercial leads 24/7 and live-transfers the high-value ones straight to your cell.</p>
          <p class="ex-hint">(We also noticed your site is missing a dedicated customer review widget, which we fix through our growth program to boost your baseline conversion rate.)</p>
          <p>Are you opposed to seeing a quick example of how this captures commercial leads?</p>
        </div>
      </div>

      <!-- Tab 2: Cold Call Script -->
      <div class="tab-content">
        <div class="ex-meta">
          <strong>Target:</strong> Monarch Roofing &nbsp;&middot;&nbsp;
          Hiring: &#x2705; &nbsp;&middot;&nbsp; Market: NJ, 25 experts &nbsp;&middot;&nbsp;
          No bilingual mention
        </div>
        <div class="call-block">
          <div class="call-line">
            <span class="call-role sdr">SDR</span>
            "Hey [Owner], this is [Your Name]. I'll be up front &mdash; this is a cold call. Do you want to hang up, or give me 30 seconds to tell you why I called Monarch Roofing?"
          </div>
          <div class="call-line">
            <span class="call-role owner">Owner</span>
            "Go ahead."
          </div>
          <div class="call-line">
            <span class="call-role sdr">SDR</span>
            "I was looking at your site, saw you've got a massive team of 25 experts in New Jersey, and noticed you're actively hiring right now. Usually when owners are scaling and hiring, they're too busy to answer every single phone call &mdash; especially the Spanish-speaking leads, since I didn't see 'Se Habla Espa&#xF1;ol' on the site."
          </div>
          <div class="call-line">
            <span class="call-role sdr">SDR</span>
            "We install an AI receptionist for roofers that speaks perfect English and Spanish, qualifies your leads, and schedules your estimates so you can focus on running your crews. Are you guys currently using an answering service, or is the phone just ringing straight to you or the office manager?"
          </div>
        </div>
      </div>

    </div>
  </div>
</div>

<script>
  let data = [];

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function listItems(arr, cls) {
    // Assuming JSON strings are parsed to arrays on your backend route before sending to frontend.
    // If they arrive as strings, you would do: arr = typeof arr === 'string' ? JSON.parse(arr || '[]') : arr;
    if (!arr || !arr.length) return '<li class="empty">None</li>';
    return arr.map(s => \`<li\${cls ? \` class="\${cls}"\` : ''}>\${s}</li>\`).join('');
  }

  function serviceBadges(arr) {
    if (!arr || !arr.length) return '<span style="color:#374151">—</span>';
    return arr.map(s => \`<span class="badge badge-service">\${s}</span>\`).join('');
  }

  function renderDetail(lead) {
    const owners = (lead.ownerOrLeaders || []).length
      ? lead.ownerOrLeaders.join(', ')
      : '<span class="empty">Unknown</span>';

    return \`
      <div class="detail-inner">
        <div>
          <div class="detail-section">
            <h3>Owner / Leaders</h3>
            <p>\${owners}</p>
          </div>
          <div class="detail-section">
            <h3>Target Market</h3>
            <p>\${lead.targetMarket || '<span class="empty">Not specified</span>'}</p>
          </div>
          <div class="detail-section">
            <h3>Service Areas</h3>
            <ul>\${listItems(lead.serviceAreas)}</ul>
          </div>
          <div class="detail-section">
            <h3>Trust Signals</h3>
            <ul>\${listItems(lead.trustSignals)}</ul>
          </div>
          <div class="detail-section">
            <h3>Manufacturer Certifications</h3>
            <ul>\${listItems(lead.manufacturerCertifications)}</ul>
          </div>
          <div class="detail-section">
            <h3>Quick Facts</h3>
            <div class="bool-row">
              <div class="bool-item"><strong>Free Estimate</strong> \${lead.freeEstimateOffered ? '✅ Yes' : '❌ No'}</div>
              <div class="bool-item"><strong>Financing</strong> \${lead.financingOffered ? '✅ Yes' : '❌ No'}</div>
              <div class="bool-item"><strong>24/7 Emergency</strong> \${lead.emergencyServices ? '✅ Yes' : '❌ No'}</div>
              <div class="bool-item"><strong>Bilingual Site</strong> \${lead.bilingualSupportMentioned ? '✅ Yes' : '❌ No'}</div>
              <div class="bool-item"><strong>Actively Hiring</strong> \${lead.isHiring ? '✅ Yes' : '❌ No'}</div>
              <div class="bool-item"><strong>Project Gallery</strong> \${lead.hasProjectGallery ? '✅ Yes' : '❌ No'}</div>
            </div>
          </div>
        </div>
        
        <div>
          <div class="detail-section">
            <h3>High-Ticket Materials Mentioned</h3>
            <ul>\${listItems(lead.highTicketMaterials)}</ul>
          </div>
          <div class="detail-section">
            <h3>Lead Capture Method</h3>
            <p>\${lead.currentLeadCapture || '—'}</p>
          </div>
          <div class="detail-section">
            <h3>Response Time Promise</h3>
            <p>\${lead.responseTimePromise || '<span class="empty">None highlighted</span>'}</p>
          </div>
          <div class="detail-section">
            <h3>Storm / Insurance Mentions</h3>
            <ul>\${listItems(lead.stormMentions)}</ul>
          </div>
          <div class="detail-section">
            <h3>Marketing Gaps</h3>
            <ul>\${listItems(lead.marketingGaps)}</ul>
          </div>
          <div class="detail-section">
            <h3>Website Outdated Signals</h3>
            <p>\${lead.websiteOutdatedSignals || '<span class="empty">None detected</span>'}</p>
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
    document.querySelectorAll('.detail-row').forEach(r => r.remove());
    document.querySelectorAll('tr.expanded').forEach(r => r.classList.remove('expanded'));

    const lead = data[idx];
    const row = document.getElementById('row-' + idx);
    row.classList.add('expanded');

    const detail = document.createElement('tr');
    detail.id = 'detail-' + idx;
    detail.className = 'detail-row';
    detail.innerHTML = \`<td colspan="8">\${renderDetail(lead)}</td>\`;
    row.after(detail);
  }

  function render(leads) {
    const tbody = document.getElementById('tbody');
    tbody.innerHTML = leads.map((lead, i) => {
      const hasStorm = (lead.stormMentions || []).length > 0;
      const gapCount = (lead.marketingGaps || []).length;
      return \`
        <tr id="row-\${i}" onclick="toggleRow(\${i})">
          <td class="email">\${lead.email}</td>
          <td class="company" title="\${(lead.companyName || '').replace(/"/g,'&quot;')}">\${lead.companyName || '—'}</td>
          <td>\${serviceBadges(lead.servicesOffered)}</td>
          <td><span class="badge \${lead.emergencyServices ? 'badge-yes' : 'badge-no'}">\${lead.emergencyServices ? 'Yes' : 'No'}</span></td>
          <td class="lead-capture" title="\${(lead.currentLeadCapture || '').replace(/"/g,'&quot;')}">\${lead.currentLeadCapture || '—'}</td>
          <td>\${hasStorm ? \`<span class="badge badge-storm">\${lead.stormMentions.length} mention\${lead.stormMentions.length > 1 ? 's' : ''}</span>\` : '<span style="color:#374151">—</span>'}</td>
          <td>\${gapCount ? \`<span class="badge badge-gap">\${gapCount} gap\${gapCount > 1 ? 's' : ''}</span>\` : '<span style="color:#374151">—</span>'}</td>
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

  function showExamples() {
    document.getElementById('exModal').style.display = 'flex';
  }
  function closeExamples() {
    document.getElementById('exModal').style.display = 'none';
  }
  function switchTab(n) {
    document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === n));
    document.querySelectorAll('.tab-content').forEach((c, i) => c.classList.toggle('active', i === n));
  }

  load();
</script>
</body>
</html>`;

uiRoutes.get("/", (c) => c.html(HTML));