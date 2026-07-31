/* Spray & Wash Operations App V4.0.84
   Photo compression and controlled vehicle-inspection photo retention.
*/
(() => {
  'use strict';

  const VERSION = '4.0.84';
  const LABEL = 'Version 4.0.84 • Height Safety • Vehicle Checks • Equipment • Maintenance';
  const PHOTO_BUCKET = 'inspection-photos';
  const RETENTION_MONTHS = 6;
  const CLOSED_TASK_STATUSES = new Set(['Completed', 'Deferred', 'Closed', 'Cancelled']);
  const COMPRESS_PATHS = [
    'operations-inspections/',
    'operations-assets/',
    'height-inspector-qualifications/'
  ];

  let markerObserver = null;
  let cleanupScan = null;
  let mountTimer = 0;

  const state = () => window.SWOperationsV4?.state || null;
  const client = () => state()?.sb || null;
  const isAdmin = () => Array.isArray(state()?.roles) && state().roles.includes('Admin');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function applyReleaseMarker() {
    const tagline = document.querySelector('.tagline');
    if (tagline && tagline.textContent !== LABEL) tagline.textContent = LABEL;
    window.SW_OPERATIONS_BUILD = VERSION;
  }

  function installReleaseMarker(attempt = 0) {
    const tagline = document.querySelector('.tagline');
    if (!tagline) {
      if (attempt < 40) setTimeout(() => installReleaseMarker(attempt + 1), 50);
      return;
    }
    applyReleaseMarker();
    markerObserver?.disconnect();
    markerObserver = new MutationObserver(applyReleaseMarker);
    markerObserver.observe(tagline, { childList: true, characterData: true, subtree: true });
  }

  function shouldCompress(bucket, path, body) {
    if (bucket !== PHOTO_BUCKET) return false;
    if (!(body instanceof Blob)) return false;
    if (!String(body.type || '').toLowerCase().startsWith('image/')) return false;
    const cleanPath = String(path || '').replace(/^\/+/, '');
    return COMPRESS_PATHS.some(prefix => cleanPath.startsWith(prefix));
  }

  function maxDimensionFor(path) {
    const cleanPath = String(path || '');
    if (cleanPath.startsWith('height-inspector-qualifications/')) return 2200;
    if (cleanPath.startsWith('operations-assets/')) return 1800;
    return 1800;
  }

  async function loadImageSource(blob) {
    if ('createImageBitmap' in window) {
      try {
        const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
        if (bitmap.width && bitmap.height) return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
        bitmap.close();
      } catch (_) {
        // Fall through to the Image element path for older browsers and unsupported formats.
      }
    }

    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => URL.revokeObjectURL(url)
      });
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('The image could not be decoded.'));
      };
      image.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The resized image could not be created.')), type, quality);
    });
  }

  async function compressImage(blob, path) {
    const maxDimension = maxDimensionFor(path);
    const decoded = await loadImageSource(blob);
    try {
      const largest = Math.max(decoded.width, decoded.height);
      const scale = Math.min(1, maxDimension / largest);
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Image processing is unavailable in this browser.');
      context.drawImage(decoded.source, 0, 0, width, height);
      const compressed = await canvasToBlob(canvas, 'image/jpeg', 0.85);

      const resized = width !== decoded.width || height !== decoded.height;
      if (!resized && compressed.size >= blob.size * 0.95) {
        return { body: blob, contentType: blob.type || 'image/jpeg', changed: false };
      }
      return { body: compressed, contentType: 'image/jpeg', changed: true };
    } finally {
      decoded.close();
    }
  }

  function installUploadCompression(attempt = 0) {
    const sb = client();
    const storage = sb?.storage;
    if (!storage) {
      if (attempt < 120) setTimeout(() => installUploadCompression(attempt + 1), 100);
      return false;
    }
    if (storage.__swPhotoCompressionV4084) return true;

    const originalFrom = storage.from.bind(storage);
    storage.from = function wrappedFrom(bucket) {
      const api = originalFrom(bucket);
      if (bucket !== PHOTO_BUCKET) return api;

      return new Proxy(api, {
        get(target, property) {
          if (property === 'upload') {
            return async function wrappedUpload(path, body, options = {}) {
              if (!shouldCompress(bucket, path, body)) {
                return target.upload(path, body, options);
              }
              try {
                const processed = await compressImage(body, path);
                const uploadOptions = { ...options, contentType: processed.contentType };
                if (processed.changed) {
                  console.info(`Spray & Wash photo resized before upload: ${path} (${body.size} -> ${processed.body.size} bytes)`);
                }
                return target.upload(path, processed.body, uploadOptions);
              } catch (error) {
                console.warn(`Photo resizing skipped for ${path}:`, error);
                return target.upload(path, body, options);
              }
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    };
    Object.defineProperty(storage, '__swPhotoCompressionV4084', { value: true, configurable: false });
    return true;
  }

  function cutoffDateIso() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setMonth(date.getMonth() - RETENTION_MONTHS);
    return date.toISOString().slice(0, 10);
  }

  function isVehicleInspection(inspection) {
    const target = String(inspection?.target_type || '').toLowerCase();
    return target === 'vehicle' || (!!inspection?.vehicle_id && !inspection?.washing_equipment_id);
  }

  function isTaskOpen(task) {
    return !CLOSED_TASK_STATUSES.has(String(task?.status || 'Open'));
  }

  async function estimateStorageBytes(rows) {
    const sb = client();
    if (!sb || !rows.length) return 0;
    const byInspection = new Map();
    rows.forEach(row => {
      const key = String(row.inspection_id || '');
      if (!byInspection.has(key)) byInspection.set(key, []);
      byInspection.get(key).push(row);
    });

    let total = 0;
    for (const [inspectionId, photoRows] of byInspection) {
      const response = await sb.storage.from(PHOTO_BUCKET).list(`operations-inspections/${inspectionId}`, {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' }
      });
      if (response.error) continue;
      const wanted = new Set(photoRows.map(row => String(row.storage_path || '').split('/').pop()));
      for (const item of response.data || []) {
        if (!wanted.has(item.name)) continue;
        const size = Number(item.metadata?.size || item.metadata?.contentLength || 0);
        if (Number.isFinite(size)) total += size;
      }
    }
    return total;
  }

  async function scanEligibleVehiclePhotos(updateUi = true) {
    const sb = client();
    if (!sb) throw new Error('Supabase is not ready. Refresh the app and try again.');
    if (!isAdmin()) throw new Error('Only Admin users can scan or delete retained photos.');

    const cutoff = cutoffDateIso();
    if (updateUi) setCleanupStatus('Scanning vehicle inspection photos...', 'info');

    const [inspectionResult, photoResult, taskResult] = await Promise.all([
      sb.from('operations_inspections')
        .select('id,target_type,vehicle_id,washing_equipment_id,inspection_date')
        .lte('inspection_date', cutoff),
      sb.from('operations_inspection_photos')
        .select('id,inspection_id,bucket,storage_path,file_name,created_at'),
      sb.from('operations_maintenance_tasks')
        .select('id,source_inspection_id,status')
    ]);

    if (inspectionResult.error) throw new Error(`Could not read vehicle inspections: ${inspectionResult.error.message}`);
    if (photoResult.error) throw new Error(`Could not read inspection photos: ${photoResult.error.message}`);
    if (taskResult.error) throw new Error(`Could not read linked tasks: ${taskResult.error.message}`);

    const oldVehicleInspections = (inspectionResult.data || []).filter(isVehicleInspection);
    const inspectionById = new Map(oldVehicleInspections.map(row => [String(row.id), row]));
    const protectedInspectionIds = new Set(
      (taskResult.data || [])
        .filter(task => task.source_inspection_id && isTaskOpen(task))
        .map(task => String(task.source_inspection_id))
    );

    const candidates = (photoResult.data || []).filter(photo => {
      const inspectionId = String(photo.inspection_id || '');
      const path = String(photo.storage_path || '').replace(/^\/+/, '');
      const bucket = String(photo.bucket || PHOTO_BUCKET);
      return inspectionById.has(inspectionId)
        && !protectedInspectionIds.has(inspectionId)
        && bucket === PHOTO_BUCKET
        && path.startsWith(`operations-inspections/${inspectionId}/`);
    });

    const blocked = (photoResult.data || []).filter(photo => {
      const inspectionId = String(photo.inspection_id || '');
      return inspectionById.has(inspectionId) && protectedInspectionIds.has(inspectionId);
    });

    const bytes = await estimateStorageBytes(candidates);
    const dates = candidates
      .map(photo => inspectionById.get(String(photo.inspection_id))?.inspection_date)
      .filter(Boolean)
      .sort();

    cleanupScan = {
      scannedAt: Date.now(),
      cutoff,
      rows: candidates,
      bytes,
      blockedCount: blocked.length,
      oldestDate: dates[0] || null
    };

    if (updateUi) renderCleanupPreview(cleanupScan);
    return cleanupScan;
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (!value) return '0 MB';
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function setCleanupStatus(message, type = 'info') {
    const target = document.getElementById('swPhotoCleanupStatus');
    if (!target) return;
    target.className = `sw-backup-status ${type}`;
    target.textContent = message;
  }

  function renderCleanupPreview(scan) {
    const target = document.getElementById('swPhotoCleanupPreview');
    const deleteButton = document.getElementById('swDeleteVehiclePhotos');
    if (!target) return;
    target.innerHTML = `
      <div class="sw-photo-cleanup-grid">
        <div><strong>${scan.rows.length}</strong><span>eligible photos</span></div>
        <div><strong>${formatBytes(scan.bytes)}</strong><span>estimated recovery</span></div>
        <div><strong>${escapeHtml(scan.cutoff)}</strong><span>inspection cutoff</span></div>
        <div><strong>${escapeHtml(scan.oldestDate || '—')}</strong><span>oldest eligible inspection</span></div>
      </div>
      <p class="ops-subtle">${scan.blockedCount} old photo${scan.blockedCount === 1 ? '' : 's'} retained because the associated inspection still has an open task.</p>`;
    if (deleteButton) deleteButton.disabled = scan.rows.length === 0;
    setCleanupStatus(scan.rows.length ? 'Cleanup preview ready. Nothing has been deleted.' : 'No vehicle inspection photos are currently eligible for deletion.', 'success');
  }

  async function writeCleanupAudit(details, success = true) {
    const sb = client();
    const current = state();
    if (!sb || !current?.user) return;
    const row = {
      actor_user_id: current.user.id,
      actor_email: current.user.email || '',
      action: success ? 'vehicle_inspection_photos_retention_cleanup' : 'vehicle_inspection_photos_retention_cleanup_failed',
      entity_type: 'operations_inspection_photo',
      entity_id: null,
      summary: success
        ? `Deleted ${details.deleted_count} vehicle inspection photos under the ${RETENTION_MONTHS}-month retention rule`
        : 'Vehicle inspection photo retention cleanup completed with errors',
      details
    };
    const result = await sb.from('audit_logs').insert(row);
    if (result.error) console.warn('Photo cleanup audit log was not saved:', result.error.message);
  }

  async function deleteEligibleVehiclePhotos() {
    if (!isAdmin()) throw new Error('Only Admin users can delete retained photos.');
    const confirmation = window.prompt(`This permanently deletes eligible vehicle inspection photos older than ${RETENTION_MONTHS} months.\n\nThe inspection records, answers, notes and tasks will remain.\n\nType DELETE VEHICLE PHOTOS to continue.`);
    if (confirmation !== 'DELETE VEHICLE PHOTOS') {
      setCleanupStatus('Cleanup cancelled. No photos were deleted.', 'info');
      return;
    }

    const scan = await scanEligibleVehiclePhotos(false);
    if (!scan.rows.length) {
      renderCleanupPreview(scan);
      return;
    }

    const sb = client();
    const deletedIds = [];
    const failures = [];
    setCleanupStatus(`Deleting 0 of ${scan.rows.length} eligible photos...`, 'info');

    for (let index = 0; index < scan.rows.length; index += 1) {
      const row = scan.rows[index];
      const path = String(row.storage_path || '').replace(/^\/+/, '');
      try {
        const removed = await sb.storage.from(PHOTO_BUCKET).remove([path]);
        if (removed.error) throw removed.error;
        const metadata = await sb.from('operations_inspection_photos').delete().eq('id', row.id);
        if (metadata.error) throw metadata.error;
        deletedIds.push(String(row.id));
      } catch (error) {
        failures.push({ id: row.id, path, error: error.message || String(error) });
      }
      setCleanupStatus(`Deleting ${index + 1} of ${scan.rows.length} eligible photos...`, 'info');
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const current = state();
    if (current && Array.isArray(current.photos) && deletedIds.length) {
      const deletedSet = new Set(deletedIds);
      current.photos = current.photos.filter(photo => !deletedSet.has(String(photo.id)));
    }

    const details = {
      retention_months: RETENTION_MONTHS,
      cutoff_date: scan.cutoff,
      deleted_count: deletedIds.length,
      failed_count: failures.length,
      estimated_bytes_recovered: scan.bytes,
      deleted_photo_ids: deletedIds,
      failures
    };
    await writeCleanupAudit(details, failures.length === 0);

    cleanupScan = null;
    const finalMessage = failures.length
      ? `Deleted ${deletedIds.length} photos, but ${failures.length} could not be removed. Review the audit log before retrying.`
      : `Deleted ${deletedIds.length} eligible vehicle inspection photos. Inspection records and closed task history were retained.`;
    const finalType = failures.length ? 'error' : 'success';
    await scanEligibleVehiclePhotos(true);
    setCleanupStatus(finalMessage, finalType);
  }

  function cleanupCardHtml() {
    return `<div id="swPhotoCleanupCard" class="ops-card">
      <h3>Vehicle Inspection Photo Retention</h3>
      <p class="ops-subtle">Vehicle-check photos become eligible for deletion once the inspection is more than ${RETENTION_MONTHS} months old. Photos linked to inspections with an open task are retained.</p>
      <div class="sw-backup-warning"><strong>Protected:</strong> Height Safety photos, qualification documents, asset photos, company branding and the inspection records themselves are not touched.</div>
      <div id="swPhotoCleanupPreview" class="ops-subtle">Run a scan to see what is eligible. Nothing is deleted during a scan.</div>
      <div class="sw-backup-actions">
        <button id="swScanVehiclePhotos" type="button" class="ops-btn">Scan Eligible Vehicle Photos</button>
        <button id="swDeleteVehiclePhotos" type="button" class="ops-btn danger" disabled>Delete Eligible Vehicle Photos</button>
      </div>
      <div id="swPhotoCleanupStatus" class="sw-backup-status info" role="status" aria-live="polite">No retention scan has been run.</div>
    </div>`;
  }

  function injectCleanupStyles() {
    if (document.getElementById('swPhotoStorageV4084Styles')) return;
    const style = document.createElement('style');
    style.id = 'swPhotoStorageV4084Styles';
    style.textContent = `
      .sw-photo-cleanup-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;margin:1rem 0}
      .sw-photo-cleanup-grid>div{border:1px solid #dbe3ec;border-radius:.8rem;padding:.8rem;background:#f8fafc}
      .sw-photo-cleanup-grid strong{display:block;font-size:1.25rem;color:#003b73}
      .sw-photo-cleanup-grid span{display:block;color:#65758b;font-size:.84rem;margin-top:.2rem}
      #swDeleteVehiclePhotos:not(:disabled){background:#b42318;color:#fff}
    `;
    document.head.appendChild(style);
  }

  function mountCleanupUi() {
    const module = document.getElementById('swBackupModule');
    if (!module || !isAdmin()) return false;
    injectCleanupStyles();
    if (!document.getElementById('swPhotoCleanupCard')) {
      const cards = module.querySelectorAll(':scope > .ops-card');
      const anchor = cards[cards.length - 1];
      if (anchor) anchor.insertAdjacentHTML('beforebegin', cleanupCardHtml());
      else module.insertAdjacentHTML('beforeend', cleanupCardHtml());
    }

    const scanButton = document.getElementById('swScanVehiclePhotos');
    const deleteButton = document.getElementById('swDeleteVehiclePhotos');
    if (scanButton && scanButton.dataset.bound !== '1') {
      scanButton.dataset.bound = '1';
      scanButton.addEventListener('click', async () => {
        scanButton.disabled = true;
        try { await scanEligibleVehiclePhotos(true); }
        catch (error) { setCleanupStatus(error.message || String(error), 'error'); }
        finally { scanButton.disabled = false; }
      });
    }
    if (deleteButton && deleteButton.dataset.bound !== '1') {
      deleteButton.dataset.bound = '1';
      deleteButton.addEventListener('click', async () => {
        deleteButton.disabled = true;
        try { await deleteEligibleVehiclePhotos(); }
        catch (error) { setCleanupStatus(error.message || String(error), 'error'); }
        finally { deleteButton.disabled = !cleanupScan?.rows?.length; }
      });
    }
    return true;
  }

  function scheduleCleanupMount(attempt = 0) {
    clearTimeout(mountTimer);
    if (mountCleanupUi()) return;
    if (attempt >= 30) return;
    mountTimer = setTimeout(() => scheduleCleanupMount(attempt + 1), 75);
  }

  function install() {
    installReleaseMarker();
    installUploadCompression();
    document.addEventListener('click', event => {
      const backupTab = event.target.closest('[data-ops-view="admin-settings"]');
      if (backupTab) scheduleCleanupMount();
      applyReleaseMarker();
      installUploadCompression();
    }, true);
    window.addEventListener('pageshow', () => {
      applyReleaseMarker();
      installUploadCompression();
      scheduleCleanupMount();
    });
    scheduleCleanupMount();
    window.SWPhotoStorageV4084 = {
      version: VERSION,
      scanEligibleVehiclePhotos,
      deleteEligibleVehiclePhotos,
      compressImage
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
