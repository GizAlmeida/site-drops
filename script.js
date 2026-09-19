/* =========================================================
   DROPS DE LUXO
   SCRIPT.JS
   ========================================================= */

/* =========================================================
   CONFIGURAÇÕES
   ========================================================= */

const WHATSAPP_NUMBER = "5585999999999";

const INFINITEPAY_HANDLE =
    "edviges-gislaide";
const INFINITEPAY_LINKS_URL = "https://api.checkout.infinitepay.io/links";

const INFINITEPAY_CHECK_URL =
  "https://api.checkout.infinitepay.io/payment_check";

/* =========================================================
   FRETE — SUPERFRETE
   O token NÃO fica neste arquivo.
   O navegador chama o backend em /api/freight.
========================================================= */

const FREIGHT_API_URL = "/api/freight";

/* =========================================================
   CONFIGURAÇÃO DO CARROSSEL
   ========================================================= */

/*
   3500 milissegundos = 3,5 segundos
*/

const HERO_INTERVAL = 3500;

/* =========================================================
   CATEGORIAS
   ========================================================= */
const CATEGORIES = [
  {
    id: "brand-masc",
    label: "Brand Collections Masc.",
  },

  {
    id: "brand-fem",
    label: "Brand Collections Fem.",
  },

  {
    id: "arabe-masc",
    label: "Perfumes Árabes Masc.",
  },

  {
    id: "arabe-fem",
    label: "Perfumes Árabes Fem.",
  },

  {
    id: "body-splash",
    label: "Body Splash",
  },

  {
    id: "arabic-collection",
    label: "Arabic Collections",
  },

  {
    id: "kits",
    label: "Kits",
  },

  {
    id: "outlet",
    label: "Outlet",
  },
];

/* =========================================================
   PRODUTOS INICIAIS
   ========================================================= */

const SEED_PRODUCTS = [
  {
    id: "p1",
    name: "Ouro Noir",
    category: "brand-masc",
    price: 189.9,
    desc: "Amadeirado especiado, alta fixação.",
    stock: 12,
  },

  {
    id: "p2",
    name: "Vetiver Real",
    category: "brand-masc",
    price: 169.9,
    desc: "Fresco e sofisticado para o dia a dia.",
    stock: 8,
  },

  {
    id: "p3",
    name: "Rosa Imperial",
    category: "brand-fem",
    price: 179.9,
    desc: "Floral intenso com toque adocicado.",
    stock: 10,
  },

  {
    id: "p4",
    name: "Jasmim Dourado",
    category: "brand-fem",
    price: 199.9,
    desc: "Floral branco envolvente.",
    stock: 6,
  },

  {
    id: "p5",
    name: "Âmbar do Deserto",
    category: "arabe-masc",
    price: 149.9,
    desc: "Âmbar e oud, marcante e duradouro.",
    stock: 15,
  },

  {
    id: "p6",
    name: "Sultão Al Rayhan",
    category: "arabe-masc",
    price: 159.9,
    desc: "Especiarias orientais e almíscar.",
    stock: 9,
  },

  {
    id: "p7",
    name: "Rosa do Oriente",
    category: "arabe-fem",
    price: 154.9,
    desc: "Rosa árabe com fundo amadeirado.",
    stock: 11,
  },

  {
    id: "p8",
    name: "Noor Al Layl",
    category: "arabe-fem",
    price: 164.9,
    desc: "Floral noturno, doce e sedutor.",
    stock: 7,
  },

  {
    id: "p9",
    name: "Terracota Splash",
    category: "body-splash",
    price: 59.9,
    desc: "Hidratante perfumado, toque leve.",
    stock: 20,
  },

  {
    id: "p10",
    name: "Areia Dourada Splash",
    category: "body-splash",
    price: 59.9,
    desc: "Frescor cítrico e amadeirado.",
    stock: 18,
  },

  {
    id: "p11",
    name: "Coleção Rota da Seda",
    category: "arabic-collection",
    price: 219.9,
    desc: "Kit com 3 essências árabes exclusivas.",
    stock: 5,
  },

  {
    id: "p12",
    name: "Coleção Oásis",
    category: "arabic-collection",
    price: 229.9,
    desc: "Seleção de perfumes amadeirados.",
    stock: 4,
  },
];

/* =========================================================
   ESTADO
   ========================================================= */

let catalog = [];

let cart = [];

let activeCategory = "all";

let searchTerm = "";

let checkoutState = {
  delivery: "retirada",
  freightOptions: [],
  freightService: null,
  freightLoading: false,
  cep: "",
  endereco: "",
};

/* =========================================================
   UTILIDADES
   ========================================================= */

function fmtPrice(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function catLabel(id) {
  const category = CATEGORIES.find((item) => item.id === id);

  return category ? category.label : id;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   TOAST
   ========================================================= */

function showToast(message) {
  const toast = document.getElementById("toast");

  if (!toast) return;

  toast.textContent = message;

  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2400);
}

/* =========================================================
   STORAGE
   ========================================================= */

/*
   O projeto tenta utilizar window.storage
   quando ele existir.

   Se estiver rodando no Live Server,
   utiliza localStorage como alternativa.
*/

async function storageGet(key, shared = false) {
  try {
    if (window.storage && typeof window.storage.get === "function") {
      const result = await window.storage.get(key, shared);

      if (result) {
        return result.value;
      }
    }
  } catch (error) {
    console.warn("window.storage indisponível:", error);
  }

  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

async function storageSet(key, value, shared = false) {
  try {
    if (window.storage && typeof window.storage.set === "function") {
      await window.storage.set(key, value, shared);

      return true;
    }
  } catch (error) {
    console.warn("Não foi possível usar window.storage:", error);
  }

  try {
    localStorage.setItem(key, value);

    return true;
  } catch (error) {
    console.error(error);

    return false;
  }
}

async function storageDelete(key, shared = false) {
  try {
    if (window.storage && typeof window.storage.delete === "function") {
      await window.storage.delete(key, shared);

      return;
    }
  } catch (error) {}

  try {
    localStorage.removeItem(key);
  } catch (error) {}
}

/* =========================================================
   CATÁLOGO
   ========================================================= */

async function loadCatalog() {
  try {
    const response = await fetch("/api/products", {
      method: "GET",
      cache: "no-store",
    });

    if (response.ok) {
      const data = await response.json();

      if (data.source === "server" && Array.isArray(data.products)) {
        catalog = data.products;
        return;
      }
    }
  } catch (error) {
    console.warn(
      "Backend do catálogo indisponível. Usando armazenamento local:",
      error,
    );
  }

  /*
       Fallback temporário para trabalhar localmente:
       o catálogo local só é usado quando o backend não responde.
    */

  try {
    const saved = await storageGet("catalog", true);

    if (saved) {
      catalog = JSON.parse(saved);
    }

    if (!Array.isArray(catalog)) {
      catalog = [];
    }

    if (!catalog.length) {
      catalog = SEED_PRODUCTS.map((product) => ({
        ...product,
      }));
    }
  } catch (error) {
    console.error(error);

    catalog = SEED_PRODUCTS.map((product) => ({
      ...product,
    }));
  }
}

async function saveCatalog() {
  /*
       O catálogo administrativo é salvo pelo backend.
       Esta função antiga permanece somente para compatibilidade
       com o código legado que ainda está no script público.
    */

  const saved = await storageSet("catalog", JSON.stringify(catalog), true);

  if (!saved) {
    showToast("Não foi possível salvar o catálogo local.");
  }
}

/* =========================================================
   CARRINHO
   ========================================================= */

async function loadCart() {
  try {
    const saved = await storageGet("cart", false);

    cart = saved ? JSON.parse(saved) : [];

    if (!Array.isArray(cart)) {
      cart = [];
    }
  } catch (error) {
    cart = [];
  }
}

async function saveCart() {
  await storageSet("cart", JSON.stringify(cart), false);
}

/* =========================================================
   ÍCONE DE GARRAFA
   ========================================================= */

function bottleIcon() {
  return `

        <div class="bottle-fallback">

            <svg
                viewBox="0 0 100 130"
                aria-hidden="true"
            >

                <path
                    d="
                        M35 24
                        Q35 34 27 44
                        L27 116
                        Q27 124 37 124
                        L63 124
                        Q73 124 73 116
                        L73 44
                        Q65 34 65 24
                        Z
                    "
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                />

                <rect
                    x="42"
                    y="8"
                    width="16"
                    height="16"
                    rx="2"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                />

                <line
                    x1="27"
                    y1="66"
                    x2="73"
                    y2="66"
                    stroke="currentColor"
                    stroke-width="0.8"
                />

            </svg>

        </div>

    `;
}

/* =========================================================
   FOTO DO PRODUTO
   ========================================================= */

function productImageHTML(product, context = "card") {
  if (product.image) {
    const className =
      context === "cart" ? "product-photo cart-photo" : "product-photo";

    return `

            <img
                class="${className}"
                src="${product.image}"
                alt="${escapeHTML(product.name)}"
                loading="lazy"
            >

        `;
  }

  return bottleIcon();
}

/* =========================================================
   NAV
   ========================================================= */

function renderNav() {
  const nav = document.getElementById("categoryNav");

  if (!nav) return;

  const pills = [...CATEGORIES];

  nav.innerHTML = pills
    .map(
      (category) => `

                <button
                    type="button"
                    class="pill ${
                      activeCategory === category.id ? "active" : ""
                    }"
                    data-cat="${category.id}"
                >
                    ${escapeHTML(category.label)}
                </button>

            `,
    )
    .join("");

  nav.querySelectorAll("[data-cat]").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.cat;

      renderNav();

      renderGrid();

      // Leva automaticamente o cliente até a seção dos produtos
      // depois de trocar de categoria.
      requestAnimationFrame(() => {
        const catalogSection = document.getElementById("catalogo");

        if (catalogSection) {
          catalogSection.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      });
    });
  });
}

