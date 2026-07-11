import { upload } from "https://esm.sh/@vercel/blob@latest/client";

const params = new URLSearchParams(window.location.search);
const deliveryId = params.get("id");

let deliverySlug = null;
let currentPin = "";

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
    const res = await fetch(`/api/admin/deliveries/${encodeURIComponent(deliveryId)}`);
    const data = await res.json();

    if (!res.ok || !data.ok) {
        document.getElementById("delivery-title").textContent = "Consegna non trovata";
        return;
    }

    const d = data.delivery;
    deliverySlug = d.slug;
    currentPin = d.pin;

    document.getElementById("delivery-title").textContent = d.title;
    document.getElementById("delivery-sub").textContent = d.clientName + " — creata il " + new Date(d.createdAt).toLocaleDateString("it-IT");
    document.getElementById("m-client").value = d.clientName;
    document.getElementById("m-title").value = d.title;
    document.getElementById("m-pin").value = d.pin;
    document.getElementById("m-expiry").value = d.expiresAt ? d.expiresAt.slice(0, 10) : "";

    renderPhotos(data.photos);
}

function renderPhotos(photos) {
    const grid = document.getElementById("photo-grid");
    grid.innerHTML = "";
    document.getElementById("gallery-count-label").textContent = `GALLERIA (${photos.length} FILE)`;

    photos.forEach((photo) => {
        const card = document.createElement("div");
        card.className = "photo-card";
        card.dataset.id = photo.id;

        const isVideo = (photo.contentType || "").startsWith("video/");
        const media = document.createElement(isVideo ? "video" : "img");
        media.src = photo.url;
        if (isVideo) {
            media.muted = true;
            media.playsInline = true;
        } else {
            media.alt = photo.name;
        }
        card.appendChild(media);

        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-photo";
        removeBtn.type = "button";
        removeBtn.setAttribute("aria-label", "Elimina " + photo.name);
        removeBtn.innerHTML = "✕";
        removeBtn.addEventListener("click", async () => {
            if (!confirm("Eliminare questo file dalla galleria?")) return;
            const res = await fetch(`/api/admin/photos/${encodeURIComponent(photo.id)}`, { method: "DELETE" });
            if (res.ok) {
                card.remove();
                const remaining = grid.querySelectorAll(".photo-card").length;
                document.getElementById("gallery-count-label").textContent = `GALLERIA (${remaining} FILE)`;
            } else {
                alert("Errore durante l'eliminazione. Riprova.");
            }
        });
        card.appendChild(removeBtn);

        grid.appendChild(card);
    });
}

function addPhotoCard(photo) {
    const grid = document.getElementById("photo-grid");
    const card = document.createElement("div");
    card.className = "photo-card";
    card.dataset.id = photo.id;

    const isVideo = (photo.contentType || "").startsWith("video/");
    const media = document.createElement(isVideo ? "video" : "img");
    media.src = photo.url;
    if (isVideo) {
        media.muted = true;
        media.playsInline = true;
    }
    card.appendChild(media);

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-photo";
    removeBtn.type = "button";
    removeBtn.innerHTML = "✕";
    removeBtn.addEventListener("click", async () => {
        if (!confirm("Eliminare questo file dalla galleria?")) return;
        const res = await fetch(`/api/admin/photos/${encodeURIComponent(photo.id)}`, { method: "DELETE" });
        if (res.ok) {
            card.remove();
            const remaining = grid.querySelectorAll(".photo-card").length;
            document.getElementById("gallery-count-label").textContent = `GALLERIA (${remaining} FILE)`;
        }
    });
    card.appendChild(removeBtn);

    grid.appendChild(card);
    document.getElementById("gallery-count-label").textContent =
        `GALLERIA (${grid.querySelectorAll(".photo-card").length} FILE)`;
}

// META FORM
document.getElementById("meta-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const feedback = document.getElementById("meta-feedback");
    feedback.textContent = "Salvataggio...";

    const body = {
        clientName: document.getElementById("m-client").value.trim(),
        title: document.getElementById("m-title").value.trim(),
        pin: document.getElementById("m-pin").value.trim(),
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
        feedback.textContent = "Salvato.";
        setTimeout(() => { feedback.textContent = ""; }, 2000);
    } catch {
        feedback.textContent = "Errore di connessione.";
    }
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
        // ignora se il clipboard non è disponibile
    }
});

document.getElementById("delete-delivery-btn").addEventListener("click", async () => {
    if (!confirm("Eliminare definitivamente questa consegna e tutti i file? L'operazione non è reversibile.")) return;

    const res = await fetch(`/api/admin/deliveries/${encodeURIComponent(deliveryId)}`, { method: "DELETE" });
    if (res.ok) {
        window.location.href = "index.html";
    } else {
        alert("Errore durante l'eliminazione. Riprova.");
    }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "login.html";
});

// UPLOAD
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const uploadQueue = document.getElementById("upload-queue");

["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    });
});

["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
    });
});

dropzone.addEventListener("drop", (e) => {
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) handleFiles(files);
});

fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files || []);
    if (files.length) handleFiles(files);
    fileInput.value = "";
});

function safeName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function uploadOne(file) {
    const row = document.createElement("div");
    row.className = "upload-item";
    row.innerHTML = `
        <span class="name">${escapeHtml(file.name)}</span>
        <div class="bar-track"><div class="bar-fill"></div></div>
    `;
    uploadQueue.appendChild(row);
    const bar = row.querySelector(".bar-fill");

    try {
        const pathname = `deliveries/${deliverySlug}/${Date.now()}-${safeName(file.name)}`;

        const blob = await upload(pathname, file, {
            access: "public",
            handleUploadUrl: "/api/admin/photos/upload-token",
            contentType: file.type,
            multipart: file.size > 8 * 1024 * 1024,
            onUploadProgress: ({ percentage }) => {
                bar.style.width = percentage + "%";
            },
        });

        const finalizeRes = await fetch("/api/admin/photos/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                deliveryId,
                blobUrl: blob.url,
                pathname: blob.pathname,
                filename: file.name,
                contentType: file.type,
                size: file.size,
            }),
        });
        const finalizeData = await finalizeRes.json();

        if (!finalizeRes.ok || !finalizeData.ok) {
            throw new Error("finalize_failed");
        }

        row.classList.add("done");
        bar.style.width = "100%";
        addPhotoCard({ id: finalizeData.photo.id, name: file.name, url: blob.url, contentType: file.type });
        setTimeout(() => row.remove(), 1500);
    } catch (err) {
        row.classList.add("error");
        row.querySelector(".name").textContent = file.name + " — errore upload";
    }
}

const CONCURRENCY = 3;

async function handleFiles(files) {
    let index = 0;

    async function next() {
        const i = index++;
        if (i >= files.length) return;
        await uploadOne(files[i]);
        await next();
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, next);
    await Promise.all(workers);
}

(async function init() {
    const ok = await checkAuth();
    if (ok) loadDelivery();
})();
