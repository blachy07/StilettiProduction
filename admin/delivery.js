// upload() viene caricata da CDN (esm.sh) invece che bundlata come dipendenza,
// perché il sito non ha uno step di build. Il protocollo di token tra client
// e server è specifico della versione: caricare "@latest" dal CDN mentre il
// server usa una versione diversa (risolta indipendentemente da npm install)
// produce esattamente il sintomo osservato — il token si genera con successo,
// ma la richiesta diretta verso lo storage Vercel viene rifiutata con 400.
// Per eliminare la possibilità di questo disallineamento, la versione esatta
// viene chiesta al server (che la legge dalla propria dipendenza realmente
// installata) e il client importa dal CDN quella stessa identica versione.
let uploadFnPromise = null;

function getUploadFn() {
    if (!uploadFnPromise) {
        uploadFnPromise = (async () => {
            let version = "latest";
            try {
                const res = await fetch("/api/admin/blob-version");
                const data = await res.json();
                // --- LOG TEMPORANEO DI DEBUG: rimuovere una volta trovata la causa del 400 ---
                console.log("[upload DEBUG] risposta /api/admin/blob-version:", data);
                // --- FINE LOG TEMPORANEO ---
                if (data && data.ok && data.version) version = data.version;
            } catch (err) {
                console.log("[upload DEBUG] errore nel leggere la versione dal server:", err);
            }
            const url = `https://esm.sh/@vercel/blob@${version}/client`;
            console.log("[upload DEBUG] import client da:", url);
            const mod = await import(url);
            return mod.upload;
        })();
    }
    return uploadFnPromise;
}

const params = new URLSearchParams(window.location.search);
const deliveryId = params.get("id");

let deliverySlug = null;
let currentPin = "";
let nextPosition = 1000;
let existingPhotos = []; // dal server: usato per rilevare duplicati e per riconciliare il manifest

const ALLOWED_TYPE_PREFIXES = ["image/", "video/"];

async function checkAuth() {
    const res = await fetch("/api/admin/me");
    if (!res.ok) {
        window.location.href = "login.html";
        return false;
    }
    return true;
}

function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}

function photoFingerprint(name, size) {
    return name + "::" + size;
}

// ============================================================
// MANIFEST DI SESSIONE (recupero dopo refresh accidentale)
//
// Non è possibile far riprendere a un browser l'upload di un File esatto
// dopo un ricaricamento di pagina: l'oggetto File non sopravvive al reload
// e non usiamo la File System Access API (supporto troppo parziale tra i
// browser per un pannello che deve funzionare ovunque). Quello che invece
// possiamo garantire con certezza è: dopo un refresh, sapere ESATTAMENTE
// quali file risultano già salvati sul server e quali no — cross-verificato
// con la galleria reale restituita dall'API, non solo con quello che
// pensavamo di aver fatto lato browser.
// ============================================================

function manifestKey() {
    return "consegna_admin_upload_manifest:" + deliveryId;
}

function loadManifest() {
    try {
        return JSON.parse(sessionStorage.getItem(manifestKey()) || "{}");
    } catch {
        return {};
    }
}

function saveManifest(manifest) {
    try {
        sessionStorage.setItem(manifestKey(), JSON.stringify(manifest));
    } catch {
        // storage pieno o non disponibile (es. modalità privata): il recupero dopo
        // refresh non sarà disponibile, ma l'upload in corso non ne risente.
    }
}

function markManifest(file, status) {
    const manifest = loadManifest();
    const key = photoFingerprint(file.name, file.size);
    if (status === null) {
        delete manifest[key];
    } else {
        manifest[key] = { name: file.name, size: file.size, status, updatedAt: Date.now() };
    }
    saveManifest(manifest);
}

function reconcileManifest(photos) {
    const manifest = loadManifest();
    const serverFingerprints = new Set(photos.map((p) => photoFingerprint(p.name, p.sizeBytes)));
    const unresolved = [];

    Object.keys(manifest).forEach((key) => {
        const entry = manifest[key];
        if (serverFingerprints.has(photoFingerprint(entry.name, entry.size))) {
            delete manifest[key]; // confermato presente sul server: non serve più tracciarlo
        } else if (entry.status !== "done") {
            unresolved.push(entry);
        }
    });

    saveManifest(manifest);
    return unresolved;
}

