import { upload } from "https://esm.sh/@vercel/blob@latest/client";

const params = new URLSearchParams(window.location.search);
const deliveryId = params.get("id");

let deliverySlug = null;
let currentPin = "";
let nextPosition = 1000;

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

        document.getElementById("delivery-title").textContent = d.title;
        document.getElementById("delivery-sub").textContent =
            d.clientName + " — creata il " + new Date(d.createdAt).toLocaleDateString("it-IT");
        document.getElementById("m-client").value = d.clientName;
        document.getElementById("m-title").value = d.title;
        document.getElementById("m-pin").value = d.pin;
        document.getElementById("m-expiry").value = d.expiresAt ? d.expiresAt.slice(0, 10) : "";

        // Le nuove posizioni partono sempre oltre l'ultima esistente: assegnata
        // una volta sola qui, lato client, non c'è mai bisogno di una lettura
        // "leggi il massimo attuale poi scrivi" lato server, che sotto upload
        // concorrenti potrebbe far leggere a due file lo stesso valore.
        nextPosition = data.photos.reduce((max, p) => Math.max(max, p.position || 0), 0) + 1000;

        renderPhotos(data.photos);
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
// UPLOAD
//
// Causa reale del bug precedente: le righe della coda venivano create solo
// dentro uploadOne(), cioè solo quando un worker arrivava effettivamente a
// gestire quel file. Con 3 worker concorrenti, al massimo 3 righe potevano
// esistere in un dato momento. Se anche solo uno dei 3 upload iniziali si
// bloccava (una singola chiamata upload() che non si risolve né rigetta mai
// — possibile con qualunque libreria di rete, specie su tanti file di fila),
// quel worker restava bloccato per sempre su quel file: non prendeva mai in
// carico i successivi, e la maggior parte dei 100 file selezionati non
// veniva mai nemmeno tentata. Da qui: "solo 2-3 righe visibili, il resto non
// compare, barra ferma allo 0%".
//
// La correzione ha due parti:
// 1) Ogni file crea la sua riga IMMEDIATAMENTE alla selezione, prima ancora
//    che un worker lo prenda in carico (stato "In coda") — così tutti i file
//    sono sempre visibili, indipendentemente da quanti worker sono liberi.
// 2) Ogni tentativo di upload è avvolto in un timeout reale (Promise.race):
//    se upload() non risolve né rigetta entro un tempo ragionevole, il
//    tentativo viene considerato fallito e il worker passa al file
//    successivo. Nessun singolo file può più bloccare la coda per sempre.
// ============================================================

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const uploadQueue = document.getElementById("upload-queue");
const uploadBanner = document.getElementById("upload-banner");
const uploadBannerText = document.getElementById("upload-banner-text");
const retryAllBtn = document.getElementById("retry-all-btn");

const CONCURRENCY = 3;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1500;

let pendingCount = 0;
let batchTotal = 0;
let batchDone = 0;
let batchFailed = 0;
let failedItems = [];

// Se l'utente ricarica/chiude la pagina mentre ci sono upload in corso o in
// coda, quei file andrebbero persi silenziosamente (upload magari già
// arrivato su Blob ma mai registrato su Supabase). Meglio avvisare prima.
window.addEventListener("beforeunload", (e) => {
    if (pendingCount > 0) {
        e.preventDefault();
        e.returnValue = "";
    }
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
    if (files.length) handleFiles(files).catch(() => {});
});

dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
    }
});

fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files || []);
    if (files.length) handleFiles(files).catch(() => {});
    fileInput.value = "";
});

function safeName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isAllowedType(file) {
    return ALLOWED_TYPE_PREFIXES.some((prefix) => (file.type || "").startsWith(prefix));
}

