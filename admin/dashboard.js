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

function renderDeliveries(list) {
    const tbody = document.getElementById("deliveries-tbody");
    const emptyState = document.getElementById("empty-state");
    tbody.innerHTML = "";

    if (!list.length) {
        emptyState.hidden = false;
        return;
    }
    emptyState.hidden = true;

    list.forEach((d) => {
        const tr = document.createElement("tr");
        const status = statusLabel(d);

        tr.innerHTML = `
            <td>${escapeHtml(d.clientName)}</td>
            <td>${escapeHtml(d.title)}</td>
            <td><span class="pin-chip">${escapeHtml(d.pin)}</span></td>
            <td>${d.photoCount}</td>
            <td>${formatDate(d.expiresAt)}</td>
            <td><span class="status-badge ${status.cls}">${status.text}</span></td>
            <td>
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

function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}

async function loadDeliveries() {
    const res = await fetch("/api/admin/deliveries");
    const data = await res.json();
    if (!res.ok || !data.ok) return;

    deliveries = data.deliveries;
    document.getElementById("deliveries-count").textContent = deliveries.length + " consegne totali";
    applySearch();
}

function applySearch() {
    const q = document.getElementById("search-input").value.trim().toLowerCase();
    const filtered = !q
        ? deliveries
        : deliveries.filter((d) =>
            d.clientName.toLowerCase().includes(q) || d.title.toLowerCase().includes(q)
        );
    renderDeliveries(filtered);
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
            // clipboard non disponibile, ignora silenziosamente
        }
        return;
    }

    if (action === "delete") {
        if (!confirm("Eliminare definitivamente questa consegna e tutte le sue foto/video? L'operazione non è reversibile.")) return;

        const res = await fetch(`/api/admin/deliveries/${encodeURIComponent(btn.dataset.id)}`, { method: "DELETE" });
        if (res.ok) {
            loadDeliveries();
        } else {
            alert("Errore durante l'eliminazione. Riprova.");
        }
    }
});

// MODALE NUOVA CONSEGNA
const modalOverlay = document.getElementById("new-modal-overlay");
const newForm = document.getElementById("new-delivery-form");
const newFeedback = document.getElementById("new-delivery-feedback");

document.getElementById("new-delivery-btn").addEventListener("click", () => {
    newForm.reset();
    newFeedback.textContent = "";
    modalOverlay.classList.add("active");
});

document.getElementById("nd-cancel").addEventListener("click", () => {
    modalOverlay.classList.remove("active");
});

modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.remove("active");
});

document.getElementById("nd-generate-pin").addEventListener("click", async () => {
    const res = await fetch("/api/admin/generate-pin");
    const data = await res.json();
    if (res.ok && data.ok) {
        document.getElementById("nd-pin").value = data.pin;
    }
});

newForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    newFeedback.textContent = "Creazione in corso...";

    const clientName = document.getElementById("nd-client").value.trim();
    const title = document.getElementById("nd-title").value.trim();
    const pin = document.getElementById("nd-pin").value.trim();
    const expiryDate = document.getElementById("nd-expiry").value;
    const notes = document.getElementById("nd-notes").value.trim();

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
            return;
        }

        window.location.href = `delivery.html?id=${encodeURIComponent(data.delivery.id)}`;
    } catch {
        newFeedback.textContent = "Errore di connessione. Riprova.";
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