/* =========================================================
   GRID — BUSCA
   ========================================================= */

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function productMatchesSearch(product) {
  const query = normalizeSearch(searchTerm);

  if (!query) return true;

  const searchableText = [
    product.name,

    product.desc,

    product.category,

    catLabel(product.category),
  ]
    .map(normalizeSearch)
    .join(" ");

  return searchableText.includes(query);
}

/* =========================================================
   LANÇAMENTOS — PÁGINA INICIAL
   ========================================================= */

function getLaunchProducts() {
  const marked = catalog.filter((product) => product.isLaunch === true);

  // Para catálogos antigos que ainda não possuem a marcação
  // de lançamento, usamos os primeiros produtos como demonstração.
  if (!marked.length) {
    return catalog.slice(0, 10);
  }

  return marked.slice(0, 10);
}

function renderLaunches() {
  const grid = document.getElementById("launchesGrid");

  if (!grid) return;

  const products = getLaunchProducts();

  if (!products.length) {
    grid.innerHTML = `
            <p class="launches-empty">
                Os lançamentos aparecerão aqui assim que os produtos forem cadastrados.
            </p>
        `;
    return;
  }

  grid.innerHTML = products
    .map(
      (product) => `

        <article class="launch-card" data-product="${product.id}">

            <div class="launch-card-media">
                <span class="launch-badge">NOVO</span>
                ${productImageHTML(product, "card")}
            </div>

            <div class="launch-card-body">

                <span class="launch-category">
                    ${escapeHTML(catLabel(product.category))}
                </span>

                <h3>${escapeHTML(product.name)}</h3>

                <p>${escapeHTML(product.desc || "")}</p>

                <div class="launch-card-bottom">
                    <strong>${fmtPrice(product.price)}</strong>

                    <button
                        type="button"
                        class="launch-details-btn"
                        data-launch-details="${product.id}"
                    >
                        Ver detalhes
                    </button>
                </div>

            </div>

        </article>

    `,
    )
    .join("");

  grid.querySelectorAll("[data-launch-details]").forEach((button) => {
    button.addEventListener("click", () => {
      openProductDetails(button.dataset.launchDetails);
    });
  });
}

/* =========================================================
   GRID
   ========================================================= */

function renderGrid() {
  const grid = document.getElementById("productGrid");

  const title = document.getElementById("gridTitle");

  const count = document.getElementById("gridCount");

  const empty = document.getElementById("emptyMsg");

  if (!grid) return;

  let items =
    activeCategory === "all"
      ? [...catalog]
      : catalog.filter((product) => product.category === activeCategory);

  items = items.filter((product) => productMatchesSearch(product));

  if (title) {
    if (searchTerm.trim()) {
      title.textContent = `Resultados para "${searchTerm.trim()}"`;
    } else {
      title.textContent =
        activeCategory === "all"
          ? "Todos os produtos"
          : catLabel(activeCategory);
    }
  }

  if (count) {
    count.textContent = `${items.length} ${
      items.length === 1 ? "item" : "itens"
    }`;
  }

  if (empty) {
    empty.textContent = searchTerm.trim()
      ? "Nenhum produto encontrado para sua busca."
      : "Nenhum produto cadastrado nesta categoria ainda.";

    empty.style.display = items.length ? "none" : "block";
  }

  grid.innerHTML = items
    .map(
      (product) => `

                <article
                    class="card"
                    data-product="${product.id}"
                >

                    <div class="card-media">

                        <span class="card-tag">
                            ${escapeHTML(catLabel(product.category))}
                        </span>

                        ${productImageHTML(product, "card")}

                    </div>


                    <div class="card-body">

                        <h3>
                            ${escapeHTML(product.name)}
                        </h3>


                        <div class="desc">
                            ${escapeHTML(product.desc || "")}
                        </div>


                        <div class="card-foot">

                            <span class="price">
                                ${fmtPrice(product.price)}
                            </span>

                            <div class="card-actions">

                                <button
                                    type="button"
                                    class="details-btn"
                                    data-details="${product.id}"
                                >
                                    Ver detalhes
                                </button>

                                <button
                                    type="button"
                                    class="add-btn"
                                    data-add="${product.id}"
                                >
                                    Adicionar
                                </button>

                            </div>

                        </div>

                    </div>

                </article>

            `,
    )
    .join("");

  grid.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      addToCart(button.dataset.add);
    });
  });

  grid.querySelectorAll("[data-details]").forEach((button) => {
    button.addEventListener("click", () => {
      openProductDetails(button.dataset.details);
    });
  });
}

/* =========================================================
   CARRINHO — ADICIONAR
   ========================================================= */

async function addToCart(productId) {
  const product = catalog.find((item) => item.id === productId);

  if (!product) {
    showToast("Produto não encontrado.");

    return;
  }

  if (Number(product.stock) <= 0) {
    showToast("Produto sem estoque.");

    return;
  }

  const existing = cart.find((item) => item.id === productId);

  if (existing) {
    if (existing.qty >= Number(product.stock)) {
      showToast("Quantidade máxima em estoque atingida.");

      return;
    }

    existing.qty += 1;
  } else {
    cart.push({
      id: productId,

      qty: 1,
    });
  }

  await saveCart();

  updateCartBadge();

  showToast("Produto adicionado ao carrinho.");
}
/* =========================================================
   BADGE
   ========================================================= */

function updateCartBadge() {
  const badge = document.getElementById("cartBadge");

  if (!badge) return;

  const total = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  badge.textContent = total;
}

/* =========================================================
   LINHAS DO CARRINHO
   ========================================================= */

function cartLines() {
  return cart
    .map((item) => {
      const product = catalog.find((p) => p.id === item.id);

      if (!product) {
        return null;
      }

      return {
        ...item,

        product,

        lineTotal: Number(product.price) * Number(item.qty),
      };
    })
    .filter(Boolean);
}

function cartSubtotal() {
  return cartLines().reduce((sum, line) => sum + line.lineTotal, 0);
}

/* =========================================================
   RENDER CART
   ========================================================= */