// Scala con la dimensione del file: 30s di base + ~1s per MB, tra un minimo
// di 30s e un massimo di 10 minuti. Un file bloccato non aspetta mai in eterno.
function uploadTimeoutMs(file) {
    const perMb = Math.ceil(file.size / (1024 * 1024));
    return Math.min(10 * 60 * 1000, Math.max(30 * 1000, 30 * 1000 + perMb * 1000));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateBanner() {
    if (batchTotal === 0) {
        uploadBanner.hidden = true;
        return;
    }
    uploadBanner.hidden = false;
    const inProgress = batchTotal - batchDone - batchFailed;
    uploadBannerText.textContent =
        `Caricamento: ${batchDone}/${batchTotal} completati` +
        (inProgress > 0 ? `, ${inProgress} in corso o in coda` : "") +
        (batchFailed > 0 ? `, ${batchFailed} falliti` : "");
    retryAllBtn.hidden = batchFailed === 0;
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

// upload() è caricata da un CDN (esm.sh) invece che installata come
// dipendenza bundlata: non posso escludere che, sotto carico o su reti
// instabili, una singola chiamata resti sospesa senza mai risolvere né
// rigettare. Promise.race con un timeout esplicito rende il sistema
// affidabile A PRESCINDERE da questo: anche se upload() restasse bloccata
// per sempre in background, il nostro codice smette comunque di aspettarla.
function uploadWithTimeout(pathname, file, onProgress) {
    const controller = new AbortController();
    const timeoutMs = uploadTimeoutMs(file);

    const timeout = new Promise((_, reject) => {
        setTimeout(() => {
            controller.abort();
            reject(new Error("timeout: upload troppo lento o bloccato"));
        }, timeoutMs);
    });

    const uploadPromise = upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/admin/photos/upload-token",
        contentType: file.type,
        multipart: file.size > 8 * 1024 * 1024,
        abortSignal: controller.signal,
        onUploadProgress: ({ percentage }) => onProgress(percentage),
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
            setItemState(item, "uploading", "Caricamento…");
            setItemProgress(item, 0);

            // Se in un tentativo precedente l'upload su Blob era già andato a
            // buon fine e a fallire era stato solo il salvataggio, non
            // ricarichiamo da capo il file: ripartiamo solo dal salvataggio.
            if (!item.blob) {
                item.blob = await uploadWithTimeout(item.pathname, item.file, (pct) => {
                    setItemProgress(item, pct);
                });
            } else {
                setItemProgress(item, 100);
            }

            setItemState(item, "processing", "Elaborazione…");
            // Una pausa vera (non solo un microtask) così il browser fa
            // realmente un frame di rendering e lo stato è visibile davvero,
            // non solo assegnato e immediatamente sovrascritto.
            await sleep(120);

            setItemState(item, "saving", "Salvataggio…");
            const photo = await finalizeItem(item, item.blob);

            setItemState(item, "done", "Completato ✓");
            setItemProgress(item, 100);
            addPhotoCard({ id: photo.id, name: item.file.name, url: item.blob.url, contentType: item.file.type });
            batchDone++;
            updateBanner();
            setTimeout(() => item.row.remove(), 1800);
            return;
        } catch (err) {
            const isLastAttempt = attempt === MAX_ATTEMPTS;

            if (isLastAttempt) {
                const reason = err && err.message ? err.message : "errore upload";
                setItemState(item, "error", "Errore — " + reason);
                item.row.querySelector(".retry-item").hidden = false;
                batchFailed++;
                failedItems.push(item);
                updateBanner();
                return;
            }

            setItemState(item, "queued", `In attesa (nuovo tentativo ${attempt + 1}/${MAX_ATTEMPTS})…`);
            await sleep(RETRY_BASE_DELAY_MS * attempt);
        }
    }
}

async function runItem(item) {
    pendingCount++;
    try {
        await attemptItem(item);
    } finally {
        pendingCount--;
    }
}

function retryItem(item) {
    batchFailed = Math.max(0, batchFailed - 1);
    failedItems = failedItems.filter((f) => f !== item);
    item.row.querySelector(".retry-item").hidden = true;
    updateBanner();
    runItem(item).catch(() => {});
}

async function runQueue(items) {
    let index = 0;

    async function worker() {
        while (index < items.length) {
            const item = items[index++];
            await runItem(item);
        }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker);
    await Promise.all(workers);
}

async function handleFiles(files) {
    // Ogni file crea SUBITO la propria riga, prima di qualunque await: con
    // 100 file selezionati compaiono subito 100 righe, tutte in stato
    // "In coda", indipendentemente da quanti worker sono disponibili.
    const items = [];

    files.forEach((file) => {
        const row = buildUploadRow(file);
        batchTotal++;

        if (!isAllowedType(file)) {
            setItemState({ row }, "error", "Errore — tipo di file non supportato");
            batchFailed++;
            updateBanner();
            return;
        }

        nextPosition += 1000;
        const item = {
            file,
            row,
            position: nextPosition,
            pathname: `deliveries/${deliverySlug}/${Date.now()}-${safeName(file.name)}`,
            blob: null,
        };
        row.querySelector(".retry-item").addEventListener("click", () => retryItem(item));
        items.push(item);
    });

    updateBanner();
    await runQueue(items);
}

retryAllBtn.addEventListener("click", () => {
    const toRetry = [...failedItems];
    failedItems = [];
    batchFailed = 0;
    toRetry.forEach((item) => { item.row.querySelector(".retry-item").hidden = true; });
    updateBanner();
    runQueue(toRetry).catch(() => {});
});

(async function init() {
    const ok = await checkAuth();
    if (ok) loadDelivery();
})();
