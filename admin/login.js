const form = document.getElementById("login-form");
const feedback = document.getElementById("login-feedback");

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    feedback.textContent = "Verifica in corso...";

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
        const res = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();

        if (!res.ok || !data.ok) {
            feedback.textContent = "Credenziali non valide.";
            return;
        }

        window.location.href = "index.html";
    } catch {
        feedback.textContent = "Errore di connessione. Riprova.";
    }
});