function renderCart() {
  const body = document.getElementById("cartBody");

  const foot = document.getElementById("cartFoot");

  if (!body || !foot) return;

  const lines = cartLines();

  if (!lines.length) {
    body.innerHTML = `

            <div class="empty-cart">

                <p
                    style="
                        color:var(--muted);
                        font-size:12px;
                        text-align:center;
                        padding:50px 10px;
                    "
                >
                    Seu carrinho está vazio.
                </p>

            </div>

        `;

    foot.innerHTML = "";

    return;
  }

  body.innerHTML = lines
    .map(
      (line) => `

                <div
                    class="cart-item"
                    data-line="${line.id}"
                >

                    <div class="cart-item-media">

                        ${productImageHTML(line.product, "cart")}

                    </div>


                    <div class="cart-item-info">

                        <span class="name">
                            ${escapeHTML(line.product.name)}
                        </span>


                        <span class="cat">
                            ${escapeHTML(catLabel(line.product.category))}
                        </span>


                        <div class="qty-row">

                            <button
                                type="button"
                                class="qty-btn"
                                data-dec="${line.id}"
                            >
                                −
                            </button>


                            <span>
                                ${line.qty}
                            </span>


                            <button
                                type="button"
                                class="qty-btn"
                                data-inc="${line.id}"
                            >
                                +
                            </button>


                            <strong
                                style="
                                    margin-left:5px;
                                    font-size:11px;
                                "
                            >
                                ${fmtPrice(line.lineTotal)}
                            </strong>


                            <button
                                type="button"
                                class="remove-link"
                                data-remove="${line.id}"
                            >
                                remover
                            </button>

                        </div>

                    </div>

                </div>

            `,
    )
    .join("");

  foot.innerHTML = `

        <div class="subtotal-row">

            <span>
                Subtotal
            </span>

            <strong>
                ${fmtPrice(cartSubtotal())}
            </strong>

        </div>


        <button
            type="button"
            class="btn btn-solid"
            style="width:100%;"
            id="goCheckoutBtn"
        >
            Finalizar pedido
        </button>

    `;

  body.querySelectorAll("[data-inc]").forEach((button) => {
    button.addEventListener("click", async () => {
      const item = cart.find((i) => i.id === button.dataset.inc);

      const product = catalog.find((p) => p.id === button.dataset.inc);

      if (!item || !product) return;

      if (item.qty >= Number(product.stock)) {
        showToast("Quantidade máxima em estoque.");

        return;
      }

      item.qty += 1;

      await saveCart();

      updateCartBadge();

      renderCart();
    });
  });

  body.querySelectorAll("[data-dec]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.dec;

      const item = cart.find((i) => i.id === id);

      if (!item) return;

      item.qty -= 1;

      if (item.qty <= 0) {
        cart = cart.filter((i) => i.id !== id);
      }

      await saveCart();

      updateCartBadge();

      renderCart();
    });
  });

  body.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.remove;

      cart = cart.filter((item) => item.id !== id);

      await saveCart();

      updateCartBadge();

      renderCart();
    });
  });

  const checkoutButton = document.getElementById("goCheckoutBtn");

  if (checkoutButton) {
    checkoutButton.addEventListener("click", () => {
      closeDrawer("cart");

      openCheckout();
    });
  }
}

/* =========================================================
   CHECKOUT
   ========================================================= */

async function openCheckout() {
  if (typeof loadCurrentCustomer === "function") {
    await loadCurrentCustomer();
  }

  const address = currentCustomer?.address || null;
  if (address) {
    if (!checkoutState.cep) checkoutState.cep = formatCep(address.cep || "");
    if (!checkoutState.endereco)
      checkoutState.endereco = formatCheckoutAddress(address);
  }

  renderCheckout();
  openDrawer("checkout");
}

function deliveryOptionsHTML() {
  const options = [
    {
      id: "retirada",
      label: "Retirar na loja",
      sub: "Sem custo. Combinamos o horário por WhatsApp.",
    },

    {
      id: "uber",
      label: "Entrega via Uber",
      sub: "Entrega combinada por WhatsApp.",
    },

    {
      id: "correios",
      label: "Envio pelos Correios",
      sub: "Escolha PAC ou SEDEX após informar o CEP.",
    },
  ];

  return options
    .map(
      (option) => `
            <label class="radio-opt ${
              checkoutState.delivery === option.id ? "checked" : ""
            }">
                <input
                    type="radio"
                    name="delivery"
                    value="${option.id}"
                    ${checkoutState.delivery === option.id ? "checked" : ""}
                >
                <span>
                    <strong>${escapeHTML(option.label)}</strong>
                    <span class="sub">${escapeHTML(option.sub)}</span>
                </span>
            </label>
        `,
    )
    .join("");
}

function formatCep(value) {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 8);

  if (digits.length <= 5) return digits;

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function freightOptionsHTML() {
  if (checkoutState.freightLoading) {
    return `
            <div class="note" style="padding:12px 0;">
                Calculando PAC e SEDEX...
            </div>
        `;
  }

  if (!checkoutState.freightOptions.length) {
    return `
            <div class="note" style="padding:12px 0;">
                Informe o CEP e clique em <strong>Calcular frete</strong>.
            </div>
        `;
  }

  return checkoutState.freightOptions
    .map(
      (option) => `
            <label class="radio-opt ${
              checkoutState.freightService === option.code ? "checked" : ""
            }" style="margin-top:8px;">
                <input
                    type="radio"
                    name="freightService"
                    value="${escapeHTML(option.code)}"
                    ${checkoutState.freightService === option.code ? "checked" : ""}
                >
                <span>
                    <strong>${escapeHTML(option.name)}</strong>
                    <span class="sub">
                        ${fmtPrice(option.price)}${
                          option.deliveryTime
                            ? ` · ${escapeHTML(option.deliveryTime)}`
                            : ""
                        }
                    </span>
                </span>
            </label>
        `,
    )
    .join("");
}

async function calculateFreight() {
  const cepElement = document.getElementById("cep");
  const button = document.getElementById("calculateFreightBtn");

  const cep = cepElement ? cepElement.value.replace(/\D/g, "") : "";

  if (cep.length !== 8) {
    showToast("Digite um CEP válido com 8 números.");
    return;
  }

  checkoutState.freightLoading = true;
  checkoutState.freightOptions = [];
  checkoutState.freightService = null;

  if (button) {
    button.disabled = true;
    button.textContent = "Calculando...";
  }

  renderFreightOptionsOnly();

  try {
    const response = await fetch(FREIGHT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: cep,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível calcular o frete.");
    }

    checkoutState.freightOptions = Array.isArray(data.options)
      ? data.options
      : [];

    if (!checkoutState.freightOptions.length) {
      throw new Error("A SuperFrete não retornou PAC ou SEDEX para este CEP.");
    }

    checkoutState.freightService = checkoutState.freightOptions[0].code;
  } catch (error) {
    checkoutState.freightOptions = [];
    checkoutState.freightService = null;
    showToast(error.message || "Erro ao calcular o frete.");
  } finally {
    checkoutState.freightLoading = false;
    renderCheckout();
  }
}

function renderFreightOptionsOnly() {
  const box = document.getElementById("freightOptions");

  if (box) {
    box.innerHTML = freightOptionsHTML();
  }
}

function selectedFreightPrice() {
  const option = checkoutState.freightOptions.find(
    (item) => item.code === checkoutState.freightService,
  );

  return option ? Number(option.price) : 0;
}

function checkoutTotal(subtotal) {
  return Number(subtotal || 0) + selectedFreightPrice();
}

function renderCheckout() {
  const body = document.getElementById("checkoutBody");

  const foot = document.getElementById("checkoutFoot");

  const lines = cartLines();

  if (!body || !foot) return;

  if (!lines.length) {
    body.innerHTML = `

            <p
                style="
                    color:var(--muted);
                    padding:40px 0;
                    text-align:center;
                "
            >
                Seu carrinho está vazio.
            </p>

        `;

    foot.innerHTML = "";

    return;
  }

  const subtotal = cartSubtotal();

  const total = checkoutTotal(subtotal);

  body.innerHTML = `

        <fieldset>

            <legend>
                Entrega
            </legend>


            <div
                class="radio-row"
                id="deliveryOpts"
            >

                ${deliveryOptionsHTML()}

            </div>


            <div
                id="deliveryExtra"
                style="margin-top:12px;"
            ></div>

        </fieldset>


        <fieldset>

            <legend>
                Pagamento
            </legend>


            <div class="radio-opt checked">

                <span
                    style="
                        font-size:17px;
                        line-height:1;
                    "
                >
                    🔒
                </span>


                <span>

                    <strong>
                        Pix ou cartão de crédito
                    </strong>

                    <span class="sub">
                        O pagamento será processado
                        pela página segura da InfinitePay.
                    </span>

                </span>

            </div>

        </fieldset>

    `;

  foot.innerHTML = `

        <div class="subtotal-row">

            <span>
                Total
            </span>

            <strong>
                ${fmtPrice(total)}
            </strong>

        </div>


        <button
            type="button"
            class="btn btn-solid"
            style="width:100%;"
            id="goPayBtn"
        >
            Ir para pagamento seguro
        </button>


        <p class="note">

            O frete dos Correios é calculado pela SuperFrete.
            Escolha PAC ou SEDEX antes de pagar.

        </p>

    `;

  body.querySelectorAll('input[name="delivery"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      checkoutState.delivery = radio.value;

      if (radio.value !== "correios") {
        checkoutState.freightOptions = [];
        checkoutState.freightService = null;
        checkoutState.freightLoading = false;
      }

      renderCheckout();
    });
  });

  renderDeliveryExtra();

  const payButton = document.getElementById("goPayBtn");

  if (payButton) {
    payButton.addEventListener("click", () => {
      if (checkoutState.delivery === "correios") {
        if (
          !checkoutState.freightService ||
          !checkoutState.freightOptions.length
        ) {
          showToast(
            "Calcule o frete e escolha PAC ou SEDEX antes de continuar.",
          );
          return;
        }
      }

      goToInfinitePayCheckout(lines, total);
    });
  }
}

/* =========================================================
   CAMPOS DE ENTREGA
   ========================================================= */

