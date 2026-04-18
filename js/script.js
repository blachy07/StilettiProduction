document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector(".header");

    /* Navbar glass durante lo scroll */
    const updateHeader = () => {
        if (!header) return;

        if (window.scrollY > 50) {
            header.style.boxShadow =
                "0 14px 38px rgba(29, 29, 31, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.75)";
            header.style.background = "rgba(255, 255, 255, 0.52)";
        } else {
            header.style.boxShadow = "none";
            header.style.background = "rgba(255, 255, 255, 0.44)";
        }
    };

    window.addEventListener("scroll", updateHeader, { passive: true });
    updateHeader();

    /* Scroll fluido per link interni */
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
});

function initCustomCursor() {
    const canUseCustomCursor = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const cursor = document.querySelector(".cursor-liquid");

    if (!canUseCustomCursor || !cursor) return;

    const interactiveSelector = [
        "a",
        "button",
        ".btn-booking",
        ".whatsapp-btn",
        ".portfolio-item",
        ".service-btn",
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
    const serviceInput = document.getElementById("selected-service");

    if (!serviceButtons.length) return;

    serviceButtons.forEach(button => {
        button.addEventListener("click", () => {
            serviceButtons.forEach(btn => btn.classList.remove("selected"));
            button.classList.add("selected");

            if (serviceInput) {
                serviceInput.value = button.textContent.trim();
            }
        });
    });
}