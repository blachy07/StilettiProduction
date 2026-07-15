const pinBoxes = Array.from(document.querySelectorAll(".pin-box"));
const pinFeedback = document.getElementById("pin-feedback");
const pinSubmit = document.getElementById("pin-submit");
const pinSection = document.getElementById("pin-section");

const gallerySection = document.getElementById("gallery-section");
const galleryGrid = document.getElementById("gallery-grid");
const galleryTitle = document.getElementById("gallery-title");
const galleryClient = document.getElementById("gallery-client");
const galleryCount = document.getElementById("gallery-count");
const downloadAllBtn = document.getElementById("download-all");
const downloadStatus = document.getElementById("download-status");
const logoutBtn = document.getElementById("logout-btn");

const SESSION_KEY = "consegna_session";

function getPinValue() {
    return pinBoxes.map((box) => box.value).join("");
}

function clearPinBoxes() {
    pinBoxes.forEach((box) => { box.value = ""; box.classList.remove("error"); });
    pinBoxes[0].focus();
}

function markPinError() {
    pinBoxes.forEach((box) => box.classList.add("error"));
    setTimeout(() => pinBoxes.forEach((box) => box.classList.remove("error")), 300);
}

pinBoxes.forEach((box, i) => {
    box.addEventListener("input", () => {
        box.value = box.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 1).toUpperCase();
        if (box.value && i < pinBoxes.length - 1) {
            pinBoxes[i + 1].focus();
        }
        if (pinBoxes.every((b) => b.value)) {
            submitPin();
        }
    });

    box.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !box.value && i > 0) {
            pinBoxes[i - 1].focus();
        }
        if (e.key === "Enter") {
            submitPin();
        }
    });

    box.addEventListener("paste", (e) => {
        e.preventDefault();
        const chars = (e.clipboardData.getData("text") || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().split("");
        pinBoxes.forEach((b, idx) => { b.value = chars[idx] || ""; });
        const lastFilled = Math.min(chars.length, pinBoxes.length) - 1;
        if (lastFilled >= 0) pinBoxes[lastFilled].focus();
        if (pinBoxes.every((b) => b.value)) submitPin();
    });
});

async function submitPin() {
    const pin = getPinValue();
    if (pin.length !== pinBoxes.length) {
        pinFeedback.textContent = "Inserisci tutte le cifre del PIN.";
        return;
    }

    pinSubmit.disabled = true;
    pinFeedback.textContent = "Verifica in corso...";

    try {
        const res = await fetch("/api/verify-pin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin }),
        });
        const data = await res.json();

        if (!res.ok || !data.ok) {
            if (res.status === 429) {
                pinFeedback.textContent = "Troppi tentativi. Riprova tra qualche minuto.";
            } else if (res.status === 410) {
                pinFeedback.textContent = "Questa consegna è scaduta. Contatta il fotografo.";
            } else {
                pinFeedback.textContent = "PIN errato. Riprova.";
            }
            markPinError();
            clearPinBoxes();
            pinSubmit.disabled = false;
            return;
        }

        pinFeedback.textContent = "";
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            token: data.token,
            title: data.title,
            clientName: data.clientName,
        }));

        await enterGallery(data.token, data.title, data.clientName);
    } catch {
        pinFeedback.textContent = "Errore di connessione. Riprova.";
        pinSubmit.disabled = false;
    }
}

pinSubmit.addEventListener("click", submitPin);

async function enterGallery(token, title, clientName) {
    pinSection.hidden = true;
    gallerySection.hidden = false;
    galleryTitle.textContent = title || "";
    galleryClient.textContent = clientName || "GALLERIA";

    const result = await loadGallery(token);
    if (!result.ok) {
        sessionStorage.removeItem(SESSION_KEY);
        gallerySection.hidden = true;
        pinSection.hidden = false;
        pinFeedback.textContent = result.error === "expired"
            ? "Questa consegna è scaduta. Contatta il fotografo."
            : "Sessione scaduta. Inserisci di nuovo il PIN.";
        clearPinBoxes();
        pinSubmit.disabled = false;
    }
}

async function loadGallery(token) {
    try {
        const res = await fetch(`/api/gallery?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok || !data.ok) return { ok: false, error: data.error };

        renderGallery(data.images);
        return { ok: true };
    } catch {
        return { ok: false, error: "network" };
    }
}

function renderGallery(images) {
    galleryGrid.innerHTML = "";
    galleryCount.textContent = images.length + " FOTO";

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const img = entry.target.querySelector("img");
            if (img && img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute("data-src");
                img.addEventListener("load", () => img.classList.add("loaded"), { once: true });
            }
            obs.unobserve(entry.target);
        });
    }, { rootMargin: "200px 0px" });

    images.forEach((photo) => {
        const item = document.createElement("div");
        item.className = "gallery-photo";

        const img = document.createElement("img");
        img.dataset.src = photo.previewUrl;
        img.alt = photo.name;
        item.appendChild(img);

        const dl = document.createElement("a");
        dl.className = "photo-download";
        dl.href = photo.url;
        dl.download = photo.name;
        dl.setAttribute("aria-label", "Scarica " + photo.name);
        dl.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>';
        item.appendChild(dl);

        galleryGrid.appendChild(item);
        observer.observe(item);
    });
}

downloadAllBtn.addEventListener("click", async () => {
    const items = Array.from(galleryGrid.querySelectorAll(".gallery-photo")).map((item) => ({
        url: item.querySelector("a.photo-download").getAttribute("href"),
        name: item.querySelector("a.photo-download").getAttribute("download"),
    }));

    if (!items.length) return;

    downloadAllBtn.disabled = true;
    const zip = new JSZip();
    let done = 0;

    try {
        for (const item of items) {
            downloadStatus.textContent = `Preparazione ZIP... ${done}/${items.length}`;
            const res = await fetch(item.url);
            const blob = await res.blob();
            zip.file(item.name, blob);
            done++;
        }

        downloadStatus.textContent = "Creazione archivio...";
        const zipBlob = await zip.generateAsync({ type: "blob" });

        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = (galleryTitle.textContent || "galleria").trim() + ".zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        downloadStatus.textContent = "Download completato.";
    } catch {
        downloadStatus.textContent = "Errore durante la creazione dello zip. Riprova.";
    } finally {
        downloadAllBtn.disabled = false;
    }
});

logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    galleryGrid.innerHTML = "";
    gallerySection.hidden = true;
    pinSection.hidden = false;
    pinFeedback.textContent = "";
    clearPinBoxes();
});

(function restoreSession() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
        const { token, title, clientName } = JSON.parse(raw);
        if (token) enterGallery(token, title, clientName);
    } catch {
        sessionStorage.removeItem(SESSION_KEY);
    }
})();
