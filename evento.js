const params = new URLSearchParams(window.location.search);
const eventId = params.get("id");
const event = EVENTS[eventId];

if (!event) {
    document.querySelector(".gallery").innerHTML = "<p style='color:#aaa;padding:60px;text-align:center'>Evento non trovato.</p>";
} else {
    document.title = event.title + " — Vittorio Production";
    document.getElementById("ev-cat").textContent = event.category;
    document.getElementById("ev-title").textContent = event.title;
    document.getElementById("ev-count").textContent = event.images.length + " FOTO";

    const gallery = document.getElementById("gallery");
    const folderEncoded = event.folder.split("/").map(encodeURIComponent).join("/");

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const img = entry.target.querySelector("img");
            if (img && img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute("data-src");
                img.addEventListener("load", () => {
                    img.classList.add("loaded");
                }, { once: true });
            }
            obs.unobserve(entry.target);
        });
    }, { rootMargin: "200px 0px" });

    event.images.forEach((name, i) => {
        const item = document.createElement("div");
        item.className = "gallery-item";
        item.setAttribute("data-index", i);

        const img = document.createElement("img");
        img.dataset.src = folderEncoded + "/" + encodeURIComponent(name);
        img.alt = event.title + " " + (i + 1);

        item.appendChild(img);
        item.addEventListener("click", () => openLightbox(i));
        gallery.appendChild(item);
        observer.observe(item);
    });
}

// LIGHTBOX
let currentIndex = 0;
const lightbox = document.getElementById("lightbox");
const overlay = document.getElementById("lb-overlay");
const lbImg = document.getElementById("lb-img");
const lbCounter = document.getElementById("lb-counter");

function openLightbox(index) {
    currentIndex = index;
    lbImg.style.transition = "none";
    lbImg.style.transform = "";
    showImage(currentIndex);
    lightbox.classList.add("active");
    overlay.classList.add("active");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeLightbox() {
    lightbox.classList.remove("active");
    overlay.classList.remove("active");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

function showImage(index) {
    const folderEncoded = event.folder.split("/").map(encodeURIComponent).join("/");
    lbImg.classList.add("is-loading");
    lbImg.src = folderEncoded + "/" + encodeURIComponent(event.images[index]);
    lbCounter.textContent = (index + 1) + " / " + event.images.length;
}

lbImg.addEventListener("load", () => {
    lbImg.classList.remove("is-loading");
});

function prevImage() {
    currentIndex = (currentIndex - 1 + event.images.length) % event.images.length;
    showImage(currentIndex);
}

function nextImage() {
    currentIndex = (currentIndex + 1) % event.images.length;
    showImage(currentIndex);
}

document.getElementById("lb-close").addEventListener("click", closeLightbox);
document.getElementById("lb-prev").addEventListener("click", prevImage);
document.getElementById("lb-next").addEventListener("click", nextImage);
overlay.addEventListener("click", closeLightbox);

document.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("active")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") prevImage();
    if (e.key === "ArrowRight") nextImage();
});

// LIGHTBOX SWIPE
let touchStartX = 0;
let touchStartY = 0;
let touchDeltaX = 0;
let isSwiping = false;
let isHorizontalSwipe = null;

lightbox.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchDeltaX = 0;
    isSwiping = true;
    isHorizontalSwipe = null;
    lbImg.style.transition = "none";
}, { passive: true });

lightbox.addEventListener("touchmove", (e) => {
    if (!isSwiping || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;

    if (isHorizontalSwipe === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        isHorizontalSwipe = Math.abs(dx) > Math.abs(dy);
    }
    if (!isHorizontalSwipe) return;

    // Blocks the browser's own scroll/edge-swipe-back gesture while we drag the image ourselves.
    e.preventDefault();
    touchDeltaX = dx;
    lbImg.style.transform = `translateX(${dx}px)`;
}, { passive: false });

function endSwipe() {
    if (!isSwiping) return;
    isSwiping = false;

    if (isHorizontalSwipe && Math.abs(touchDeltaX) > 50) {
        lbImg.style.transition = "none";
        lbImg.style.transform = "";
        touchDeltaX < 0 ? nextImage() : prevImage();
    } else {
        lbImg.style.transition = "transform 0.25s ease";
        lbImg.style.transform = "";
    }
    isHorizontalSwipe = null;
    touchDeltaX = 0;
}

lightbox.addEventListener("touchend", endSwipe);
lightbox.addEventListener("touchcancel", endSwipe);