function showResumeBanner(unresolved) {
    const banner = document.getElementById("resume-banner");
    if (!unresolved.length) {
        banner.hidden = true;
        return;
    }

    const names = unresolved.slice(0, 8).map((e) => e.name);
    const extra = unresolved.length > 8 ? ` e altri ${unresolved.length - 8}` : "";

    document.getElementById("resume-banner-title").textContent =
        `${unresolved.length} file della sessione precedente non risultano salvati.`;
    document.getElementById("resume-banner-list").textContent =
        `${names.join(", ")}${extra}. Riseleziona questi file per ricaricarli — quelli già presenti in galleria non verranno duplicati.`;
    banner.hidden = false;
}

document.getElementById("resume-dismiss-btn").addEventListener("click", () => {
    document.getElementById("resume-banner").hidden = true;
});

async function loadDelivery() {
    document.getElementById("loading-state").hidden = false;
    document.getElementById("delivery-content").hidden = true;

    try {
        const res = await fetch(`/api/admin/deliveries/${encodeURIComponent(deliveryId)}`);
        const data = await res.json();

        if (!res.ok || !data.ok) {
            document.getElementById("delivery-title").textContent = "Consegna non trovata";
            document.getElementById("loading-state").hidden = true;
            return;
        }

        const d = data.delivery;
        deliverySlug = d.slug;
        currentPin = d.pin;
        existingPhotos = data.photos;

        document.getElementById("delivery-title").textContent = d.title;
        document.getElementById("delivery-sub").textContent =
            d.clientName + " — creata il " + new Date(d.createdAt).toLocaleDateString("it-IT");
        document.getElementById("m-client").value = d.clientName;
        document.getElementById("m-title").value = d.title;
        document.getElementById("m-pin").value = d.pin;
        document.getElementById("m-expiry").value = d.expiresAt ? d.expiresAt.slice(0, 10) : "";

        // Le nuove posizioni partono sempre oltre l'ultima esistente: assegnata una
        // sola volta qui lato client, evitando qualunque lettura-poi-scrittura
        // concorrente lato server che con più upload in parallelo potrebbe far
        // leggere a due file lo stesso valore massimo.
        nextPosition = data.photos.reduce((max, p) => Math.max(max, p.position || 0), 0) + 1000;

        renderPhotos(data.photos);
        showResumeBanner(reconcileManifest(data.photos));
        document.getElementById("delivery-content").hidden = false;
    } catch {
        window.showToast("Errore di connessione durante il caricamento.", "error");
    } finally {
        document.getElementById("loading-state").hidden = true;
    }
}

function updateGalleryEmptyState() {
    const grid = document.getElementById("photo-grid");
    const count = grid.querySelectorAll(".photo-card").length;
    document.getElementById("gallery-empty").hidden = count > 0;
    document.getElementById("gallery-count-label").textContent = `GALLERIA (${count} FILE)`;
}

function buildPhotoCard(photo) {
    const card = document.createElement("div");
    card.className = "photo-card";
    card.dataset.id = photo.id;

    const isVideo = (photo.contentType || "").startsWith("video/");
    const media = document.createElement(isVideo ? "video" : "img");
    media.src = photo.url;
    media.loading = "lazy";
    if (isVideo) {
        media.muted = true;
        media.playsInline = true;
        media.preload = "metadata";
    } else {
        media.alt = photo.name;
    }
    card.appendChild(media);

    if (isVideo) {
        const badge = document.createElement("span");
        badge.className = "media-badge";
        badge.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        card.appendChild(badge);
    }

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-photo";
    removeBtn.type = "button";
    removeBtn.setAttribute("aria-label", "Elimina " + photo.name);
    removeBtn.innerHTML = "✕";
    removeBtn.addEventListener("click", async () => {
        if (!confirm("Eliminare questo file dalla galleria?")) return;
        removeBtn.disabled = true;
        try {
            const res = await fetch(`/api/admin/photos/${encodeURIComponent(photo.id)}`, { method: "DELETE" });
            if (res.ok) {
                card.remove();
                existingPhotos = existingPhotos.filter((p) => p.id !== photo.id);
                updateGalleryEmptyState();
                window.showToast("File eliminato.", "success");
            } else {
                window.showToast("Errore durante l'eliminazione. Riprova.", "error");
                removeBtn.disabled = false;
            }
        } catch {
            window.showToast("Errore di connessione. Riprova.", "error");
            removeBtn.disabled = false;
        }
    });
    card.appendChild(removeBtn);

    return card;
}

