/* =========================================================
   DROPS DE LUXO — BANNERS CLICÁVEIS
   Permite trocar cada banner e escolher a categoria de destino.
   Não altera o carrossel existente nem o cadastro de produtos.
   ========================================================= */

(() => {
    "use strict";

    const STORAGE_KEY = "dropsLuxoBanners";
    const DEFAULT_BANNERS = [
        { image: "imgs/banner1.jpg", category: "" },
        { image: "imgs/banner2.jpg", category: "" },
        { image: "imgs/banner3.jpg", category: "" },
        { image: "imgs/banner4.jpg", category: "" }
    ];

    let banners = [];

    function getCategories() {
        if (Array.isArray(window.DROPS_LUXO_CATEGORIES)) {
            return window.DROPS_LUXO_CATEGORIES;
        }

        // O script principal já possui CATEGORIES. Como const global pode
        // não ser exposta em window, usamos também os botões do menu.
        const nav = document.getElementById("categoryNav");
        if (nav) {
            return Array.from(nav.querySelectorAll("[data-cat]")).map(button => ({
                id: button.dataset.cat,
                label: button.textContent.trim()
            }));
        }

        return [];
    }

    function readBanners() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (!saved) return DEFAULT_BANNERS.map(item => ({ ...item }));

            const parsed = JSON.parse(saved);
            if (!Array.isArray(parsed)) {
                return DEFAULT_BANNERS.map(item => ({ ...item }));
            }

            return DEFAULT_BANNERS.map((item, index) => ({
                ...item,
                ...(parsed[index] || {})
            }));
        } catch (error) {
            console.warn("Não foi possível carregar os banners salvos:", error);
            return DEFAULT_BANNERS.map(item => ({ ...item }));
        }
    }

    function saveBanners() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(banners));
            return true;
        } catch (error) {
            console.error("Não foi possível salvar os banners:", error);
            showBannerToast("Não foi possível salvar. A imagem pode ser muito grande.");
            return false;
        }
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function categoryLabel(id) {
        const category = getCategories().find(item => item.id === id);
        return category ? category.label : id || "Nenhuma categoria";
    }

    function showBannerToast(message) {
        const existing = document.getElementById("bannerManagerToast");
        if (!existing) return;
        existing.textContent = message;
        existing.classList.add("show");
        clearTimeout(showBannerToast.timer);
        showBannerToast.timer = setTimeout(() => {
            existing.classList.remove("show");
        }, 2200);
    }

    function resizeImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => {
                const image = new Image();
                image.onload = () => {
                    const maxWidth = 1800;
                    const maxHeight = 900;
                    const ratio = Math.min(
                        1,
                        maxWidth / image.naturalWidth,
                        maxHeight / image.naturalHeight
                    );

                    const canvas = document.createElement("canvas");
                    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
                    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));

                    const context = canvas.getContext("2d");
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);

                    resolve(canvas.toDataURL("image/jpeg", 0.82));
                };
                image.onerror = reject;
                image.src = reader.result;
            };

            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function getSlideElements() {
        const slider = document.querySelector(".hero-slider");
        if (!slider) return [];
        return Array.from(slider.querySelectorAll(".hero-slide"));
    }

    function applyBannerLinks() {
        const slides = getSlideElements();
        if (!slides.length) return;

        slides.forEach((slide, index) => {
            const config = banners[index] || DEFAULT_BANNERS[index];
            if (!config) return;

            const image = slide.querySelector("img");
            if (image && config.image) {
                image.src = config.image;
            }

            slide.classList.toggle("hero-slide-clickable", Boolean(config.category));
            slide.setAttribute("role", config.category ? "link" : "group");
            slide.setAttribute(
                "aria-label",
                config.category
                    ? `Abrir categoria ${categoryLabel(config.category)}`
                    : `Banner ${index + 1}`
            );

            slide.onclick = event => {
                if (!config.category) return;
                if (event.target.closest(".hero-slider-arrow, .hero-slider-dots")) return;

                if (typeof window.selectDropsCategory === "function") {
                    window.selectDropsCategory(config.category);
                    return;
                }

                const button = document.querySelector(
                    `#categoryNav [data-cat="${CSS.escape(config.category)}"]`
                );

                if (button) {
                    button.click();
                    document.getElementById("catalogo")?.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }
            };
        });
    }

    function buildCategoryOptions(selected) {
        return [
            `<option value="">Sem destino / não clicável</option>`,
            ...getCategories().map(category => `
                <option value="${escapeHTML(category.id)}" ${category.id === selected ? "selected" : ""}>
                    ${escapeHTML(category.label)}
                </option>
            `)
        ].join("");
    }

    function injectManager() {
        const adminBody = document.getElementById("adminBody");
        if (!adminBody) return;
        if (document.getElementById("bannerManagerFieldset")) return;

        const fieldset = document.createElement("fieldset");
        fieldset.id = "bannerManagerFieldset";
        fieldset.className = "banner-manager-fieldset";

        fieldset.innerHTML = `
            <legend>Gerenciar banners</legend>
            <p class="banner-manager-intro">
                Troque a imagem de cada banner e escolha para qual categoria ele deve levar o cliente.
            </p>

            <div class="banner-manager-list">
                ${banners.map((banner, index) => `
                    <article class="banner-manager-card" data-banner-index="${index}">
                        <div class="banner-manager-preview">
                            <img
                                src="${escapeHTML(banner.image)}"
                                alt="Prévia do banner ${index + 1}"
                                data-banner-preview="${index}"
                            >
                        </div>

                        <div class="banner-manager-info">
                            <strong>Banner ${index + 1}</strong>

                            <label class="field">Categoria de destino</label>
                            <select data-banner-category="${index}">
                                ${buildCategoryOptions(banner.category)}
                            </select>

                            <input
                                type="file"
                                accept="image/*"
                                hidden
                                data-banner-file="${index}"
                            >

                            <div class="banner-manager-actions">
                                <button
                                    type="button"
                                    class="btn btn-outline"
                                    data-banner-choose="${index}"
                                >
                                    Trocar banner
                                </button>
                                <button
                                    type="button"
                                    class="btn btn-solid"
                                    data-banner-save="${index}"
                                >
                                    Salvar
                                </button>
                            </div>

                            <small class="banner-manager-destination" data-banner-destination="${index}">
                                ${banner.category ? `Destino: ${escapeHTML(categoryLabel(banner.category))}` : "Sem destino"}
                            </small>
                        </div>
                    </article>
                `).join("")}
            </div>

            <p class="note">
                O banner continua no carrossel automático. Ao clicar nele, o cliente será levado à categoria escolhida.
            </p>
        `;

        adminBody.insertBefore(fieldset, adminBody.firstElementChild);

        const toast = document.createElement("div");
        toast.id = "bannerManagerToast";
        toast.className = "banner-manager-toast";
        adminBody.appendChild(toast);

        fieldset.querySelectorAll("[data-banner-choose]").forEach(button => {
            button.addEventListener("click", () => {
                const index = Number(button.dataset.bannerChoose);
                document.querySelector(`[data-banner-file="${index}"]`)?.click();
            });
        });

        fieldset.querySelectorAll("[data-banner-file]").forEach(input => {
            input.addEventListener("change", async () => {
                const index = Number(input.dataset.bannerFile);
                const file = input.files?.[0];
                if (!file) return;

                try {
                    banners[index].image = await resizeImage(file);
                    const preview = fieldset.querySelector(`[data-banner-preview="${index}"]`);
                    if (preview) preview.src = banners[index].image;
                    showBannerToast("Prévia atualizada. Clique em Salvar.");
                } catch (error) {
                    console.error(error);
                    showBannerToast("Não foi possível carregar essa imagem.");
                }
            });
        });

        fieldset.querySelectorAll("[data-banner-category]").forEach(select => {
            select.addEventListener("change", () => {
                const index = Number(select.dataset.bannerCategory);
                banners[index].category = select.value;
                const destination = fieldset.querySelector(`[data-banner-destination="${index}"]`);
                if (destination) {
                    destination.textContent = select.value
                        ? `Destino: ${categoryLabel(select.value)}`
                        : "Sem destino";
                }
            });
        });

        fieldset.querySelectorAll("[data-banner-save]").forEach(button => {
            button.addEventListener("click", () => {
                const index = Number(button.dataset.bannerSave);
                if (!saveBanners()) return;

                applyBannerLinks();
                showBannerToast(`Banner ${index + 1} salvo.`);
            });
        });
    }

    function waitForAdminBody() {
        injectManager();
    }

    async function loadServerBanners() {
        try {
            // O servidor é a fonte oficial. O localStorage fica apenas como
            // fallback para manter a loja funcionando se a API estiver indisponível.
            const response = await fetch("/api/banners", { cache: "no-store" });
            if (!response.ok) throw new Error("Falha ao carregar banners.");
            const data = await response.json();
            if (Array.isArray(data.banners) && data.banners.length) {
                banners = DEFAULT_BANNERS.map((item, index) => ({
                    ...item,
                    ...(data.banners[index] || {})
                }));
                applyBannerLinks();
                return true;
            }
        } catch (error) {
            console.warn("Não foi possível carregar banners do servidor. Usando configuração local.", error);
        }

        banners = readBanners();
        applyBannerLinks();
        return false;
    }

    function initialize() {
        loadServerBanners();

        const adminBody = document.getElementById("adminBody");
        if (!adminBody) return;

        const observer = new MutationObserver(() => {
            window.requestAnimationFrame(waitForAdminBody);
        });

        observer.observe(adminBody, {
            childList: true,
            subtree: false
        });

        injectManager();
    }

    // Permite que outros códigos também selecionem uma categoria.
    window.selectDropsCategory = categoryId => {
        const button = document.querySelector(
            `#categoryNav [data-cat="${CSS.escape(categoryId)}"]`
        );

        if (!button) return;

        button.click();

        document.getElementById("catalogo")?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }
})();
