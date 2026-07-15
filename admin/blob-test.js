// Pagina di test completamente isolata dal resto del progetto.
//
// Usa ESCLUSIVAMENTE l'esempio ufficiale di Vercel Blob per i client upload
// (upload() da @vercel/blob/client, versione 2.6.1 — la stessa confermata
// installata lato server) contro l'endpoint reale e invariato del progetto,
// /api/admin/photos/upload-token. Nessuna dipendenza da Supabase, dashboard,
// coda di upload, retry o altro codice del pannello admin.
//
// Se questo test funziona ma il pannello admin no: il problema è nel codice
// di admin/delivery.js (pathname, opzioni extra, wrapping del timeout, ecc.).
// Se anche questo test fallisce con lo stesso 400: il problema è nella
// configurazione di Vercel Blob o nell'endpoint stesso, non nel codice del
// pannello.
import { upload } from "https://esm.sh/@vercel/blob@2.6.1/client";

const authStatus = document.getElementById("auth-status");

(async function checkAuth() {
    try {
        const res = await fetch("/api/admin/me");
        if (res.ok) {
            authStatus.textContent = "✓ Sessione admin valida — puoi procedere con i test.";
            authStatus.style.color = "#5adc82";
        } else {
            authStatus.textContent = "✗ Nessuna sessione admin valida. Accedi prima su login.html, poi ricarica questa pagina.";
            authStatus.style.color = "#ff6b81";
        }
    } catch {
        authStatus.textContent = "✗ Impossibile verificare la sessione (errore di rete).";
        authStatus.style.color = "#ff6b81";
    }
})();

function log(el, ...args) {
    console.log(...args);
    const text = args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a, null, 2)))
        .join(" ");
    el.textContent += (el.textContent ? "\n" : "") + text;
}

async function runTest(fileInputId, outputId, extraOptions, label) {
    const fileInput = document.getElementById(fileInputId);
    const output = document.getElementById(outputId);
    output.textContent = "";

    const file = fileInput.files[0];
    if (!file) {
        log(output, "Nessun file selezionato.");
        return;
    }

    log(output, `[${label}] avvio upload —`, file.name, file.size, "byte,", file.type);

    try {
        const blob = await upload(file.name, file, {
            access: "public",
            handleUploadUrl: "/api/admin/photos/upload-token",
            ...extraOptions,
        });
        log(output, `[${label}] SUCCESSO:`, blob);
    } catch (err) {
        log(output, `[${label}] ERRORE:`, (err && err.message) || String(err));
        console.error(`[${label}] errore completo:`, err);
        if (err && err.stack) log(output, "stack:", err.stack);
    }
}

document.getElementById("btn-simple").addEventListener("click", () => {
    runTest("file-input-simple", "output-simple", {}, "semplice");
});

document.getElementById("btn-multipart").addEventListener("click", () => {
    runTest("file-input-multipart", "output-multipart", { multipart: true }, "multipart");
});
