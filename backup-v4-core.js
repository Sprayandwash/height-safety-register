/* Spray & Wash Operations App V4.0.83 - Admin backup module hotfix
   Client-side Admin backup for application data and Supabase Storage files.
   No service-role key is used or exposed.
*/
(() => {
  'use strict';

  const VERSION = '4.0.83';
  const PAGE_SIZE = 1000;
  const STORAGE_BUCKETS = ['equipment-photos', 'inspection-photos'];
  const TABLES = [
    'app_settings', 'audit_logs', 'certificates', 'equipment', 'equipment_photos',
    'height_inspector_qualifications', 'inspection_photos', 'inspections',
    'operations_checklist_items', 'operations_checklist_templates',
    'operations_equipment_maintenance_schedules', 'operations_inspection_answers',
    'operations_inspection_photos', 'operations_inspections', 'operations_maintenance_log',
    'operations_maintenance_log_items', 'operations_maintenance_parts_used',
    'operations_maintenance_procedure_steps', 'operations_maintenance_procedures',
    'operations_maintenance_readings', 'operations_maintenance_task_steps',
    'operations_maintenance_tasks', 'operations_preloaded_users', 'operations_vehicles',
    'operations_washing_equipment', 'profiles', 'user_roles'
  ];

  let busy = false;
  let mountTimer = 0;

  const state = () => window.SWOperationsV4?.state || null;
  const client = () => state()?.sb || null;
  const isAdmin = () => Array.isArray(state()?.roles) && state().roles.includes('Admin');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const pad = value => String(value).padStart(2, '0');
  const stamp = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;

  function setStatus(message, type = 'info') {
    const el = document.getElementById('swBackupStatus');
    if (!el) return;
    el.className = `sw-backup-status ${type}`;
    el.textContent = message;
  }

  function setProgress(current, total, message) {
    const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 0;
    const bar = document.getElementById('swBackupProgressBar');
    const label = document.getElementById('swBackupProgressLabel');
    if (bar) bar.style.width = `${pct}%`;
    if (label) label.textContent = `${message || 'Working'}${total ? ` (${pct}%)` : ''}`;
  }

  function setBusy(value) {
    busy = value;
    document.querySelectorAll('[data-sw-backup-action]').forEach(button => { button.disabled = value; });
    const input = document.getElementById('swBackupVerifyFile');
    if (input) input.disabled = value;
  }

  function lastBackup() {
    try { return JSON.parse(localStorage.getItem('swLastBackupV4083') || 'null'); }
    catch (_) { return null; }
  }

  function saveLastBackup(value) {
    try { localStorage.setItem('swLastBackupV4083', JSON.stringify(value)); }
    catch (_) { /* optional device history only */ }
  }

  function injectStyles() {
    if (document.getElementById('swBackupV4083Styles')) return;
    const style = document.createElement('style');
    style.id = 'swBackupV4083Styles';
    style.textContent = `
      .sw-backup-module{display:grid;gap:1rem}
      .sw-backup-actions{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem}
      .sw-backup-warning{margin:1rem 0;padding:.85rem 1rem;border:1px solid #f6c467;border-radius:.8rem;background:#fff7ed;color:#9a3412}
      .sw-backup-limit{margin-top:1rem;padding:.85rem 1rem;border:1px solid #cbd5e1;border-radius:.8rem;background:#f8fafc;color:#334155}
      .sw-backup-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}
      .sw-backup-progress{height:10px;margin-top:1rem;border-radius:999px;background:#e2e8f0;overflow:hidden}
      .sw-backup-progress>span{display:block;width:0;height:100%;background:#003b73;transition:width .15s ease}
      .sw-backup-status{margin-top:.75rem;padding:.75rem .85rem;border-radius:.75rem;font-weight:700}
      .sw-backup-status.info{background:#eff6ff;color:#1e3a8a;border:1px solid #bfdbfe}
      .sw-backup-status.success{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
      .sw-backup-status.error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
      .sw-backup-file-label{display:block;max-width:620px}
      .sw-backup-file-label input{display:block;margin-top:.35rem}
      .sw-backup-verify-result{margin-top:1rem}
      .sw-backup-verify-result ul{margin:.5rem 0 0;padding-left:1.25rem}
      @media(max-width:640px){.sw-backup-actions .ops-btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function uiHtml() {
    const last = lastBackup();
    return `<section id="swBackupModule" class="sw-backup-module" aria-labelledby="swBackupTitle">
      <div class="ops-card">
        <h3 id="swBackupTitle">App Backups</h3>
        <p class="ops-subtle">Create a recoverable copy of Spray &amp; Wash application data, photos and qualification documents. Keep this tab open until the download finishes.</p>
        <div class="sw-backup-warning"><strong>Before starting:</strong> ask staff not to enter inspections, maintenance records, tasks or user changes until the backup has downloaded.</div>
        <div class="sw-backup-actions">
          <button type="button" class="ops-btn primary" data-sw-backup-action="complete">Create Complete Backup</button>
          <button type="button" class="ops-btn" data-sw-backup-action="data">Create Data-Only Backup</button>
          <button type="button" class="ops-btn" data-sw-backup-action="files">Create Files-Only Backup</button>
        </div>
        <div class="sw-backup-progress" aria-hidden="true"><span id="swBackupProgressBar"></span></div>
        <div id="swBackupProgressLabel" class="ops-subtle">Ready.</div>
        <div id="swBackupStatus" class="sw-backup-status info" role="status" aria-live="polite">No backup is running.</div>
      </div>
      <div class="ops-card">
        <h3>Verify a Backup</h3>
        <p class="ops-subtle">Choose a backup ZIP created by this screen. Verification checks the manifest, expected files, row counts and SHA-256 checksums.</p>
        <label class="sw-backup-file-label">Backup ZIP<input id="swBackupVerifyFile" type="file" accept=".zip,application/zip"></label>
        <div class="sw-backup-actions"><button type="button" class="ops-btn" data-sw-backup-action="verify">Verify Selected Backup</button></div>
        <div id="swBackupVerifyResult" class="sw-backup-verify-result"></div>
      </div>
      <div class="ops-card">
        <h3>What is included</h3>
        <div class="sw-backup-grid">
          <div><strong>Application data</strong><p class="ops-subtle">Height equipment, inspections, certificates, qualifications, vehicles, machinery, maintenance, tasks, settings, profiles and role assignments.</p></div>
          <div><strong>Stored files</strong><p class="ops-subtle">All objects in the equipment-photos and inspection-photos buckets, including qualification documents, inspection evidence and asset photos.</p></div>
          <div><strong>Recovery evidence</strong><p class="ops-subtle">Manifest, row counts, object paths, file sizes, checksums and restore guidance.</p></div>
        </div>
        <div class="sw-backup-limit"><strong>Not included:</strong> Supabase Auth passwords, active login sessions or a full PostgreSQL server dump. Users may need password resets after a complete project rebuild.</div>
        ${last ? `<p class="ops-subtle"><strong>Last backup created on this device:</strong> ${esc(last.createdAt)} - ${esc(last.kind)} - ${esc(last.fileName)}</p>` : ''}
      </div>
    </section>`;
  }

  function mount() {
    const shell = document.getElementById('opsShell');
    const nav = shell?.querySelector('#opsNav');
    const button = nav?.querySelector('[data-ops-view="admin-settings"]');
    if (!shell || !nav || !button?.classList.contains('active') || !isAdmin()) return false;

    injectStyles();
    let node = nav.nextSibling;
    while (node) {
      const next = node.nextSibling;
      node.remove();
      node = next;
    }
    nav.insertAdjacentHTML('afterend', uiHtml());
    bindUi();

    const tagline = document.querySelector('.tagline');
    const versionText = 'Version 4.0.83 • Height Safety • Vehicle Checks • Equipment • Maintenance';
    if (tagline && tagline.textContent !== versionText) tagline.textContent = versionText;
    window.SW_OPERATIONS_BUILD = VERSION;
    return true;
  }

  function scheduleMount(attempt = 0) {
    clearTimeout(mountTimer);
    if (mount()) return;
    if (attempt >= 20) return;
    mountTimer = window.setTimeout(() => scheduleMount(attempt + 1), 50);
  }

  function bindUi() {
    document.querySelectorAll('[data-sw-backup-action]').forEach(button => {
      if (button.dataset.swBackupBound === '1') return;
      button.dataset.swBackupBound = '1';
      button.addEventListener('click', () => handleAction(button.dataset.swBackupAction));
    });
  }

  async function handleAction(action) {
    if (busy) return;
    setBusy(true);
    try {
      if (!isAdmin()) throw new Error('Only Admin users can create or verify backups.');
      if (action === 'verify') {
        const file = document.getElementById('swBackupVerifyFile')?.files?.[0];
        if (!file) throw new Error('Choose a backup ZIP first.');
        await verifyBackup(file);
      } else if (['complete', 'data', 'files'].includes(action)) {
        await createBackup(action);
      }
    } catch (error) {
      console.error('Backup error:', error);
      setStatus(error.message || String(error), 'error');
      const result = document.getElementById('swBackupVerifyResult');
      if (action === 'verify' && result) result.innerHTML = `<div class="sw-backup-status error">${esc(error.message || error)}</div>`;
    } finally {
      setBusy(false);
    }
  }

  async function loadJsZip() {
    if (window.JSZip) return window.JSZip;
    setStatus('Loading backup library...', 'info');
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load the ZIP library. Check the internet connection.'));
      document.head.appendChild(script);
    });
    if (!window.JSZip) throw new Error('The ZIP library did not initialise.');
    return window.JSZip;
  }

  async function fetchTableRows(table) {
    const sb = client();
    if (!sb) throw new Error('Supabase is not ready. Refresh the app and try again.');
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const response = await sb.from(table).select('*').range(from, from + PAGE_SIZE - 1);
      if (response.error) throw new Error(`${table}: ${response.error.message}`);
      const page = response.data || [];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return rows;
  }

  async function captureDatabase(zip, manifest) {
    const all = {};
    for (let index = 0; index < TABLES.length; index += 1) {
      const table = TABLES[index];
      setProgress(index, TABLES.length, `Exporting ${table}`);
      const rows = await fetchTableRows(table);
      all[table] = rows;
      const file = `database/tables/${table}.json`;
      manifest.database.tables.push({ name: table, rows: rows.length, file });
      zip.file(file, JSON.stringify(rows, null, 2));
    }
    zip.file('database/all-app-data.json', JSON.stringify({
      format: 'spray-wash-app-data-v1', created_at: manifest.created_at,
      app_version: VERSION, tables: all
    }, null, 2));
    zip.file('database/restore-order.json', JSON.stringify(TABLES, null, 2));
    setProgress(TABLES.length, TABLES.length, 'Application data exported');
  }

  async function listBucketFiles(bucket) {
    const sb = client();
    const files = [];
    const visited = new Set();

    async function walk(prefix) {
      if (visited.has(prefix)) return;
      visited.add(prefix);
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const response = await sb.storage.from(bucket).list(prefix, {
          limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' }
        });
        if (response.error) throw new Error(`${bucket}/${prefix || ''}: ${response.error.message}`);
        const items = response.data || [];
        for (const item of items) {
          const path = prefix ? `${prefix}/${item.name}` : item.name;
          const folder = item.id == null && (!item.metadata || Object.keys(item.metadata).length === 0);
          if (folder) await walk(path);
          else files.push({ bucket, path, item });
        }
        if (items.length < PAGE_SIZE) break;
      }
    }

    await walk('');
    return files;
  }

  async function sha256Hex(buffer) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function captureStorage(zip, manifest) {
    const sb = client();
    const listed = [];
    for (const bucket of STORAGE_BUCKETS) {
      setStatus(`Listing files in ${bucket}...`, 'info');
      listed.push(...await listBucketFiles(bucket));
    }

    const checksumLines = [];
    for (let index = 0; index < listed.length; index += 1) {
      const file = listed[index];
      setProgress(index, listed.length || 1, `Downloading ${file.bucket}/${file.path}`);
      const response = await sb.storage.from(file.bucket).download(file.path);
      if (response.error) throw new Error(`${file.bucket}/${file.path}: ${response.error.message}`);
      const blob = response.data;
      if (!blob) throw new Error(`${file.bucket}/${file.path}: no file data returned.`);
      const buffer = await blob.arrayBuffer();
      const checksum = await sha256Hex(buffer);
      const zipPath = `storage/${file.bucket}/${file.path}`;
      zip.file(zipPath, buffer);
      manifest.storage.files.push({
        bucket: file.bucket, path: file.path, zip_path: zipPath,
        size: buffer.byteLength,
        content_type: blob.type || file.item?.metadata?.mimetype || null,
        sha256: checksum,
        created_at: file.item?.created_at || null,
        updated_at: file.item?.updated_at || null
      });
      checksumLines.push(`${checksum}  ${zipPath}`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    manifest.storage.total_files = manifest.storage.files.length;
    manifest.storage.total_bytes = manifest.storage.files.reduce((sum, file) => sum + file.size, 0);
    zip.file('checksums/sha256-storage-files.txt', checksumLines.join('\n') + (checksumLines.length ? '\n' : ''));
    setProgress(listed.length || 1, listed.length || 1, 'Stored files exported');
  }

  function recoveryText(manifest) {
    return `SPRAY & WASH OPERATIONS BACKUP\n\nCreated: ${manifest.created_at}\nApp version: ${manifest.app_version}\nBackup type: ${manifest.backup_type}\n\nCONTENTS\n- database/tables/*.json: one JSON file per application table\n- database/all-app-data.json: combined application data\n- storage/: exact Supabase bucket paths and file bytes\n- manifest.json: row counts, object paths, sizes and checksums\n- checksums/: SHA-256 checksums for stored files\n\nIMPORTANT LIMITATIONS\n- This is an application recovery backup, not a full PostgreSQL server dump.\n- Supabase Auth passwords and active sessions are not included.\n- Restore the database schema and security policies first, then table data, then Storage objects at their exact original paths.\n\nDO NOT EDIT THE BACKUP ZIP. Keep at least two copies in separate locations.\n`;
  }

  async function createBackup(kind) {
    const JSZip = await loadJsZip();
    setProgress(0, 1, 'Starting backup');
    setStatus('Preparing backup...', 'info');

    const now = new Date();
    const label = kind === 'complete' ? 'Complete' : kind === 'data' ? 'Data-Only' : 'Files-Only';
    const fileName = `Spray-and-Wash-${label}-Backup-${stamp(now)}.zip`;
    const zip = new JSZip();
    const manifest = {
      format: 'spray-wash-backup-v1', app_version: VERSION,
      created_at: now.toISOString(), created_by: state()?.user?.email || state()?.user?.id || 'Admin',
      backup_type: kind, database: { tables: [] },
      storage: { buckets: STORAGE_BUCKETS.slice(), files: [], total_files: 0, total_bytes: 0 },
      limitations: [
        'Supabase Auth passwords and active login sessions are not included.',
        'This is not a full PostgreSQL server dump.',
        'Database schema and policies must be restored before importing table data.'
      ]
    };

    if (kind !== 'files') {
      setStatus('Exporting application data...', 'info');
      await captureDatabase(zip, manifest);
    }
    if (kind !== 'data') {
      setStatus('Exporting photos and qualification documents...', 'info');
      await captureStorage(zip, manifest);
    }

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('RESTORE-INSTRUCTIONS.txt', recoveryText(manifest));
    zip.file('VERSION.txt', `${VERSION}\n`);

    setStatus('Compressing backup. Keep this tab open...', 'info');
    const blob = await zip.generateAsync({
      type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'DOS'
    }, info => setProgress(info.percent, 100, `Compressing ${info.currentFile || ''}`));

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    const rowCount = manifest.database.tables.reduce((sum, table) => sum + table.rows, 0);
    setProgress(100, 100, 'Backup complete');
    setStatus(`Backup downloaded: ${fileName}. ${manifest.database.tables.length} tables, ${rowCount} database rows and ${manifest.storage.total_files} stored files.`, 'success');
    saveLastBackup({ createdAt: now.toLocaleString('en-NZ'), kind: label, fileName, size: blob.size });
  }

  async function verifyBackup(file) {
    const JSZip = await loadJsZip();
    setStatus('Verifying backup...', 'info');
    setProgress(0, 1, 'Opening backup');
    const result = document.getElementById('swBackupVerifyResult');
    if (result) result.innerHTML = '';

    const zip = await JSZip.loadAsync(file, { checkCRC32: true });
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) throw new Error('manifest.json is missing. This is not a recognised Spray & Wash backup.');
    const manifest = JSON.parse(await manifestFile.async('string'));
    if (manifest.format !== 'spray-wash-backup-v1') throw new Error(`Unsupported backup format: ${manifest.format || 'unknown'}.`);

    const errors = [];
    const tables = manifest.database?.tables || [];
    const storedFiles = manifest.storage?.files || [];
    const total = tables.length + storedFiles.length || 1;
    let checked = 0;

    for (const table of tables) {
      setProgress(checked, total, `Checking ${table.name}`);
      const entry = zip.file(table.file);
      if (!entry) errors.push(`Missing database file: ${table.file}`);
      else {
        try {
          const rows = JSON.parse(await entry.async('string'));
          if (!Array.isArray(rows)) errors.push(`${table.file} is not a JSON array.`);
          else if (rows.length !== table.rows) errors.push(`${table.name}: expected ${table.rows} rows, found ${rows.length}.`);
        } catch (error) { errors.push(`${table.file}: invalid JSON (${error.message}).`); }
      }
      checked += 1;
    }

    for (const stored of storedFiles) {
      setProgress(checked, total, `Checking ${stored.bucket}/${stored.path}`);
      const entry = zip.file(stored.zip_path);
      if (!entry) errors.push(`Missing stored file: ${stored.zip_path}`);
      else {
        const buffer = await entry.async('arraybuffer');
        if (buffer.byteLength !== stored.size) errors.push(`${stored.zip_path}: expected ${stored.size} bytes, found ${buffer.byteLength}.`);
        if (await sha256Hex(buffer) !== stored.sha256) errors.push(`${stored.zip_path}: checksum does not match.`);
      }
      checked += 1;
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    setProgress(total, total, 'Verification complete');
    if (errors.length) {
      setStatus(`Backup verification failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}.`, 'error');
      if (result) result.innerHTML = `<div class="sw-backup-status error"><strong>Verification failed.</strong><ul>${errors.slice(0, 30).map(error => `<li>${esc(error)}</li>`).join('')}${errors.length > 30 ? `<li>...and ${errors.length - 30} more.</li>` : ''}</ul></div>`;
      return;
    }

    const rows = tables.reduce((sum, table) => sum + Number(table.rows || 0), 0);
    setStatus('Backup verified successfully.', 'success');
    if (result) result.innerHTML = `<div class="sw-backup-status success"><strong>Backup verified</strong><br>Created: ${esc(new Date(manifest.created_at).toLocaleString('en-NZ'))}<br>Tables: ${tables.length}<br>Database rows: ${rows}<br>Stored files: ${storedFiles.length}</div>`;
  }

  function install() {
    injectStyles();
    window.SW_OPERATIONS_BUILD = VERSION;
    window.SWBackupV4083 = { createBackup, verifyBackup, mount, version: VERSION };

    document.addEventListener('click', event => {
      const viewButton = event.target.closest('[data-ops-view]');
      if (viewButton?.dataset.opsView === 'admin-settings') scheduleMount();
    }, true);

    scheduleMount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
