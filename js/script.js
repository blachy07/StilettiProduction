document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector(".header");

    /* Navbar glass più evidente durante lo scroll */
    const updateHeader = () => {
        if (!header) return;

        if (window.scrollY > 50) {
            header.style.boxShadow = "0 14px 38px rgba(29, 29, 31, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.75)";
            header.style.background = "rgba(255, 255, 255, 0.52)";
        } else {
            header.style.boxShadow = "none";
            header.style.background = "rgba(255, 255, 255, 0.44)";
        }
    };

    window.addEventListener("scroll", updateHeader, { passive: true });
    updateHeader();

    /* Scroll fluido per eventuali link interni */
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener("click", event => {
            const href = link.getAttribute("href");

            if (!href || href === "#") return;

            const target = document.querySelector(href);

            if (!target) return;

            event.preventDefault();
            target.scrollIntoView({ behavior: "smooth" });
        });
    });

    initCustomCursor();
    initScrollReveal();
    initServiceButtons();
    initContactForm();
});

function initCustomCursor() {
    const canUseCustomCursor = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const cursor = document.querySelector(".cursor-liquid");

    if (!canUseCustomCursor || !cursor) return;

    const interactiveSelector = [
        "a",
        "button",
        ".btn-primary",
        ".btn-secondary",
        ".btn-booking",
        ".whatsapp-btn",
        ".portfolio-item",
        ".service-btn",
        ".glass-button",
        "input",
        "textarea"
    ].join(", ");

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let cursorX = mouseX;
    let cursorY = mouseY;
    let hasMoved = false;

    document.body.classList.add("custom-cursor-ready");

    const renderCursor = () => {
        cursorX += (mouseX - cursorX) * 0.38;
        cursorY += (mouseY - cursorY) * 0.38;

        cursor.style.left = `${cursorX}px`;
        cursor.style.top = `${cursorY}px`;

        requestAnimationFrame(renderCursor);
    };

    window.addEventListener("mousemove", event => {
        mouseX = event.clientX;
        mouseY = event.clientY;

        if (!hasMoved) {
            hasMoved = true;
            document.body.classList.add("cursor-visible");
        }
    }, { passive: true });

    document.addEventListener("mouseleave", () => {
        document.body.classList.remove("cursor-visible");
    });

    document.addEventListener("mouseenter", () => {
        if (hasMoved) {
            document.body.classList.add("cursor-visible");
        }
    });

    document.querySelectorAll(interactiveSelector).forEach(element => {
        element.addEventListener("mouseenter", () => {
            document.body.classList.add("cursor-hover");
        });

        element.addEventListener("mouseleave", () => {
            document.body.classList.remove("cursor-hover");
        });
    });

    renderCursor();
}

function initScrollReveal() {
    const revealElements = document.querySelectorAll(
        ".hero-content, .about, .portfolio, .contact, .portfolio-item, .booking-container, .section-photo, .booking-photo"
    );

    if (!revealElements.length) return;

    revealElements.forEach(element => {
        element.classList.add("reveal-on-scroll");
    });

    if (!("IntersectionObserver" in window)) {
        revealElements.forEach(element => element.classList.add("is-visible"));
        return;
    }

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;

            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
        });
    }, {
        threshold: 0.16,
        rootMargin: "0px 0px -70px 0px"
    });

    revealElements.forEach(element => observer.observe(element));
}

function initServiceButtons() {
    const serviceButtons = document.querySelectorAll(".service-btn");

    serviceButtons.forEach(button => {
        button.addEventListener("click", () => {
            serviceButtons.forEach(btn => btn.classList.remove("selected"));
            button.classList.add("selected");
        });
    });
}

function initContactForm() {
    const form = document.querySelector(".contact-form");

    if (!form) return;

    form.addEventListener("submit", event => {
        event.preventDefault();

        const name = form.querySelector('input[type="text"]').value.trim();
        const email = form.querySelector('input[type="email"]').value.trim();
        const message = form.querySelector("textarea").value.trim();

        if (name === "" || email === "" || message === "") {
            alert("Per favore, compila tutti i campi.");
            return;
        }

        if (!isValidEmail(email)) {
            alert("Inserisci un indirizzo email valido.");
            return;
        }

        alert("Messaggio inviato con successo!");
        form.reset();
    });
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