function formatCheckoutAddress(address) {
  if (!address) return "";
  const line1 = [address.street, address.number].filter(Boolean).join(", ");
  const line2 = [address.complement, address.neighborhood]
    .filter(Boolean)
    .join(" — ");
  const line3 = [address.city, address.state].filter(Boolean).join("/");
  return [line1, line2, line3].filter(Boolean).join(" · ");
}

function savedAddressCheckoutHTML() {
  const address = currentCustomer?.address || null;
  if (!address)
    return `<div class="note" style="padding:10px 0;">Você não possui um endereço salvo na conta. Informe o endereço abaixo para continuar.</div>`;
  return `<div class="customer-address-summary" style="margin-bottom:12px;"><strong>Endereço salvo na sua conta</strong><span>${escapeHTML(formatCustomerCep(address.cep || ""))}</span><span>${escapeHTML(formatCheckoutAddress(address))}</span></div>`;
}

function renderDeliveryExtra() {
  const container = document.getElementById("deliveryExtra");

  if (!container) return;

  if (checkoutState.delivery === "correios") {
    container.innerHTML = `

            ${savedAddressCheckoutHTML()}

            <div class="field-wrap">

                <label class="field">
                    CEP de destino
                </label>

                <div style="display:flex;gap:8px;align-items:flex-end;">

                    <input
                        type="text"
                        id="cep"
                        placeholder="00000-000"
                        maxlength="9"
                        inputmode="numeric"
                        value="${escapeHTML(checkoutState.cep || "")}"
                        style="flex:1;"
                    >

                    <button
                        type="button"
                        class="btn btn-solid"
                        id="calculateFreightBtn"
                    >
                        Calcular frete
                    </button>

                </div>

            </div>

            <div
                class="field-wrap"
                id="freightOptions"
                style="margin-top:12px;"
            >
                ${freightOptionsHTML()}
            </div>

            <div class="field-wrap">

                <label class="field">
                    Endereço completo
                </label>

                <textarea
                    id="endereco"
                    rows="3"
                    placeholder="Rua, número, bairro, cidade"
                >${escapeHTML(checkoutState.endereco || "")}</textarea>

            </div>

            <p class="note">
                Origem cadastrada: CEP 60720-605 · Serviços: PAC e SEDEX.
            </p>

        `;

    const cepInput = document.getElementById("cep");
    const enderecoInput = document.getElementById("endereco");
    const calculateButton = document.getElementById("calculateFreightBtn");

    if (cepInput) {
      cepInput.addEventListener("input", () => {
        checkoutState.cep = formatCep(cepInput.value);
        cepInput.value = checkoutState.cep;
      });
      cepInput.addEventListener("change", () => {
        checkoutState.cep = formatCep(cepInput.value);
        cepInput.value = checkoutState.cep;
      });
    }

    if (enderecoInput) {
      enderecoInput.addEventListener("input", () => {
        checkoutState.endereco = enderecoInput.value;
      });
    }

    if (calculateButton) {
      calculateButton.addEventListener("click", calculateFreight);
    }

    container
      .querySelectorAll('input[name="freightService"]')
      .forEach((radio) => {
        radio.addEventListener("change", () => {
          checkoutState.freightService = radio.value;
          renderCheckout();
        });
      });

    return;
  }

  if (checkoutState.delivery === "uber") {
    container.innerHTML = `
            ${savedAddressCheckoutHTML()}


            <div class="field-wrap">

                <label class="field">
                    Endereço para entrega
                </label>

                <textarea
                    id="endereco"
                    rows="3"
                    placeholder="Rua, número, bairro, cidade"
                >${escapeHTML(checkoutState.endereco || "")}</textarea>

            </div>

        `;

    const uberAddressInput = document.getElementById("endereco");
    if (uberAddressInput) {
      uberAddressInput.addEventListener("input", () => {
        checkoutState.endereco = uberAddressInput.value;
      });
    }

    return;
  }

  container.innerHTML = "";
}

/* =========================================================
   INFINITEPAY
   ========================================================= */

function buildRedirectUrl() {
  return window.location.origin + window.location.pathname;
}

async function goToInfinitePayCheckout(lines, subtotal) {
  if (!lines.length) {
    showToast("Seu carrinho está vazio.");

    return;
  }

  if (!INFINITEPAY_HANDLE || INFINITEPAY_HANDLE === "seu-handle-infinitepay") {
    showToast("Configure sua InfiniteTag no JavaScript.");

    return;
  }

  const orderNsu = "pedido-" + Date.now();

  const addressElement = document.getElementById("endereco");

  const cepElement = document.getElementById("cep");

  const endereco = addressElement ? addressElement.value.trim() : "";

  const cep = cepElement ? cepElement.value.replace(/\D/g, "") : "";

  const payload = {
    handle: INFINITEPAY_HANDLE,

    items: lines.map((line) => ({
      quantity: Number(line.qty),

      price: Math.round(Number(line.product.price) * 100),

      description: `${line.product.name} (${catLabel(line.product.category)})`,
    })),

    order_nsu: orderNsu,

    redirect_url: buildRedirectUrl(),
  };

  const freightPrice = selectedFreightPrice();

  if (freightPrice > 0) {
    payload.items.push({
      quantity: 1,
      price: Math.round(freightPrice * 100),
      description: `Frete ${
        checkoutState.freightService === "1" ? "PAC" : "SEDEX"
      }`,
    });
  }

  if (endereco) {
    payload.address = {
      cep: cep || undefined,

      street: endereco,
    };
  }

  await storageSet(
    "pending_order:" + orderNsu,

    JSON.stringify({
      orderNsu,

      delivery: checkoutState.delivery,

      endereco,

      cep,

      freightService: checkoutState.freightService,

      freightPrice: selectedFreightPrice(),

      subtotal: Number(subtotal) - selectedFreightPrice(),

      total: Number(subtotal),

      lines: lines.map((line) => ({
        name: line.product.name,

        category: line.product.category,

        qty: line.qty,

        price: line.product.price,
      })),
    }),

    false,
  );

  const button = document.getElementById("goPayBtn");

  if (button) {
    button.disabled = true;

    button.textContent = "Gerando pagamento...";
  }

  try {
    const response = await fetch(
      "https://api.infinitepay.io/invoices/public/checkout/links",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(payload),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.message || "Não foi possível gerar o pagamento.");
    }

    const checkoutUrl = data?.url || data?.checkout_url || data?.link;

    if (!checkoutUrl) {
      throw new Error("A InfinitePay não retornou o link de pagamento.");
    }

    window.location.href = checkoutUrl;
  } catch (error) {
    console.error("Erro InfinitePay:", error);

    if (button) {
      button.disabled = false;

      button.textContent = "Ir para pagamento seguro";
    }

    showToast(error.message || "Erro ao gerar pagamento.");
  }
}

/* =========================================================
   RETORNO DO PAGAMENTO
   ========================================================= */

async function handleReturnFromInfinitePay() {
  const params = new URLSearchParams(window.location.search);

  const orderNsu = params.get("order_nsu") || params.get("orderNsu");

  const transactionNsu =
    params.get("transaction_nsu") || params.get("transactionNsu");

  const receiptUrl = params.get("receipt_url") || params.get("receiptUrl");

  const status = (params.get("status") || "").toLowerCase();

  if (!orderNsu) {
    return;
  }

  const pendingRaw = await storageGet("pending_order:" + orderNsu);

  let pending = null;

  try {
    pending = pendingRaw ? JSON.parse(pendingRaw) : null;
  } catch {
    pending = null;
  }

  if (!pending) {
    return;
  }

  const success = [
    "approved",
    "paid",
    "success",
    "succeeded",
    "completed",
  ].includes(status);

  const cancelled = [
    "cancelled",
    "canceled",
    "failed",
    "declined",
    "error",
  ].includes(status);

  if (success) {
    await storageSet(
      "last_order",
      JSON.stringify({
        ...pending,

        status: "paid",

        transactionNsu: transactionNsu || "",

        receiptUrl: receiptUrl || "",

        paidAt: new Date().toISOString(),
      }),

      false,
    );

    cart = [];

    await saveCart();

    updateCartBadge();

    showOrderConfirmation({
      ...pending,

      status: "paid",

      transactionNsu: transactionNsu || "",

      receiptUrl: receiptUrl || "",
    });

    await storageDelete("pending_order:" + orderNsu);

    return;
  }

  if (cancelled) {
    showToast("O pagamento não foi aprovado.");

    return;
  }

  showToast("Pedido retornado. Verifique o status do pagamento.");
}

/* =========================================================
   CONFIRMAÇÃO DO PEDIDO
   ========================================================= */

