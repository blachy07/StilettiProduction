let deliveries = [];

async function checkAuth() {
    const res = await fetch("/api/admin/me");
    if (!res.ok) {
        window.location.href = "login.html";
        return false;
    }
    return true;
}

function statusLabel(delivery) {
    if (delivery.status === "archived") return { cls: "archived", text: "ARCHIVIATA" };
    if (delivery.expiresAt && new Date(delivery.expiresAt).getTime() < Date.now()) {
        return { cls: "expired", text: "SCADUTA" };
    }
    return { cls: "active", text: "ATTIVA" };
}

function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}

function renderStats() {
    const total = deliveries.length;
    const active = deliveries.filter((d) => statusLabel(d).cls === "active").length;
    const expired = deliveries.filter((d) => statusLabel(d).cls === "expired").length;
    const files = deliveries.reduce((sum, d) => sum + (d.photoCount || 0), 0);

    document.getElementById("stat-total").textContent = total;
    document.getElementById("stat-active").textContent = active;
    document.getElementById("stat-expired").textContent = expired;
    document.getElementById("stat-files").textContent = files;
    document.getElementById("stats-row").hidden = total === 0;
}

function renderDeliveries(list, hasSearch) {
    const tbody = document.getElementById("deliveries-tbody");
    const emptyState = document.getElementById("empty-state");
    const emptyStateText = document.getElementById("empty-state-text");
    tbody.innerHTML = "";

    if (!list.length) {
        emptyStateText.textContent = hasSearch
            ? "Nessuna consegna corrisponde alla ricerca."
            : 'Nessuna consegna ancora. Creane una con "+ Nuova Consegna".';
        emptyState.hidden = false;
        return;
    }
    emptyState.hidden = true;

    list.forEach((d) => {
        const tr = document.createElement("tr");
        const status = statusLabel(d);

        tr.innerHTML = `
            <td data-label="Cliente">${escapeHtml(d.clientName)}</td>
            <td data-label="Titolo">${escapeHtml(d.title)}</td>
            <td data-label="PIN"><span class="pin-chip">${escapeHtml(d.pin)}</span></td>
            <td data-label="Foto/Video">${d.photoCount}</td>
            <td data-label="Scadenza">${formatDate(d.expiresAt)}</td>
            <td data-label="Stato"><span class="status-badge ${status.cls}">${status.text}</span></td>
            <td data-label="Azioni">
                <div class="row-actions">
                    <button class="btn-ghost" data-action="open" data-id="${d.id}">APRI</button>
                    <button class="btn-ghost" data-action="copy-pin" data-pin="${escapeHtml(d.pin)}">COPIA PIN</button>
                    <button class="btn-danger" data-action="delete" data-id="${d.id}">ELIMINA</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function loadDeliveries() {
    document.getElementById("loading-state").hidden = false;
    document.getElementById("table-wrap").hidden = true;

    try {
        const res = await fetch("/api/admin/deliveries");
        const data = await res.json();
        if (!res.ok || !data.ok) {
            window.showToast("Impossibile caricare le consegne.", "error");
            return;
        }

        deliveries = data.deliveries;
        document.getElementById("deliveries-count").textContent =
            deliveries.length === 1 ? "1 consegna totale" : deliveries.length + " consegne totali";
        renderStats();
        applySearch();
    } catch {
        window.showToast("Errore di connessione. Riprova.", "error");
    } finally {
        document.getElementById("loading-state").hidden = true;
        document.getElementById("table-wrap").hidden = false;
    }
}

function applySearch() {
    const q = document.getElementById("search-input").value.trim().toLowerCase();
    const filtered = !q
        ? deliveries
        : deliveries.filter((d) =>
            d.clientName.toLowerCase().includes(q) || d.title.toLowerCase().includes(q)
        );
    renderDeliveries(filtered, Boolean(q));
}

document.getElementById("search-input").addEventListener("input", applySearch);

document.getElementById("deliveries-tbody").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;

    if (action === "open") {
        window.location.href = `delivery.html?id=${encodeURIComponent(btn.dataset.id)}`;
        return;
    }

    if (action === "copy-pin") {
        try {
            await navigator.clipboard.writeText(btn.dataset.pin);
            btn.textContent = "COPIATO!";
            setTimeout(() => { btn.textContent = "COPIA PIN"; }, 1500);
        } catch {
            window.showToast("Impossibile copiare: usa la selezione manuale.", "error");
        }
        return;
    }

    if (action === "delete") {
        if (!confirm("Eliminare definitivamente questa consegna e tutte le sue foto/video? L'operazione non è reversibile.")) return;

        btn.disabled = true;
        try {
            const res = await fetch(`/api/admin/deliveries/${encodeURIComponent(btn.dataset.id)}`, { method: "DELETE" });
            if (res.ok) {
                window.showToast("Consegna eliminata.", "success");
                loadDeliveries();
            } else {
                window.showToast("Errore durante l'eliminazione. Riprova.", "error");
                btn.disabled = false;
            }
        } catch {
            window.showToast("Errore di connessione. Riprova.", "error");
            btn.disabled = false;
        }
    }
});

// MODALE NUOVA CONSEGNA
const modalOverlay = document.getElementById("new-modal-overlay");
const newForm = document.getElementById("new-delivery-form");
const newFeedback = document.getElementById("new-delivery-feedback");
const ndPinInput = document.getElementById("nd-pin");

function openNewDeliveryModal() {
    newForm.reset();
    newFeedback.textContent = "";
    modalOverlay.classList.add("active");
    setTimeout(() => document.getElementById("nd-client").focus(), 50);
}

function closeNewDeliveryModal() {
    modalOverlay.classList.remove("active");
}

document.getElementById("new-delivery-btn").addEventListener("click", openNewDeliveryModal);
document.getElementById("nd-cancel").addEventListener("click", closeNewDeliveryModal);

modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeNewDeliveryModal();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalOverlay.classList.contains("active")) closeNewDeliveryModal();
});

ndPinInput.addEventListener("input", () => {
    ndPinInput.value = ndPinInput.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
});

document.getElementById("nd-generate-pin").addEventListener("click", async () => {
    const res = await fetch("/api/admin/generate-pin");
    const data = await res.json();
    if (res.ok && data.ok) {
        ndPinInput.value = data.pin;
    }
});

newForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const clientName = document.getElementById("nd-client").value.trim();
    const title = document.getElementById("nd-title").value.trim();
    const pin = ndPinInput.value.trim();
    const expiryDate = document.getElementById("nd-expiry").value;
    const notes = document.getElementById("nd-notes").value.trim();

    if (!/^[A-Za-z0-9]{6}$/.test(pin)) {
        newFeedback.textContent = "Il PIN deve avere esattamente 6 caratteri (lettere o numeri).";
        ndPinInput.focus();
        return;
    }

    const submitBtn = newForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    newFeedback.textContent = "Creazione in corso...";

    const expiresAt = expiryDate ? new Date(expiryDate + "T23:59:59").toISOString() : null;

    try {
        const res = await fetch("/api/admin/deliveries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientName, title, pin, expiresAt, notes }),
        });
        const data = await res.json();

        if (!res.ok || !data.ok) {
            newFeedback.textContent = data.error === "pin_taken"
                ? "Questo PIN è già in uso. Generane uno nuovo."
                : "Errore durante la creazione. Controlla i campi.";
            submitBtn.disabled = false;
            return;
        }

        window.location.href = `delivery.html?id=${encodeURIComponent(data.delivery.id)}`;
    } catch {
        newFeedback.textContent = "Errore di connessione. Riprova.";
        submitBtn.disabled = false;
    }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "login.html";
});

(async function init() {
    const ok = await checkAuth();
    if (ok) loadDeliveries();
})();
