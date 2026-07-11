// Sistema di notifiche condiviso da login/dashboard/delivery. Sostituisce i vecchi
// alert()/messaggi inline sparsi, per dare un feedback coerente e più leggibile.
(function () {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    window.showToast = function showToast(message, type) {
        const toast = document.createElement("div");
        toast.className = "toast" + (type ? " toast-" + type : "");
        toast.textContent = message;
        container.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add("in"));

        setTimeout(() => {
            toast.classList.remove("in");
            toast.addEventListener("transitionend", () => toast.remove(), { once: true });
        }, 3200);
    };
})();