function showOrderConfirmation(order) {
  const body = document.getElementById("checkoutBody");

  const foot = document.getElementById("checkoutFoot");

  if (!body || !foot) return;

  body.innerHTML = `

        <div
            style="
                text-align:center;
                padding:25px 0;
            "
        >

            <div
                style="
                    width:54px;
                    height:54px;
                    margin:0 auto 16px;
                    border:1px solid var(--line);
                    border-radius:50%;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    font-size:24px;
                "
            >
                ✓
            </div>


            <h3
                style="
                    margin:0 0 8px;
                    font-family:var(--serif);
                    font-size:24px;
                "
            >
                Pedido confirmado
            </h3>


            <p
                style="
                    color:var(--muted);
                    font-size:13px;
                    line-height:1.6;
                    margin:0 auto;
                    max-width:360px;
                "
            >
                Seu pagamento foi processado.
                Obrigada por comprar na Drops de Luxo.
            </p>


            <div
                style="
                    margin-top:22px;
                    padding:15px;
                    border:1px solid var(--line);
                    text-align:left;
                    font-size:12px;
                    line-height:1.7;
                "
            >

                <div>
                    <strong>
                        Pedido:
                    </strong>
                    ${escapeHTML(order.orderNsu || "")}
                </div>


                <div>
                    <strong>
                        Total:
                    </strong>
                    ${fmtPrice(Number(order.subtotal || 0))}
                </div>


                ${
                  order.transactionNsu
                    ? `
                            <div>
                                <strong>
                                    Transação:
                                </strong>
                                ${escapeHTML(order.transactionNsu)}
                            </div>
                        `
                    : ""
                }

            </div>

        </div>

    `;

  foot.innerHTML = `

        ${
          order.receiptUrl
            ? `
                    <a
                        href="${escapeHTML(order.receiptUrl)}"
                        target="_blank"
                        rel="noopener"
                        class="btn btn-solid"
                        style="
                            width:100%;
                            text-align:center;
                            display:block;
                            text-decoration:none;
                        "
                    >
                        Ver comprovante
                    </a>
                `
            : ""
        }


        <button
            type="button"
            class="btn btn-outline"
            style="
                width:100%;
                margin-top:8px;
            "
            id="closeCheckoutAfterOrder"
        >
            Continuar navegando
        </button>

    `;

  const closeButton = document.getElementById("closeCheckoutAfterOrder");

  if (closeButton) {
    closeButton.addEventListener("click", () => {
      closeDrawer("checkout");
    });
  }
}

/* =========================================================
   IMAGEM DO ADMIN
   ========================================================= */

function readAndCompressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Selecione uma imagem válida."));

      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      const image = new Image();

      image.onload = () => {
        const maxSize = 900;

        let width = image.width;

        let height = image.height;

        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);

          width = Math.round(width * ratio);

          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");

        canvas.width = width;

        canvas.height = height;

        const context = canvas.getContext("2d");

        context.drawImage(image, 0, 0, width, height);

        const result = canvas.toDataURL("image/jpeg", 0.82);

        resolve(result);
      };

      image.onerror = () => {
        reject(new Error("Não foi possível ler a imagem."));
      };

      image.src = event.target.result;
    };

    reader.onerror = () => {
      reject(new Error("Não foi possível carregar a imagem."));
    };

    reader.readAsDataURL(file);
  });
}

/* =========================================================
   ADMIN
   ========================================================= */

function renderAdmin() {
  const body = document.getElementById("adminBody");
  if (!body) return;

  body.innerHTML = `

        <fieldset>
            <legend>Cadastrar produto</legend>

            <div class="admin-form-grid">

                <div class="field-wrap">
                    <label class="field" for="newName">Nome do produto</label>
                    <input type="text" id="newName" placeholder="Ex.: Khamrah">
                </div>

                <div class="field-wrap">
                    <label class="field" for="newBrand">Marca</label>
                    <input type="text" id="newBrand" placeholder="Ex.: Lattafa">
                </div>

                <div class="field-wrap">
                    <label class="field" for="newCat">Categoria</label>
                    <select id="newCat">
                        ${CATEGORIES.map(
                          (category) => `
                            <option value="${category.id}">
                                ${escapeHTML(category.label)}
                            </option>
                        `,
                        ).join("")}
                    </select>
                </div>

                <div class="field-wrap">
                    <label class="field" for="newGender">Gênero</label>
                    <select id="newGender">
                        <option value="feminino">Feminino</option>
                        <option value="masculino">Masculino</option>
                        <option value="unissex">Unissex</option>
                    </select>
                </div>

                <div class="field-wrap">
                    <label class="field" for="newVolume">Volume</label>
                    <input type="number" id="newVolume" min="0" step="1" placeholder="Ex.: 100">
                </div>

                <div class="field-wrap">
                    <label class="field" for="newPrice">Preço de venda</label>
                    <input type="number" id="newPrice" min="0" step="0.01" placeholder="59.90">
                </div>

                <div class="field-wrap">
                    <label class="field" for="newOriginalPrice">Preço original <span class="field-optional">(opcional)</span></label>
                    <input type="number" id="newOriginalPrice" min="0" step="0.01" placeholder="79.90">
                </div>

                <div class="field-wrap">
                    <label class="field" for="newStock">Estoque</label>
                    <input type="number" id="newStock" min="0" step="1" value="1">
                </div>

            </div>

            <div class="field-wrap">
                <label class="field" for="newDesc">Descrição</label>
                <textarea id="newDesc" rows="4" placeholder="Descreva a fragrância, família olfativa, fixação e características do produto."></textarea>
            </div>

            <div class="admin-checks">
                <label class="admin-check">
                    <input type="checkbox" id="newIsLaunch" checked>
                    <span>Exibir em <strong>Lançamentos</strong></span>
                </label>

                <label class="admin-check">
                    <input type="checkbox" id="newIsFeatured">
                    <span>Marcar como <strong>Destaque</strong></span>
                </label>
            </div>

            <div class="photo-upload">
                <label class="field">Foto do produto</label>

                <div id="photoPreview" class="photo-preview empty">
                    <img id="photoPreviewImage" src="" alt="" style="display:none;">
                    <span id="photoPreviewText">Nenhuma foto selecionada</span>
                </div>

                <input type="file" id="newImage" accept="image/*" hidden>

                <div class="photo-buttons">
                    <button type="button" class="btn btn-outline" id="chooseImageBtn">Escolher foto</button>
                    <button type="button" class="btn btn-outline" id="removeImageBtn">Remover foto</button>
                </div>

                <p class="note">
                    Use uma foto nítida do produto. A imagem será reduzida automaticamente para facilitar o armazenamento.
                </p>
            </div>

            <button type="button" class="btn btn-solid" id="addProductBtn" style="width:100%;">
                Cadastrar produto
            </button>
        </fieldset>

        <fieldset>
            <legend>Produtos cadastrados</legend>

            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Foto</th>
                            <th>Produto</th>
                            <th>Marca</th>
                            <th>Categoria</th>
                            <th>Volume</th>
                            <th>Preço</th>
                            <th>Estoque</th>
                            <th>Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                          catalog.length
                            ? catalog
                                .map(
                                  (product) => `
                            <tr>
                                <td>
                                    ${
                                      product.image
                                        ? `
                                        <img src="${product.image}" alt="${escapeHTML(product.name)}" style="width:46px;height:58px;object-fit:cover;border-radius:4px;border:1px solid var(--line);">
                                    `
                                        : `
                                        <div style="width:46px;height:58px;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:4px;font-size:10px;color:var(--muted);">—</div>
                                    `
                                    }
                                </td>
                                <td>${escapeHTML(product.name)}</td>
                                <td>${escapeHTML(product.brand || "—")}</td>
                                <td>${escapeHTML(catLabel(product.category))}</td>
                                <td>${product.volume ? `${Number(product.volume)} ml` : "—"}</td>
                                <td>
                                    ${
                                      product.originalPrice &&
                                      Number(product.originalPrice) >
                                        Number(product.price)
                                        ? `<del>${fmtPrice(product.originalPrice)}</del><br>${fmtPrice(product.price)}`
                                        : fmtPrice(product.price)
                                    }
                                </td>
                                <td>${Number(product.stock || 0)}</td>
                                <td>
                                    <button type="button" class="remove-link" data-del="${product.id}">remover</button>
                                </td>
                            </tr>
                        `,
                                )
                                .join("")
                            : `
                            <tr>
                                <td colspan="8" style="text-align:center;color:var(--muted);padding:20px;">Nenhum produto cadastrado.</td>
                            </tr>
                        `
                        }
                    </tbody>
                </table>
            </div>
        </fieldset>

        <p class="note">
            Os produtos são salvos no armazenamento disponível no navegador.
        </p>
    `;

  let selectedImage = "";

  const fileInput = document.getElementById("newImage");
  const chooseButton = document.getElementById("chooseImageBtn");
  const removeButton = document.getElementById("removeImageBtn");
  const preview = document.getElementById("photoPreview");
  const previewImage = document.getElementById("photoPreviewImage");
  const previewText = document.getElementById("photoPreviewText");

  chooseButton.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    try {
      showToast("Preparando imagem...");
      selectedImage = await readAndCompressImage(file);
      previewImage.src = selectedImage;
      previewImage.style.display = "block";
      previewText.style.display = "none";
      preview.classList.remove("empty");
      showToast("Foto carregada.");
    } catch (error) {
      console.error(error);
      selectedImage = "";
      fileInput.value = "";
      showToast(error.message || "Não foi possível carregar a foto.");
    }
  });

  removeButton.addEventListener("click", () => {
    selectedImage = "";
    fileInput.value = "";
    previewImage.src = "";
    previewImage.style.display = "none";
    previewText.style.display = "block";
    preview.classList.add("empty");
  });

  const addButton = document.getElementById("addProductBtn");

  addButton.addEventListener("click", async () => {
    const name = document.getElementById("newName").value.trim();
    const brand = document.getElementById("newBrand").value.trim();
    const category = document.getElementById("newCat").value;
    const gender = document.getElementById("newGender").value;
    const volume = parseInt(
      document.getElementById("newVolume").value || "0",
      10,
    );
    const price = parseFloat(document.getElementById("newPrice").value);
    const originalPrice = parseFloat(
      document.getElementById("newOriginalPrice").value || "0",
    );
    const stock = parseInt(
      document.getElementById("newStock").value || "0",
      10,
    );
    const desc = document.getElementById("newDesc").value.trim();
    const isLaunch = document.getElementById("newIsLaunch").checked;
    const isFeatured = document.getElementById("newIsFeatured").checked;

    if (!name || !category || Number.isNaN(price)) {
      showToast("Preencha nome, categoria e preço.");
      return;
    }

    if (volume < 0 || stock < 0 || price < 0 || originalPrice < 0) {
      showToast("Verifique os valores informados.");
      return;
    }

    if (originalPrice > 0 && originalPrice < price) {
      showToast("O preço original deve ser maior ou igual ao preço de venda.");
      return;
    }

    const product = {
      id: "p" + Date.now(),
      name,
      brand,
      category,
      gender,
      volume,
      price,
      originalPrice: originalPrice || 0,
      stock,
      desc,
      isLaunch,
      isFeatured,
      image: selectedImage || "",
    };

    catalog.push(product);
    await saveCatalog();

    renderLaunches();
    renderGrid();
    renderAdmin();
    showToast("Produto cadastrado com sucesso.");
  });

  body.querySelectorAll("[data-del]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.del;
      const product = catalog.find((item) => item.id === id);
      if (!product) return;

      if (!confirm(`Remover o produto "${product.name}"?`)) return;

      catalog = catalog.filter((item) => item.id !== id);
      await saveCatalog();
      renderLaunches();
      renderGrid();
      renderAdmin();
      showToast("Produto removido.");
    });
  });
}

