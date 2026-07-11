const form = document.getElementById("login-form");
const feedback = document.getElementById("login-feedback");
const card = document.querySelector(".admin-login-card");
const submitBtn = form.querySelector('button[type="submit"]');

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
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
            card.classList.remove("shake");
            void card.offsetWidth;
            card.classList.add("shake");
            document.getElementById("password").value = "";
            document.getElementById("password").focus();
            submitBtn.disabled = false;
            return;
        }

        window.location.href = "index.html";
    } catch {
        feedback.textContent = "Errore di connessione. Riprova.";
        submitBtn.disabled = false;
    }
});