function renderPhotos(photos) {
    const grid = document.getElementById("photo-grid");
    grid.innerHTML = "";
    photos.forEach((photo) => grid.appendChild(buildPhotoCard(photo)));
    updateGalleryEmptyState();
}

function addPhotoCard(photo) {
    document.getElementById("photo-grid").appendChild(buildPhotoCard(photo));
    existingPhotos.push(photo);
    updateGalleryEmptyState();
}

// META FORM
document.getElementById("meta-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const feedback = document.getElementById("meta-feedback");
    const pin = document.getElementById("m-pin").value.trim();

    if (!/^[A-Za-z0-9]{6}$/.test(pin)) {
        feedback.textContent = "Il PIN deve avere esattamente 6 caratteri (lettere o numeri).";
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    feedback.textContent = "Salvataggio...";

    const body = {
        clientName: document.getElementById("m-client").value.trim(),
        title: document.getElementById("m-title").value.trim(),
        pin,
        expiresAt: document.getElementById("m-expiry").value
            ? new Date(document.getElementById("m-expiry").value + "T23:59:59").toISOString()
            : null,
    };

    try {
        const res = await fetch(`/api/admin/deliveries/${encodeURIComponent(deliveryId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok || !data.ok) {
            feedback.textContent = data.error === "pin_taken" ? "PIN già in uso." : "Errore durante il salvataggio.";
            return;
        }

        currentPin = data.delivery.pin;
        document.getElementById("delivery-title").textContent = data.delivery.title;
        document.getElementById("delivery-sub").textContent =
            data.delivery.clientName + " — creata il " + new Date().toLocaleDateString("it-IT");
        feedback.textContent = "";
        window.showToast("Modifiche salvate.", "success");
    } catch {
        feedback.textContent = "Errore di connessione.";
    } finally {
        submitBtn.disabled = false;
    }
});

document.getElementById("m-pin").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
});

document.getElementById("m-generate-pin").addEventListener("click", async () => {
    const res = await fetch("/api/admin/generate-pin");
    const data = await res.json();
    if (res.ok && data.ok) {
        document.getElementById("m-pin").value = data.pin;
    }
});

document.getElementById("copy-pin-btn").addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(currentPin);
        const btn = document.getElementById("copy-pin-btn");
        btn.textContent = "COPIATO!";
        setTimeout(() => { btn.textContent = "COPIA PIN"; }, 1500);
    } catch {
        window.showToast("Impossibile copiare: usa la selezione manuale.", "error");
    }
});

document.getElementById("delete-delivery-btn").addEventListener("click", async (e) => {
    if (!confirm("Eliminare definitivamente questa consegna e tutti i file? L'operazione non è reversibile.")) return;

    e.target.disabled = true;
    try {
        const res = await fetch(`/api/admin/deliveries/${encodeURIComponent(deliveryId)}`, { method: "DELETE" });
        if (res.ok) {
            window.location.href = "index.html";
        } else {
            window.showToast("Errore durante l'eliminazione. Riprova.", "error");
            e.target.disabled = false;
        }
    } catch {
        window.showToast("Errore di connessione. Riprova.", "error");
        e.target.disabled = false;
    }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "login.html";
});

// ============================================================
// MOTORE DI UPLOAD — progettato per reti lente/instabili
//
// Le ottimizzazioni sono tutte VERE meccanismi di adattamento, non solo
// timeout più lunghi:
//
// 1) Concorrenza adattiva (stile controllo di congestione): parte da un
//    valore stimato dalla connessione (Network Information API, dove
//    disponibile) e si RIDUCE immediatamente al primo timeout/errore,
//    aumentando di nuovo solo dopo diversi successi consecutivi puliti.
// 2) Timeout calibrato sulla velocità REALE osservata in questa sessione
//    (non solo sulla dimensione del file): se la rete è lenta, i timeout
//    si allungano automaticamente; se è veloce, restano stretti così un
//    file davvero bloccato viene rilevato prima.
// 3) Consapevolezza online/offline: la coda si mette in pausa quando la
//    rete cade e riprende da sola alla riconnessione, ritentando in
//    automatico solo i file falliti per quel motivo.
// 4) Priorità ai file piccoli, per mantenere il sistema reattivo e dare
//    subito un segnale di progresso anche su reti lente.
// 5) Manifest di sessione per sapere con certezza, dopo un refresh
//    accidentale, cosa era già stato salvato (vedi sezione sopra).
// 6) Prevenzione duplicati: un file già presente in galleria (per nome e
//    dimensione) non viene ricaricato, sia in caso di reselezione dopo un
//    refresh sia in caso di doppia selezione per errore.
// ============================================================

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const uploadQueue = document.getElementById("upload-queue");
const uploadBanner = document.getElementById("upload-banner");
const uploadBannerText = document.getElementById("upload-banner-text");
const retryAllBtn = document.getElementById("retry-all-btn");

const MIN_CONCURRENCY = 1;
const MAX_ATTEMPTS = 4;
const GOOD_STREAK_TO_GROW = 4;
const COOLDOWN_AFTER_SHRINK = 3;

let concurrencyTarget = initialConcurrency();
let activeWorkers = 0;
let queue = [];
let goodStreak = 0;
let cooldown = 0;
let measuredBytesPerSecond = null;
let isOnline = navigator.onLine !== false;

let pendingCount = 0;
let batchTotal = 0;
let batchDone = 0;
let batchFailed = 0;
let batchSkipped = 0;
let failedItems = [];

function connectionInfo() {
    return navigator.connection || navigator.webkitConnection || navigator.mozConnection || null;
}

function initialConcurrency() {
    const conn = connectionInfo();
    if (!conn) return 3;
    if (conn.saveData) return 1;
    if (conn.effectiveType === "slow-2g" || conn.effectiveType === "2g") return 1;
    if (conn.effectiveType === "3g") return 2;
    if (conn.effectiveType === "4g") return 4;
    return 3;
}

function maxConcurrencyForConnection() {
    const conn = connectionInfo();
    if (conn && (conn.effectiveType === "2g" || conn.effectiveType === "slow-2g")) return 2;
    return 6;
}

// Chiamata dopo ogni upload riuscito al primo tentativo, senza timeout: è il
// segnale che la rete regge bene il carico attuale.
function reportGoodOutcome() {
    if (cooldown > 0) {
        cooldown--;
        return;
    }
    goodStreak++;
    if (goodStreak >= GOOD_STREAK_TO_GROW && concurrencyTarget < maxConcurrencyForConnection()) {
        concurrencyTarget++;
        goodStreak = 0;
        updateBanner();
        spawnWorkersIfNeeded();
    }
}

// Chiamata a ogni timeout o errore di rete: riduce subito la concorrenza,
// invece di aspettare che l'intero lotto fallisca prima di reagire.
function reportBadOutcome() {
    goodStreak = 0;
    if (concurrencyTarget > MIN_CONCURRENCY) {
        concurrencyTarget--;
        cooldown = COOLDOWN_AFTER_SHRINK;
        updateBanner();
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Stima iniziale (nessun dato reale ancora) dal downlink dichiarato dal
// browser, scontato perché il throughput reale è quasi sempre inferiore a
// quello nominale, specie in upload su reti mobili asimmetriche.
function estimatedBytesPerSecondFromConnection() {
    const conn = connectionInfo();
    if (conn && typeof conn.downlink === "number" && conn.downlink > 0) {
        return (conn.downlink * 1_000_000 / 8) * 0.4;
    }
    return null;
}

// Timeout adattivo: usa la velocità REALMENTE misurata in questa sessione
// non appena disponibile (si autocalibra file dopo file); prima di avere
// dati reali, usa la stima da Network Information API se c'è, altrimenti
// una stima prudente fissa. In tutti i casi lascia un ampio margine di
// sicurezza (3x) perché la velocità di rete oscilla, specie su hotspot/4G.
function uploadTimeoutMs(file) {
    const bytesPerSecond =
        measuredBytesPerSecond || estimatedBytesPerSecondFromConnection() || (100 * 1024); // ~100KB/s, stima prudente
    const expectedSeconds = file.size / bytesPerSecond;
    const withMargin = expectedSeconds * 3 + 15;
    return Math.min(15 * 60 * 1000, Math.max(25 * 1000, withMargin * 1000));
}

function recordThroughputSample(bytes, elapsedSeconds) {
    if (bytes < 500 * 1024 || elapsedSeconds < 0.2) return; // file troppo piccolo/veloce: campione non affidabile
    const rate = bytes / elapsedSeconds;
    measuredBytesPerSecond = measuredBytesPerSecond
        ? measuredBytesPerSecond * 0.7 + rate * 0.3
        : rate;
}

function updateBanner() {
    if (batchTotal === 0) {
        uploadBanner.hidden = true;
        return;
    }
    uploadBanner.hidden = false;
    const inProgress = batchTotal - batchDone - batchFailed - batchSkipped;
    const parts = [`${batchDone}/${batchTotal} completati`];
    if (inProgress > 0) parts.push(`${inProgress} in corso o in coda`);
    if (batchSkipped > 0) parts.push(`${batchSkipped} già presenti`);
    if (batchFailed > 0) parts.push(`${batchFailed} falliti`);

    const connLabel = !isOnline
        ? " — connessione assente, in pausa"
        : ` — ${concurrencyTarget} in parallelo`;

    uploadBannerText.textContent = "Caricamento: " + parts.join(", ") + connLabel;
    retryAllBtn.hidden = batchFailed === 0;
}

window.addEventListener("beforeunload", (e) => {
    if (pendingCount > 0) {
        e.preventDefault();
        e.returnValue = "";
    }
});

window.addEventListener("offline", () => {
    isOnline = false;
    updateBanner();
});

window.addEventListener("online", () => {
    isOnline = true;
    updateBanner();
    const toRetry = failedItems.filter((item) => item.offlineCaused);
    toRetry.forEach((item) => retryItem(item));
    spawnWorkersIfNeeded();
});

["dragover", "drop"].forEach((evt) => {
    window.addEventListener(evt, (e) => e.preventDefault());
});

dropzone.addEventListener("dragenter", () => dropzone.classList.add("dragover"));
dropzone.addEventListener("dragover", () => dropzone.classList.add("dragover"));
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));

dropzone.addEventListener("drop", (e) => {
    dropzone.classList.remove("dragover");
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) handleFiles(files);
});

dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
    }
});

fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files || []);
    if (files.length) handleFiles(files);
    fileInput.value = "";
});

function safeName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isAllowedType(file) {
    return ALLOWED_TYPE_PREFIXES.some((prefix) => (file.type || "").startsWith(prefix));
}

function setItemState(item, state, statusText) {
    item.row.className = "upload-item state-" + state;
    item.row.querySelector(".upload-status").textContent = statusText;
}

function setItemProgress(item, pct) {
    item.row.querySelector(".bar-fill").style.width = pct + "%";
    item.row.querySelector(".upload-pct").textContent = Math.round(pct) + "%";
}

function buildUploadRow(file) {
    const row = document.createElement("div");
    row.className = "upload-item state-queued";
    row.innerHTML = `
        <div class="upload-item-main">
            <span class="name">${escapeHtml(file.name)}</span>
            <span class="upload-status">In coda</span>
        </div>
        <div class="upload-item-progress">
            <div class="bar-track"><div class="bar-fill"></div></div>
            <span class="upload-pct">0%</span>
        </div>
        <div class="upload-item-actions">
            <button class="retry-item" type="button" hidden>RIPROVA</button>
            <button class="dismiss" type="button" aria-label="Rimuovi dalla lista">✕</button>
        </div>
    `;
    row.querySelector(".dismiss").addEventListener("click", () => row.remove());
    uploadQueue.appendChild(row);
    return row;
}

// Il timeout esplicito (AbortController + Promise.race) resta comunque utile
// indipendentemente dal bug di versione corretto sopra: rende il sistema
// affidabile anche nel caso, sotto carico o su reti instabili, in cui una
// chiamata resti sospesa senza mai risolvere né rigettare.
async function uploadWithTimeout(pathname, file, onProgress) {
    const uploadFn = await getUploadFn();
    const controller = new AbortController();
    const timeoutMs = uploadTimeoutMs(file);

    const timeout = new Promise((_, reject) => {
        setTimeout(() => {
            controller.abort();
            reject(new Error("timeout: rete troppo lenta o upload bloccato"));
        }, timeoutMs);
    });

    // Opzioni ridotte al set minimo documentato: "contentType" è stato
    // rimosso perché upload() lo ricava già correttamente dal File stesso,
    // e passarlo esplicitamente era un valore ridondante che poteva
    // contribuire a una richiesta non conforme a quanto il token si aspettava.
    const uploadOptions = {
        access: "public",
        handleUploadUrl: "/api/admin/photos/upload-token",
        multipart: file.size > 6 * 1024 * 1024,
        abortSignal: controller.signal,
        onUploadProgress: ({ percentage }) => onProgress(percentage),
    };

    // --- LOG TEMPORANEO DI DEBUG: rimuovere una volta trovata la causa del 400 ---
    console.log("[upload DEBUG] chiamata upload() — pathname:", pathname, "file:", file.name, file.size, file.type, "opzioni:", uploadOptions);
    // --- FINE LOG TEMPORANEO ---

    const uploadPromise = uploadFn(pathname, file, uploadOptions).catch((err) => {
        // --- LOG TEMPORANEO DI DEBUG: rimuovere una volta trovata la causa del 400 ---
        console.error("[upload DEBUG] errore completo da upload():", err);
        console.error("[upload DEBUG] err.message:", err && err.message);
        console.error("[upload DEBUG] err.cause:", err && err.cause);
        console.error("[upload DEBUG] err.response:", err && err.response);
        // --- FINE LOG TEMPORANEO ---
        throw err;
    });

    return Promise.race([uploadPromise, timeout]);
}

async function finalizeItem(item, blob) {
    const res = await fetch("/api/admin/photos/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            deliveryId,
            blobUrl: blob.url,
            pathname: blob.pathname,
            filename: item.file.name,
            contentType: item.file.type,
            size: item.file.size,
            position: item.position,
        }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
        throw new Error("upload riuscito ma salvataggio nel database non riuscito");
    }
    return data.photo;
}

async function attemptItem(item) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            setItemState(item, "uploading", isOnline ? "Caricamento…" : "In attesa di rete…");
            setItemProgress(item, 0);

            if (!isOnline) {
                await waitForOnline();
            }

            if (!item.blob) {
                const startedAt = performance.now();
                item.blob = await uploadWithTimeout(item.pathname, item.file, (pct) => {
                    setItemProgress(item, pct);
                });
                const elapsedSeconds = (performance.now() - startedAt) / 1000;
                recordThroughputSample(item.file.size, elapsedSeconds);
                if (attempt === 1) reportGoodOutcome();
            } else {
                setItemProgress(item, 100);
            }

            setItemState(item, "processing", "Elaborazione…");
            await sleep(120);

            setItemState(item, "saving", "Salvataggio…");
            markManifest(item.file, "saving");
            const photo = await finalizeItem(item, item.blob);

            setItemState(item, "done", "Completato ✓");
            setItemProgress(item, 100);
            markManifest(item.file, "done");
            addPhotoCard({ id: photo.id, name: item.file.name, url: item.blob.url, contentType: item.file.type, sizeBytes: item.file.size });
            batchDone++;
            updateBanner();
            setTimeout(() => item.row.remove(), 1800);
            return;
        } catch (err) {
            item.offlineCaused = !isOnline;
            if (!item.offlineCaused) reportBadOutcome();

            const isLastAttempt = attempt === MAX_ATTEMPTS;
            if (isLastAttempt) {
                const reason = err && err.message ? err.message : "errore upload";
                setItemState(item, "error", "Errore — " + reason);
                markManifest(item.file, "error");
                item.row.querySelector(".retry-item").hidden = false;
                batchFailed++;
                failedItems.push(item);
                updateBanner();
                return;
            }

            setItemState(item, "queued", `In attesa (nuovo tentativo ${attempt + 1}/${MAX_ATTEMPTS})…`);
            // Backoff esponenziale con jitter: evita che molti file ritentino tutti
            // nello stesso istante (che ricreerebbe lo stesso sovraccarico di rete
            // che ha causato il fallimento).
            const backoff = Math.min(20000, 1500 * 2 ** (attempt - 1));
            await sleep(backoff + Math.random() * 800);
        }
    }
}

function waitForOnline() {
    if (isOnline) return Promise.resolve();
    return new Promise((resolve) => {
        window.addEventListener("online", function handler() {
            window.removeEventListener("online", handler);
            resolve();
        });
    });
}

async function runItem(item) {
    pendingCount++;
    try {
        await attemptItem(item);
    } finally {
        pendingCount--;
    }
}

function spawnWorkersIfNeeded() {
    while (isOnline && activeWorkers < concurrencyTarget && queue.length > 0) {
        activeWorkers++;
        workerLoop();
    }
}

async function workerLoop() {
    while (isOnline && activeWorkers <= concurrencyTarget && queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        await runItem(item);
    }
    activeWorkers--;
    spawnWorkersIfNeeded();
}

function enqueue(item) {
    queue.push(item);
    spawnWorkersIfNeeded();
}

function retryItem(item) {
    batchFailed = Math.max(0, batchFailed - 1);
    failedItems = failedItems.filter((f) => f !== item);
    item.row.querySelector(".retry-item").hidden = true;
    item.offlineCaused = false;
    updateBanner();
    enqueue(item);
}

function markSkipped(row, reason) {
    setItemState({ row }, "skipped", reason);
    batchSkipped++;
    updateBanner();
}

function handleFiles(files) {
    // Priorità ai file piccoli: mantengono il sistema reattivo e danno un segnale
    // di progresso rapido anche su reti lente, invece di far attendere tutto il
    // lotto dietro a un video grande partito per primo per puro caso di selezione.
    const sorted = [...files].sort((a, b) => a.size - b.size);
    const existingFingerprints = new Set(existingPhotos.map((p) => photoFingerprint(p.name, p.sizeBytes)));

    sorted.forEach((file) => {
        const row = buildUploadRow(file);
        batchTotal++;

        if (!isAllowedType(file)) {
            setItemState({ row }, "error", "Errore — tipo di file non supportato");
            batchFailed++;
            updateBanner();
            return;
        }

        if (existingFingerprints.has(photoFingerprint(file.name, file.size))) {
            markSkipped(row, "Già presente in galleria");
            setTimeout(() => row.remove(), 2500);
            return;
        }

        nextPosition += 1000;
        const item = {
            file,
            row,
            position: nextPosition,
            pathname: `deliveries/${deliverySlug}/${Date.now()}-${safeName(file.name)}`,
            blob: null,
            offlineCaused: false,
        };
        row.querySelector(".retry-item").addEventListener("click", () => retryItem(item));
        markManifest(file, "queued");
        enqueue(item);
    });

    updateBanner();
}

retryAllBtn.addEventListener("click", () => {
    const toRetry = [...failedItems];
    failedItems = [];
    batchFailed = 0;
    toRetry.forEach((item) => {
        item.row.querySelector(".retry-item").hidden = true;
        item.offlineCaused = false;
        enqueue(item);
    });
    updateBanner();
});

(async function init() {
    const ok = await checkAuth();
    if (ok) loadDelivery();
})();