/* =========================================================
   MODAL — DETALHES DO PRODUTO
   ========================================================= */

let activeProductDetailsId = null;

function openProductDetails(productId) {
  const normalizedProductId = String(productId ?? "").trim();

  const product = catalog.find(
    (item) => String(item?.id ?? "").trim() === normalizedProductId,
  );

  const modal = document.getElementById("productModal");

  const backdrop = document.getElementById("productModalBackdrop");

  const media = document.getElementById("productModalMedia");

  const category = document.getElementById("productModalCategory");

  const title = document.getElementById("productModalTitle");

  const description = document.getElementById("productModalDescription");

  const meta = document.getElementById("productModalMeta");

  const price = document.getElementById("productModalPrice");

  const stock = document.getElementById("productModalStock");

  const addButton = document.getElementById("productModalAdd");

  if (!product || !modal || !backdrop) {
    return;
  }

  activeProductDetailsId = product.id;

  if (media) {
    media.innerHTML = productImageHTML(product, "modal");
  }

  if (category) {
    category.textContent = catLabel(product.category);
  }

  if (title) {
    title.textContent = product.name;
  }

  if (description) {
    description.textContent =
      product.desc || "Uma fragrância selecionada pela Drops de Luxo.";
  }

  if (meta) {
    const metaParts = [];
    if (product.brand) metaParts.push(`Marca: ${product.brand}`);
    if (product.gender) {
      const genderLabels = {
        feminino: "Feminino",
        masculino: "Masculino",
        unissex: "Unissex",
      };
      metaParts.push(genderLabels[product.gender] || product.gender);
    }
    if (product.volume) metaParts.push(`${Number(product.volume)} ml`);
    meta.innerHTML = metaParts
      .map((item) => `<span>${escapeHTML(item)}</span>`)
      .join("");
  }

  if (price) {
    price.innerHTML =
      product.originalPrice &&
      Number(product.originalPrice) > Number(product.price)
        ? `<del>${fmtPrice(product.originalPrice)}</del><strong>${fmtPrice(product.price)}</strong>`
        : `<strong>${fmtPrice(product.price)}</strong>`;
  }

  const stockValue = Number(product.stock || 0);

  if (stock) {
    if (stockValue > 0) {
      stock.textContent =
        stockValue === 1
          ? "● Última unidade disponível"
          : `● ${stockValue} unidades disponíveis`;

      stock.classList.add("in-stock");

      stock.classList.remove("out-of-stock");
    } else {
      stock.textContent = "● Produto sem estoque";

      stock.classList.add("out-of-stock");

      stock.classList.remove("in-stock");
    }
  }

  if (addButton) {
    addButton.disabled = stockValue <= 0;

    addButton.textContent =
      stockValue > 0 ? "Adicionar ao carrinho" : "Produto sem estoque";
  }

  modal.classList.add("show");
  backdrop.classList.add("show");

  modal.setAttribute("aria-hidden", "false");

  backdrop.setAttribute("aria-hidden", "false");

  document.body.classList.add("product-modal-open");

  if (addButton) {
    setTimeout(() => addButton.focus(), 50);
  }
}

function closeProductDetails() {
  const modal = document.getElementById("productModal");

  const backdrop = document.getElementById("productModalBackdrop");

  if (modal) {
    modal.classList.remove("show");

    modal.setAttribute("aria-hidden", "true");
  }

  if (backdrop) {
    backdrop.classList.remove("show");

    backdrop.setAttribute("aria-hidden", "true");
  }

  document.body.classList.remove("product-modal-open");

  activeProductDetailsId = null;
}

function initializeProductModal() {
  const closeButton = document.getElementById("productModalClose");

  const backdrop = document.getElementById("productModalBackdrop");

  const addButton = document.getElementById("productModalAdd");

  if (closeButton) {
    closeButton.addEventListener("click", closeProductDetails);
  }

  if (backdrop) {
    backdrop.addEventListener("click", closeProductDetails);
  }

  if (addButton) {
    addButton.addEventListener("click", async () => {
      if (!activeProductDetailsId) {
        return;
      }

      const productId = activeProductDetailsId;

      await addToCart(productId);

      closeProductDetails();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const modal = document.getElementById("productModal");

      if (modal && modal.classList.contains("show")) {
        closeProductDetails();
      }
    }
  });
}

/* =========================================================
   DRAWERS
   ========================================================= */

function openDrawer(name) {
  const drawer = document.getElementById(name + "Drawer");

  const overlay = document.getElementById("overlay");

  if (!drawer) {
    console.error("Drawer não encontrado:", name);

    return;
  }

  if (overlay) {
    overlay.classList.add("show");
  }

  drawer.classList.add("show");

  document.body.classList.add("drawer-open");
}

function closeDrawer(name) {
  const drawer = document.getElementById(name + "Drawer");

  if (drawer) {
    drawer.classList.remove("show");
  }

  const openDrawers = ["cart", "checkout", "admin", "customer"].some((item) => {
    const element = document.getElementById(item + "Drawer");

    return element && element.classList.contains("show");
  });

  if (!openDrawers) {
    const overlay = document.getElementById("overlay");

    if (overlay) {
      overlay.classList.remove("show");
    }

    document.body.classList.remove("drawer-open");
  }
}

/* =========================================================
   EVENTOS DOS DRAWERS
   ========================================================= */

