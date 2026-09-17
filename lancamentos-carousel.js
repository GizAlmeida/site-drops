/*
 * Drops de Luxo — Carrossel de Lançamentos
 *
 * Este arquivo transforma o #launchesGrid em uma faixa horizontal contínua.
 * Ele também observa alterações no catálogo para reconstruir o carrossel
 * quando os produtos forem cadastrados/removidos pelo painel.
 */
(() => {
    "use strict";

    const STYLE_ID = "drops-launches-carousel-style";
    const GRID_ID = "launchesGrid";
    const MAX_ITEMS = 10;
    let rebuilding = false;
    let observer = null;

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${GRID_ID}.launches-carousel-ready {
                display: block !important;
                width: 100%;
                overflow: hidden;
                position: relative;
            }

            #${GRID_ID}.launches-carousel-ready .launches-track {
                display: flex;
                width: max-content;
                min-width: max-content;
                animation: dropsLaunchesScroll var(--launch-speed, 32s) linear infinite;
                will-change: transform;
            }

            #${GRID_ID}.launches-carousel-ready .launches-group {
                display: flex;
                flex: 0 0 auto;
                gap: 18px;
                padding-right: 18px;
            }

            #${GRID_ID}.launches-carousel-ready .launches-group .launch-card {
                flex: 0 0 calc((min(1240px, 100vw - 40px) - 72px) / 5);
                width: calc((min(1240px, 100vw - 40px) - 72px) / 5);
                min-width: 0;
            }

            #${GRID_ID}.launches-carousel-ready:hover .launches-track,
            #${GRID_ID}.launches-carousel-ready:focus-within .launches-track {
                animation-play-state: paused;
            }

            @keyframes dropsLaunchesScroll {
                from { transform: translateX(0); }
                to { transform: translateX(-50%); }
            }

            @media (max-width: 1100px) {
                #${GRID_ID}.launches-carousel-ready .launches-group .launch-card {
                    flex-basis: calc((min(1240px, 100vw - 40px) - 54px) / 4);
                    width: calc((min(1240px, 100vw - 40px) - 54px) / 4);
                }
            }

            @media (max-width: 850px) {
                #${GRID_ID}.launches-carousel-ready .launches-group {
                    gap: 12px;
                    padding-right: 12px;
                }

                #${GRID_ID}.launches-carousel-ready .launches-group .launch-card {
                    flex-basis: calc((100vw - 52px) / 2);
                    width: calc((100vw - 52px) / 2);
                }
            }

            @media (max-width: 520px) {
                #${GRID_ID}.launches-carousel-ready .launches-group {
                    gap: 10px;
                    padding-right: 10px;
                }

                #${GRID_ID}.launches-carousel-ready .launches-group .launch-card {
                    flex-basis: calc((100vw - 34px) / 2);
                    width: calc((100vw - 34px) / 2);
                }
            }

            @media (prefers-reduced-motion: reduce) {
                #${GRID_ID}.launches-carousel-ready .launches-track {
                    animation: none;
                    transform: none;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function getCards(grid) {
        return Array.from(grid.querySelectorAll(":scope > .launch-card"));
    }

    function buildCarousel(grid) {
        if (!grid || rebuilding) return;

        // Se ainda não existem cards, aguarda o script principal preencher o catálogo.
        const cards = getCards(grid);
        if (!cards.length) return;

        rebuilding = true;

        const sourceCards = cards.slice(0, MAX_ITEMS);
        const track = document.createElement("div");
        track.className = "launches-track";

        const groupA = document.createElement("div");
        groupA.className = "launches-group";

        const groupB = document.createElement("div");
        groupB.className = "launches-group";
        groupB.setAttribute("aria-hidden", "true");

        sourceCards.forEach(card => groupA.appendChild(card));

        sourceCards.forEach(card => {
            const clone = card.cloneNode(true);
            clone.setAttribute("aria-hidden", "true");

            // Evita que os botões duplicados recebam foco/acidentalmente cliquem.
            clone.querySelectorAll("button, a, input, select, textarea").forEach(el => {
                el.setAttribute("tabindex", "-1");
            });

            groupB.appendChild(clone);
        });

        track.appendChild(groupA);
        track.appendChild(groupB);

        grid.innerHTML = "";
        grid.classList.add("launches-carousel-ready");
        grid.appendChild(track);

        rebuilding = false;
    }

    function start() {
        injectStyles();

        const grid = document.getElementById(GRID_ID);
        if (!grid) return;

        // O script principal pode preencher os cards depois deste arquivo carregar.
        // O observer detecta e monta o carrossel automaticamente.
        observer = new MutationObserver(() => {
            if (rebuilding) return;

            const hasTrack = !!grid.querySelector(":scope > .launches-track");
            const hasDirectCards = grid.querySelectorAll(":scope > .launch-card").length > 0;

            if (!hasTrack && hasDirectCards) {
                buildCarousel(grid);
            }
        });

        observer.observe(grid, { childList: true });

        buildCarousel(grid);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
