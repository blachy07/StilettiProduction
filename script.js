const navLinks = Array.from(document.querySelectorAll(".menu a"));
const header = document.querySelector(".header");
const menuToggle = document.querySelector(".menu-toggle");

function openMenu() {
    if (!header) return;
    header.classList.add("menu-open");
    document.body.style.overflow = "hidden";
    if (menuToggle) {
        menuToggle.setAttribute("aria-expanded", "true");
        menuToggle.setAttribute("aria-label", "Chiudi menu");
    }
}

function closeMenu() {
    if (!header || !header.classList.contains("menu-open")) return;
    header.classList.remove("menu-open");
    document.body.style.overflow = "";
    if (menuToggle) {
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Apri menu");
    }
}

if (menuToggle) {
    menuToggle.addEventListener("click", () => {
        if (header.classList.contains("menu-open")) {
            closeMenu();
        } else {
            openMenu();
        }
    });
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        closeMenu();
        if (menuToggle) menuToggle.focus();
    }
});

const navTargets = navLinks
    .map((link) => {
        const hash = link.getAttribute("href");

        if (!hash || !hash.startsWith("#") || hash.length === 1) {
            return null;
        }

        const section = document.querySelector(hash);
        return section ? { hash, link, section } : null;
    })
    .filter(Boolean);

let activeHash = "";
let scrollAnimation = null;

function getHeaderOffset() {
    return (header ? header.offsetHeight : 0) + 18;
}

function getSectionTop(section) {
    return section.getBoundingClientRect().top + window.scrollY;
}

function setActiveLink(hash) {
    if (activeHash === hash) {
        return;
    }

    activeHash = hash;

    navLinks.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === hash);
    });
}

function updateActiveLink() {
    if (!navTargets.length) {
        return;
    }

    const activationPoint = window.scrollY + getHeaderOffset() + window.innerHeight * 0.25;
    let currentTarget = navTargets[0];

    navTargets.forEach((target) => {
        if (getSectionTop(target.section) <= activationPoint) {
            currentTarget = target;
        }
    });

    const isAtBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

    if (isAtBottom) {
        currentTarget = navTargets[navTargets.length - 1];
    }

    setActiveLink(currentTarget.hash);
}

function easeInOutCubic(progress) {
    return progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function smoothScrollTo(target) {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const startY = window.scrollY;
    const extraOffset = parseInt(target.extraOffset ?? target.link?.dataset.extraOffset ?? 0);
    const targetY = Math.max(0, Math.min(getSectionTop(target.section) - getHeaderOffset() + extraOffset, maxScroll));
    const distance = targetY - startY;

    if (scrollAnimation) {
        cancelAnimationFrame(scrollAnimation);
    }

    if (prefersReducedMotion || Math.abs(distance) < 2) {
        window.scrollTo(0, targetY);
        setActiveLink(target.hash);
        history.pushState(null, "", target.hash);
        return;
    }

    const duration = Math.min(1400, Math.max(700, Math.abs(distance) * 0.5));
    const startTime = performance.now();

    function animateScroll(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeInOutCubic(progress);

        window.scrollTo(0, startY + distance * easedProgress);
        updateActiveLink();

        if (progress < 1) {
            scrollAnimation = requestAnimationFrame(animateScroll);
            return;
        }

        scrollAnimation = null;
        setActiveLink(target.hash);
        history.pushState(null, "", target.hash);
    }

    scrollAnimation = requestAnimationFrame(animateScroll);
}

function scrollToHash(hash) {
    if (!hash || !hash.startsWith("#")) {
        return;
    }

    const section = document.querySelector(hash);

    if (!section) {
        return;
    }

    smoothScrollTo({ hash, section });
}

navTargets.forEach((target) => {
    target.link.addEventListener("click", (event) => {
        event.preventDefault();
        closeMenu();
        smoothScrollTo(target);
    });
});

document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => {
        closeMenu();
        const hash = button.dataset.scrollTarget;
        const section = document.querySelector(hash);
        if (section) {
            smoothScrollTo({ hash, section, extraOffset: parseInt(button.dataset.extraOffset || 0) });
        }
    });
});

const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
const filterStatus = document.querySelector(".filter-right");

function applyProjectFilter(filter) {
    const isFiltered = filter !== "tutti";
    const allCards = document.querySelectorAll(".progetti-grid .card");
    let uniqueVisible = 0;

    // Prima passa: conta originali visibili e mostra/nascondi tutti (cloni inclusi)
    allCards.forEach((card) => {
        const categories = (card.dataset.categories || card.dataset.category || "")
            .split(" ").filter(Boolean);
        const matches = !isFiltered || categories.includes(filter);

        card.classList.toggle("is-hidden", !matches);
        card.hidden = !matches;

        if (matches && card.dataset.clone !== "1") uniqueVisible++;
    });

    if (filterStatus) {
        filterStatus.textContent = isFiltered ? uniqueVisible + " PROGETTI" : "";
    }

    const wrapper = document.querySelector(".progetti-scroll-wrapper");
    const grid   = document.getElementById("progetti-track");
    if (!wrapper || !grid) return;

    if (uniqueVisible <= 1) {
        // Card singola: nascondi cloni, ferma e centra
        allCards.forEach((card) => {
            if (card.dataset.clone === "1") {
                card.classList.add("is-hidden");
                card.hidden = true;
            }
        });
        wrapper.dataset.filtered = "single";
    } else {
        // Più card: riavvia il carosello da zero (evita posizione storta)
        wrapper.dataset.filtered = "";
        grid.style.animation = "none";
        void grid.offsetWidth; // force reflow
        grid.style.animation = "";
    }
}

filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const selectedFilter = button.dataset.filter;

        filterButtons.forEach((filterButton) => {
            const isActive = filterButton === button;
            filterButton.classList.toggle("active", isActive);
            filterButton.setAttribute("aria-pressed", String(isActive));
        });

        applyProjectFilter(selectedFilter);
    });
});

if (filterButtons.length) {
    const activeFilterButton = filterButtons.find((button) => button.classList.contains("active"));
    applyProjectFilter(activeFilterButton ? activeFilterButton.dataset.filter : "tutti");
}

const eventButtons = Array.from(document.querySelectorAll("[data-event]"));
const eventInput = document.querySelector("#tipo-evento");
const quoteForm = document.querySelector("#quote-form");
const formFeedback = document.querySelector("#form-feedback");

function setFormFeedback(message) {
    if (formFeedback) {
        formFeedback.textContent = message;
    }
}

function selectEvent(button) {
    eventButtons.forEach((eventButton) => {
        const isSelected = eventButton === button;
        eventButton.classList.toggle("is-selected", isSelected);
        eventButton.setAttribute("aria-pressed", String(isSelected));
    });

    if (eventInput) {
        eventInput.value = button.dataset.event || "";
    }

    setFormFeedback("");
}

eventButtons.forEach((button) => {
    button.addEventListener("click", () => {
        selectEvent(button);
    });
});

if (quoteForm) {
    quoteForm.addEventListener("submit", (event) => {
        event.preventDefault();

        if (!eventInput || !eventInput.value) {
            setFormFeedback("Seleziona prima il tipo di evento.");

            if (eventButtons[0]) {
                eventButtons[0].focus();
            }

            return;
        }

        if (!quoteForm.reportValidity()) {
            return;
        }

        const data = new FormData(quoteForm);

        const templateParams = {
            tipo_evento: data.get("tipo_evento"),
            nome: data.get("nome"),
            data_evento: data.get("data_evento"),
            luogo: data.get("luogo"),
            email: data.get("email"),
            telefono: data.get("telefono"),
            messaggio: data.get("messaggio")
        };

        setFormFeedback("Invio in corso...");

        emailjs.send(
            "service_vb3k3zt",
            "template_x69rjtg",
            templateParams
        )
        .then(() => {
            setFormFeedback("Richiesta inviata con successo!");
            quoteForm.reset();

            eventButtons.forEach((btn) => {
                btn.classList.remove("is-selected");
                btn.setAttribute("aria-pressed", "false");
            });

            if (eventInput) {
                eventInput.value = "";
            }
        })
        .catch((error) => {
            console.error(error);
            setFormFeedback("Errore durante l'invio. Riprova più tardi.");
        });
    });
}

window.addEventListener("scroll", updateActiveLink, { passive: true });
window.addEventListener("resize", updateActiveLink);
window.addEventListener("load", updateActiveLink);

updateActiveLink();

// Date input: mostra placeholder quando vuoto
const dateInput = document.querySelector('input[name="data_evento"]');
if (dateInput) {
    dateInput.type = "text";
    dateInput.placeholder = "Data dell'evento";
    dateInput.addEventListener("focus", function () {
        this.type = "date";
    });
    dateInput.addEventListener("blur", function () {
        if (!this.value) this.type = "text";
    });
}

// Carosello infinito — duplica le card solo su desktop per il loop seamless
const progettiTrack = document.getElementById("progetti-track");
if (progettiTrack) {
    const isDesktop = window.matchMedia("(min-width: 769px)").matches;
    if (isDesktop) {
        const originals = Array.from(progettiTrack.querySelectorAll(".card"));
        originals.forEach((card) => {
            const clone = card.cloneNode(true);
            clone.setAttribute("data-clone", "1");
            clone.setAttribute("aria-hidden", "true");
            progettiTrack.appendChild(clone);
        });
    }
}

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!prefersReducedMotion) {
    const revealMap = [
        { selector: ".about-hero .about-left",       cls: "reveal-left"  },
        { selector: ".about-hero .about-right",      cls: "reveal-right" },
        { selector: ".about-features .feature",      cls: "reveal"       },
        { selector: ".progetti-top .progetti-left",  cls: "reveal-left"  },
        { selector: ".progetti-top .progetti-right", cls: "reveal-right" },
        { selector: ".cta-progetto",                 cls: "reveal"       },
        { selector: ".contatti-left",                cls: "reveal-left"  },
        { selector: ".contatti-right",               cls: "reveal-right" },
    ];

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("active");
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });

    revealMap.forEach(({ selector, cls }) => {
        document.querySelectorAll(selector).forEach((el, i) => {
            const rect = el.getBoundingClientRect();
            const alreadyVisible = rect.top < window.innerHeight && rect.bottom > 0;
            if (alreadyVisible) return;

            el.classList.add(cls);
            if (selector.includes(".feature")) {
                el.style.transitionDelay = `${i * 0.1}s`;
            }
            revealObserver.observe(el);
        });
    });
}