function initializeDrawers() {
  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      closeDrawer(button.dataset.close);
    });
  });

  const overlay = document.getElementById("overlay");

  if (overlay) {
    overlay.addEventListener("click", () => {
      ["cart", "checkout", "admin"].forEach((drawer) => {
        closeDrawer(drawer);
      });
    });
  }

  const cartButton = document.getElementById("cartOpenBtn");

  if (cartButton) {
    cartButton.addEventListener("click", () => {
      renderCart();

      openDrawer("cart");
    });
  }

  const adminButton = document.getElementById("adminOpenBtn");

  if (adminButton) {
    adminButton.addEventListener("click", () => {
      window.location.href = "/admin/";
    });
  }

  const adminLink = document.getElementById("adminOpenLink");

  if (adminLink) {
    adminLink.addEventListener("click", (event) => {
      event.preventDefault();
      window.location.href = "/admin/";
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      ["cart", "checkout", "admin"].forEach((drawer) => {
        closeDrawer(drawer);
      });
    }
  });
}

/* =========================================================
   BUSCA DE PRODUTOS
   ========================================================= */

function initializeSearch() {
  const input = document.getElementById("searchInput");

  if (!input) return;

  input.addEventListener("input", () => {
    searchTerm = input.value;

    renderGrid();
  });
}

/* =========================================================
   WHATSAPP
   ========================================================= */

function setWhatsAppLinks() {
  const message =
    "Olá! Vim pelo site da Drops de Luxo e gostaria de mais informações.";

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    message,
  )}`;

  ["footerWaBtn", "waFloat"].forEach((id) => {
    const element = document.getElementById(id);

    if (!element) return;

    element.href = url;

    element.target = "_blank";

    element.rel = "noopener";
  });
}

/* =========================================================
   HERO SLIDER
   ========================================================= */

function initializeHeroSlider() {
  const slider = document.querySelector(".hero-slider");

  if (!slider) return;

  const track = document.getElementById("heroSliderTrack");

  const slides = Array.from(slider.querySelectorAll(".hero-slide"));

  const dots = Array.from(slider.querySelectorAll(".hero-dot"));

  const previousButton = document.getElementById("heroSliderPrev");

  const nextButton = document.getElementById("heroSliderNext");

  if (!track || !slides.length) {
    return;
  }

  let currentSlide = 0;

  let timer = null;

  /* =====================================================
       MOSTRAR SLIDE
       ===================================================== */

  function showSlide(index) {
    if (index < 0) {
      index = slides.length - 1;
    }

    if (index >= slides.length) {
      index = 0;
    }

    currentSlide = index;

    track.style.transform = `translateX(-${currentSlide * 100}%)`;

    slides.forEach((slide, slideIndex) => {
      slide.classList.toggle("active", slideIndex === currentSlide);
    });

    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === currentSlide);
    });
  }

  /* =====================================================
       PRÓXIMO
       ===================================================== */

  function nextSlide() {
    showSlide(currentSlide + 1);
  }

  /* =====================================================
       ANTERIOR
       ===================================================== */

  function previousSlide() {
    showSlide(currentSlide - 1);
  }

  /* =====================================================
       AUTOPLAY
       ===================================================== */

  function startAutoPlay() {
    clearInterval(timer);

    timer = setInterval(nextSlide, HERO_INTERVAL);
  }

  function restartAutoPlay() {
    clearInterval(timer);

    startAutoPlay();
  }

  /* =====================================================
       BOTÃO PRÓXIMO
       ===================================================== */

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      nextSlide();

      restartAutoPlay();
    });
  }

  /* =====================================================
       BOTÃO ANTERIOR
       ===================================================== */

  if (previousButton) {
    previousButton.addEventListener("click", () => {
      previousSlide();

      restartAutoPlay();
    });
  }

  /* =====================================================
       DOTS
       ===================================================== */

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      showSlide(index);

      restartAutoPlay();
    });
  });

  slider.addEventListener("mouseenter", () => {
    clearInterval(timer);
  });

  slider.addEventListener("mouseleave", () => {
    startAutoPlay();
  });

  showSlide(0);

  startAutoPlay();
}

/* =========================================================
   CLIQUE ROBUSTO — VER DETALHES
   Garante o funcionamento mesmo quando os cards são recriados
   dinamicamente pelo catálogo/API.
   ========================================================= */

function initializeProductDetailsDelegation() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest(
      "[data-details], [data-launch-details]",
    );

    if (!button) return;

    const productId =
      button.getAttribute("data-details") ||
      button.getAttribute("data-launch-details");

    if (!productId) return;

    event.preventDefault();
    event.stopPropagation();

    openProductDetails(productId);
  });
}

/* =========================================================
   MINHA CONTA — CLIENTE / ENDEREÇO — ETAPA 5
   ========================================================= */

let currentCustomer = null;
let customerAuthMode = "login";

async function customerRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  let data = {};
  try {
    data = await response.json();
  } catch (_) {}

  if (!response.ok) {
    throw new Error(data.error || "Não foi possível concluir a operação.");
  }

  return data;
}

function customerEscape(value) {
  if (typeof escapeHTML === "function") return escapeHTML(value ?? "");
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCustomerCep(value) {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 8);
  return digits.length > 5
    ? `${digits.slice(0, 5)}-${digits.slice(5)}`
    : digits;
}

function formatCustomerPhone(value) {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 13);
  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, (_, a, b, c) =>
      c ? `(${a}) ${b}-${c}` : `(${a}) ${b}`,
    );
  }
  return digits.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, (_, a, b, c) =>
    c ? `(${a}) ${b}-${c}` : `(${a}) ${b}`,
  );
}

function customerAddressSummary(address) {
  if (!address)
    return `<div class="customer-address-summary"><strong>Nenhum endereço cadastrado</strong><span>Cadastre seu endereço para facilitar o cálculo do frete e a finalização do pedido.</span></div>`;
  const line1 = `${address.street || ""}, ${address.number || ""}${address.complement ? ` — ${address.complement}` : ""}`;
  const line2 = `${address.neighborhood || ""} · ${address.city || ""}/${address.state || ""}`;
  return `<div class="customer-address-summary"><strong>${customerEscape(address.cep ? formatCustomerCep(address.cep) : "Endereço salvo")}</strong><span>${customerEscape(line1)}</span><span>${customerEscape(line2)}</span></div>`;
}

function renderCustomerAuth() {
  const body = document.getElementById("customerBody");
  if (!body) return;

  const login = customerAuthMode === "login";
  body.innerHTML = `
        <div class="customer-panel">
            <div class="customer-welcome">
                <span class="eyebrow">Drops de Luxo</span>
                <h3>${login ? "Acesse sua conta" : "Crie sua conta"}</h3>
                <p>${login ? "Entre para salvar seu endereço e agilizar suas próximas compras." : "Cadastre seus dados para ter uma experiência de compra mais prática."}</p>
            </div>

            <div class="customer-auth-tabs">
                <button type="button" class="customer-auth-tab ${login ? "active" : ""}" data-customer-auth="login">Entrar</button>
                <button type="button" class="customer-auth-tab ${!login ? "active" : ""}" data-customer-auth="register">Criar conta</button>
            </div>

            <form class="customer-form" id="customerAuthForm">
                ${
                  !login
                    ? `
                    <div class="field-wrap">
                        <label for="customerName">Nome completo</label>
                        <input id="customerName" name="name" type="text" autocomplete="name" required>
                    </div>
                `
                    : ""
                }

                <div class="field-wrap">
                    <label for="customerEmail">E-mail</label>
                    <input id="customerEmail" name="email" type="email" autocomplete="email" required>
                </div>

                ${
                  !login
                    ? `
                    <div class="field-wrap">
                        <label for="customerPhone">Telefone com DDD</label>
                        <input id="customerPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(85) 99999-9999" required>
                    </div>
                `
                    : ""
                }

                <div class="field-wrap">
                    <label for="customerPassword">Senha</label>
                    <input id="customerPassword" name="password" type="password" autocomplete="${login ? "current-password" : "new-password"}" required minlength="8">
                </div>

                ${
                  !login
                    ? `
                    <div class="field-wrap">
                        <label for="customerPasswordConfirm">Confirmar senha</label>
                        <input id="customerPasswordConfirm" name="passwordConfirm" type="password" autocomplete="new-password" required minlength="8">
                    </div>
                `
                    : ""
                }

                <button type="submit" class="btn btn-solid" id="customerAuthSubmit">${login ? "Entrar" : "Criar minha conta"}</button>
                <div class="customer-status" id="customerAuthStatus" aria-live="polite"></div>
            </form>
        </div>
    `;

  body.querySelectorAll("[data-customer-auth]").forEach((button) => {
    button.addEventListener("click", () => {
      customerAuthMode = button.dataset.customerAuth;
      renderCustomerAuth();
    });
  });

  const phone = document.getElementById("customerPhone");
  if (phone)
    phone.addEventListener("input", () => {
      phone.value = formatCustomerPhone(phone.value);
    });

  const form = document.getElementById("customerAuthForm");
  if (form) form.addEventListener("submit", handleCustomerAuthSubmit);
}

async function handleCustomerAuthSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById("customerAuthStatus");
  const submit = document.getElementById("customerAuthSubmit");
  const data = Object.fromEntries(new FormData(form).entries());

  if (
    customerAuthMode === "register" &&
    data.password !== data.passwordConfirm
  ) {
    if (status) status.textContent = "As senhas não conferem.";
    return;
  }

  try {
    if (submit) submit.disabled = true;
    if (status) status.textContent = "Processando...";

    const endpoint =
      customerAuthMode === "login"
        ? "/api/customer/login"
        : "/api/customer/register";
    const payload =
      customerAuthMode === "login"
        ? { email: data.email, password: data.password }
        : {
            name: data.name,
            email: data.email,
            phone: String(data.phone || "").replace(/\D/g, ""),
            password: data.password,
          };

    const result = await customerRequest(endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    currentCustomer = result.customer || null;
    renderCustomerAccount();
    showToast(
      customerAuthMode === "login"
        ? "Login realizado."
        : "Conta criada com sucesso.",
    );
  } catch (error) {
    if (status) status.textContent = error.message;
  } finally {
    if (submit) submit.disabled = false;
  }
}

function renderCustomerAccount() {
  const body = document.getElementById("customerBody");
  if (!body || !currentCustomer) return;

  const firstName = String(currentCustomer.name || "Cliente")
    .trim()
    .split(/\s+/)[0];
  const address = currentCustomer.address || null;

  body.innerHTML = `
        <div class="customer-panel">
            <div class="customer-welcome">
                <span class="eyebrow">Olá, ${customerEscape(firstName)}</span>
                <h3>Minha conta</h3>
                <p>${customerEscape(currentCustomer.email || "")}</p>
            </div>

            <div class="customer-section">
                <div class="customer-section-head">
                    <div>
                        <h4>Meu endereço</h4>
                        <p>Salve seu endereço para facilitar a entrega e o cálculo do frete.</p>
                    </div>
                </div>

                ${customerAddressSummary(address)}

                <form class="customer-form" id="customerAddressForm">
                    <div class="field-wrap">
                        <label for="customerCep">CEP</label>
                        <input id="customerCep" name="cep" type="text" inputmode="numeric" maxlength="9" placeholder="00000-000" value="${customerEscape(address?.cep ? formatCustomerCep(address.cep) : "")}" required>
                    </div>

                    <div class="customer-form-grid">
                        <div class="field-wrap">
                            <label for="customerStreet">Rua / Avenida</label>
                            <input id="customerStreet" name="street" type="text" value="${customerEscape(address?.street || "")}" required>
                        </div>
                        <div class="field-wrap">
                            <label for="customerNumber">Número</label>
                            <input id="customerNumber" name="number" type="text" value="${customerEscape(address?.number || "")}" required>
                        </div>
                    </div>

                    <div class="field-wrap">
                        <label for="customerComplement">Complemento</label>
                        <input id="customerComplement" name="complement" type="text" value="${customerEscape(address?.complement || "")}" placeholder="Apartamento, bloco, casa...">
                    </div>

                    <div class="field-wrap">
                        <label for="customerNeighborhood">Bairro</label>
                        <input id="customerNeighborhood" name="neighborhood" type="text" value="${customerEscape(address?.neighborhood || "")}" required>
                    </div>

                    <div class="customer-form-grid">
                        <div class="field-wrap">
                            <label for="customerCity">Cidade</label>
                            <input id="customerCity" name="city" type="text" value="${customerEscape(address?.city || "")}" required>
                        </div>
                        <div class="field-wrap">
                            <label for="customerState">Estado</label>
                            <select id="customerState" name="state" required>
                                <option value="">UF</option>
                                ${["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"].map((uf) => `<option value="${uf}" ${address?.state === uf ? "selected" : ""}>${uf}</option>`).join("")}
                            </select>
                        </div>
                    </div>

                    <button type="submit" class="btn btn-solid" id="saveCustomerAddressBtn">Salvar endereço</button>
                    <div class="customer-status" id="customerAddressStatus" aria-live="polite"></div>
                </form>
            </div>

            <button type="button" class="btn customer-logout" id="customerLogoutBtn">Sair da conta</button>
        </div>
    `;

  const cep = document.getElementById("customerCep");
  if (cep) {
    cep.addEventListener("input", () => {
      cep.value = formatCustomerCep(cep.value);
    });
    cep.addEventListener("blur", lookupCustomerCep);
  }

  const form = document.getElementById("customerAddressForm");
  if (form) form.addEventListener("submit", saveCustomerAddress);

  const logout = document.getElementById("customerLogoutBtn");
  if (logout) logout.addEventListener("click", logoutCustomer);
}

async function lookupCustomerCep() {
  const input = document.getElementById("customerCep");
  if (!input) return;
  const cep = input.value.replace(/\D/g, "");
  if (cep.length !== 8) return;

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!response.ok) return;
    const data = await response.json();
    if (data.erro) return;

    const street = document.getElementById("customerStreet");
    const neighborhood = document.getElementById("customerNeighborhood");
    const city = document.getElementById("customerCity");
    const state = document.getElementById("customerState");
    if (street && !street.value) street.value = data.logradouro || "";
    if (neighborhood && !neighborhood.value)
      neighborhood.value = data.bairro || "";
    if (city && !city.value) city.value = data.localidade || "";
    if (state && data.uf) state.value = data.uf;
  } catch (error) {
    console.warn("Não foi possível consultar o CEP.", error);
  }
}

async function saveCustomerAddress(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById("customerAddressStatus");
  const button = document.getElementById("saveCustomerAddressBtn");
  const data = Object.fromEntries(new FormData(form).entries());

  try {
    if (button) button.disabled = true;
    if (status) status.textContent = "Salvando endereço...";

    const result = await customerRequest("/api/customer/profile", {
      method: "POST",
      body: JSON.stringify({
        cep: String(data.cep || "").replace(/\D/g, ""),
        street: data.street,
        number: data.number,
        complement: data.complement,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
      }),
    });

    currentCustomer = result.customer || currentCustomer;
    renderCustomerAccount();
    showToast("Endereço salvo com sucesso.");
  } catch (error) {
    if (status) status.textContent = error.message;
  } finally {
    if (button) button.disabled = false;
  }
}

async function logoutCustomer() {
  try {
    await customerRequest("/api/customer/logout", {
      method: "POST",
      body: "{}",
    });
  } catch (error) {
    console.error(error);
  }
  currentCustomer = null;
  customerAuthMode = "login";
  renderCustomerAuth();
  showToast("Você saiu da sua conta.");
}

async function loadCurrentCustomer() {
  try {
    const result = await customerRequest("/api/customer/me", {
      method: "GET",
      headers: {},
    });
    currentCustomer = result.authenticated ? result.customer : null;
  } catch (error) {
    currentCustomer = null;
    console.warn("Sessão do cliente não pôde ser consultada.", error);
  }
}

async function openCustomerAccount() {
  await loadCurrentCustomer();
  if (currentCustomer) renderCustomerAccount();
  else renderCustomerAuth();
  openDrawer("customer");
}

function initializeCustomerAccount() {
  const button = document.getElementById("customerOpenBtn");
  if (!button || button.dataset.customerReady === "1") return;
  button.dataset.customerReady = "1";
  button.addEventListener("click", openCustomerAccount);
}

/* =========================================================
   INICIALIZAÇÃO GERAL
   ========================================================= */

async function initializeStore() {
  try {
    initializeCustomerAccount();

    await loadCatalog();

    await loadCart();

    await loadCurrentCustomer();

    renderNav();

    initializeSearch();

    const viewAllProductsBtn = document.getElementById("viewAllProductsBtn");

    if (viewAllProductsBtn) {
      viewAllProductsBtn.addEventListener("click", () => {
        activeCategory = "all";
        renderNav();
        renderGrid();

        const catalogSection = document.getElementById("catalogo");
        if (catalogSection) {
          catalogSection.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      });
    }

    renderLaunches();

    renderGrid();

    updateCartBadge();

    initializeProductModal();

    initializeDrawers();

    initializeHeroSlider();

    setWhatsAppLinks();

    await handleReturnFromInfinitePay();
  } catch (error) {
    console.error("Erro ao inicializar a loja:", error);

    showToast("Ocorreu um erro ao carregar a loja.");
  }
}

/* =========================================================
   INICIAR QUANDO O HTML ESTIVER PRONTO
   ========================================================= */

initializeProductDetailsDelegation();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeStore);
} else {
  initializeStore();
}
