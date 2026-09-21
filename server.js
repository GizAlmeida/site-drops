/**
 * Drops de Luxo — backend da integração com a SuperFrete
 *
 * O token fica no arquivo .env e NUNCA no script.js.
 * Este servidor também entrega os arquivos estáticos da loja.
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

// Carrega um .env simples sem depender de pacote externo.
const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index === -1) continue;
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
    }
}

const SUPERFRETE_TOKEN = process.env.SUPERFRETE_TOKEN || "";
const SUPERFRETE_API_URL = process.env.SUPERFRETE_API_URL || "https://api.superfrete.com/api/v0/calculator";
const SUPERFRETE_USER_AGENT = process.env.SUPERFRETE_USER_AGENT || "DropsDeLuxo/1.0";


/* =========================================================
   INFINITEPAY — CHECKOUT E CONFIRMAÇÃO
   A criação do checkout passa pelo backend para evitar CORS.
   A webhook pública será usada quando o site estiver online.
   ========================================================= */
const INFINITEPAY_CHECKOUT_API_URL =
    "https://api.infinitepay.io/invoices/public/checkout/links";
const INFINITEPAY_PAYMENT_CHECK_URL =
    "https://api.checkout.infinitepay.io/payment_check";
const INFINITEPAY_WEBHOOK_URL = String(process.env.INFINITEPAY_WEBHOOK_URL || "").trim();
const ORDERS_DIR = path.join(ROOT, "data");
const ORDERS_FILE = path.join(ORDERS_DIR, "orders.json");

/* =========================================================
   AUTENTICAÇÃO — ÁREA ADMINISTRATIVA
   A senha nunca fica no HTML/JS.
   Configure ADMIN_EMAIL e ADMIN_PASSWORD_HASH no .env.
   ========================================================= */

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_PASSWORD_HASH = String(process.env.ADMIN_PASSWORD_HASH || "").trim();
const ADMIN_SESSION_COOKIE = "dl_admin_session";
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const adminSessions = new Map();
const loginAttempts = new Map();

/* =========================================================
   CLIENTES — ETAPA 4
   Cadastro, login e sessão do cliente.
   A sessão do cliente é independente da sessão administrativa.
   Senhas são armazenadas somente como hash scrypt.
   ========================================================= */

const CUSTOMER_SESSION_COOKIE = "dl_customer_session";
const CUSTOMER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CUSTOMER_DATA_DIR = path.join(ROOT, "data");
const CUSTOMERS_FILE = path.join(CUSTOMER_DATA_DIR, "customers.json");
const customerSessions = new Map();
const customerLoginAttempts = new Map();

function ensureCustomersFile() {
    if (!fs.existsSync(CUSTOMER_DATA_DIR)) {
        fs.mkdirSync(CUSTOMER_DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(CUSTOMERS_FILE)) {
        fs.writeFileSync(CUSTOMERS_FILE, "[]", "utf8");
    }
}

function readCustomersFile() {
    ensureCustomersFile();

    try {
        const parsed = JSON.parse(fs.readFileSync(CUSTOMERS_FILE, "utf8"));
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Erro ao ler clientes:", error);
        throw new Error("Não foi possível ler os clientes.");
    }
}

function writeCustomersFile(customers) {
    ensureCustomersFile();

    const tempFile = `${CUSTOMERS_FILE}.${process.pid}.${Date.now()}.tmp`;

    fs.writeFileSync(tempFile, JSON.stringify(customers, null, 2), "utf8");
    fs.renameSync(tempFile, CUSTOMERS_FILE);
}

function normalizeCustomerEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeCustomerPhone(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 13);
}

function hashCustomerPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const N = 16384;
    const r = 8;
    const p = 1;
    const keyLength = 64;

    const derived = crypto.scryptSync(password, salt, keyLength, {
        N, r, p, maxmem: 32 * 1024 * 1024
    });

    return `scrypt$${N}$${r}$${p}$${salt}$${derived.toString("hex")}`;
}

function sanitizeCustomer(customer) {
    if (!customer) return null;

    return {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address || null,
        createdAt: customer.createdAt
    };
}

function validateCustomerAddress(payload) {
    const cep = onlyDigits(payload?.cep).slice(0, 8);
    const street = String(payload?.street || "").trim().replace(/\s+/g, " ");
    const number = String(payload?.number || "").trim().replace(/\s+/g, " ");
    const complement = String(payload?.complement || "").trim().replace(/\s+/g, " ");
    const neighborhood = String(payload?.neighborhood || "").trim().replace(/\s+/g, " ");
    const city = String(payload?.city || "").trim().replace(/\s+/g, " ");
    const state = String(payload?.state || "").trim().toUpperCase();

    if (cep.length !== 8) throw new Error("Informe um CEP válido com 8 números.");
    if (street.length < 2 || street.length > 180) throw new Error("Informe a rua/avenida.");
    if (number.length < 1 || number.length > 20) throw new Error("Informe o número.");
    if (complement.length > 100) throw new Error("Complemento muito longo.");
    if (neighborhood.length < 2 || neighborhood.length > 100) throw new Error("Informe o bairro.");
    if (city.length < 2 || city.length > 100) throw new Error("Informe a cidade.");
    if (!/^[A-Z]{2}$/.test(state)) throw new Error("Informe o estado com 2 letras.");

    return { cep, street, number, complement, neighborhood, city, state };
}

async function customerUpdateProfile(req, res) {
    const session = getCustomerSession(req);
    if (!session) {
        return sendJson(res, 401, {
            authenticated: false,
            error: "Entre na sua conta para alterar seus dados."
        });
    }

    let payload;
    try {
        payload = await readJson(req, 20000);
    } catch (error) {
        return sendJson(res, 400, { error: error.message });
    }

    try {
        const address = validateCustomerAddress(payload);
        const customers = readCustomersFile();
        const index = customers.findIndex(customer => customer.id === session.customerId);

        if (index === -1) {
            customerSessions.delete(session.token);
            clearCustomerSessionCookie(res);
            return sendJson(res, 401, { authenticated: false, error: "Conta do cliente não encontrada." });
        }

        customers[index].address = address;
        customers[index].updatedAt = new Date().toISOString();
        writeCustomersFile(customers);

        return sendJson(res, 200, {
            authenticated: true,
            customer: sanitizeCustomer(customers[index])
        });
    } catch (error) {
        return sendJson(res, 400, { error: error.message });
    }
}

function createCustomerSession(customerId) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + CUSTOMER_SESSION_TTL_MS;

    customerSessions.set(token, { customerId, expiresAt });
    return { token, expiresAt };
}

function getCustomerSession(req) {
    const token = parseCookies(req)[CUSTOMER_SESSION_COOKIE];
    if (!token) return null;

    const session = customerSessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        if (session) customerSessions.delete(token);
        return null;
    }

    return { token, ...session };
}

function setCustomerSessionCookie(res, token, maxAgeSeconds) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

    res.setHeader("Set-Cookie",
        `${CUSTOMER_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`
    );
}

function clearCustomerSessionCookie(res) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie",
        `${CUSTOMER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
    );
}

function getCustomerById(id) {
    return readCustomersFile().find(customer => customer.id === id) || null;
}

function canAttemptCustomerLogin(ip) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const maxAttempts = 10;
    const entry = customerLoginAttempts.get(ip);

    if (!entry || now - entry.startedAt > windowMs) {
        customerLoginAttempts.set(ip, { startedAt: now, count: 0 });
        return true;
    }

    return entry.count < maxAttempts;
}

function registerFailedCustomerLogin(ip) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const entry = customerLoginAttempts.get(ip);

    if (!entry || now - entry.startedAt > windowMs) {
        customerLoginAttempts.set(ip, { startedAt: now, count: 1 });
        return;
    }

    entry.count += 1;
}

function clearCustomerLoginAttempts(ip) {
    customerLoginAttempts.delete(ip);
}

function validateCustomerRegistration(payload) {
    const name = String(payload?.name || "").trim().replace(/\s+/g, " ");
    const email = normalizeCustomerEmail(payload?.email);
    const phone = normalizeCustomerPhone(payload?.phone);
    const password = String(payload?.password || "");

    if (name.length < 3 || name.length > 120) throw new Error("Informe seu nome completo.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) throw new Error("Informe um e-mail válido.");
    if (phone.length < 10 || phone.length > 13) throw new Error("Informe um telefone válido com DDD.");
    if (password.length < 8 || password.length > 128) throw new Error("A senha deve ter entre 8 e 128 caracteres.");

    return { name, email, phone, password };
}

async function customerRegister(req, res) {
    let payload;
    try { payload = await readJson(req, 20000); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }

    try {
        const data = validateCustomerRegistration(payload);
        const customers = readCustomersFile();

        if (customers.some(customer => customer.email === data.email)) {
            return sendJson(res, 409, { error: "Já existe uma conta cadastrada com este e-mail." });
        }

        const customer = {
            id: `c${Date.now()}${crypto.randomBytes(4).toString("hex")}`,
            name: data.name,
            email: data.email,
            phone: data.phone,
            passwordHash: hashCustomerPassword(data.password),
            createdAt: new Date().toISOString()
        };

        customers.push(customer);
        writeCustomersFile(customers);

        const { token, expiresAt } = createCustomerSession(customer.id);
        setCustomerSessionCookie(res, token, Math.floor(CUSTOMER_SESSION_TTL_MS / 1000));

        return sendJson(res, 201, {
            authenticated: true,
            customer: sanitizeCustomer(customer),
            expiresAt
        });
    } catch (error) {
        return sendJson(res, 400, { error: error.message });
    }
}

async function customerLogin(req, res) {
    const ip = getClientIp(req);
    if (!canAttemptCustomerLogin(ip)) {
        return sendJson(res, 429, { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
    }

    let payload;
    try { payload = await readJson(req, 20000); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }

    const email = normalizeCustomerEmail(payload?.email);
    const password = String(payload?.password || "");
    const customer = readCustomersFile().find(item => item.email === email);
    const validPassword = customer ? verifyPassword(password, customer.passwordHash) : false;

    if (!customer || !validPassword) {
        registerFailedCustomerLogin(ip);
        return sendJson(res, 401, { authenticated: false, error: "E-mail ou senha inválidos." });
    }

    clearCustomerLoginAttempts(ip);
    const { token, expiresAt } = createCustomerSession(customer.id);
    setCustomerSessionCookie(res, token, Math.floor(CUSTOMER_SESSION_TTL_MS / 1000));

    return sendJson(res, 200, { authenticated: true, customer: sanitizeCustomer(customer), expiresAt });
}

function customerMe(req, res) {
    const session = getCustomerSession(req);
    if (!session) return sendJson(res, 200, { authenticated: false, customer: null, expiresAt: null });

    const customer = getCustomerById(session.customerId);
    if (!customer) {
        customerSessions.delete(session.token);
        clearCustomerSessionCookie(res);
        return sendJson(res, 200, { authenticated: false, customer: null, expiresAt: null });
    }

    return sendJson(res, 200, { authenticated: true, customer: sanitizeCustomer(customer), expiresAt: session.expiresAt });
}

function customerLogout(req, res) {
    const session = getCustomerSession(req);
    if (session) customerSessions.delete(session.token);
    clearCustomerSessionCookie(res);
    return sendJson(res, 200, { authenticated: false, customer: null });
}

setInterval(() => {
    const now = Date.now();
    for (const [token, session] of customerSessions) {
        if (session.expiresAt <= now) customerSessions.delete(token);
    }
    for (const [ip, entry] of customerLoginAttempts) {
        if (now - entry.startedAt > 15 * 60 * 1000) customerLoginAttempts.delete(ip);
    }
}, 15 * 60 * 1000).unref();

function parseCookies(req) {
    const header = req.headers.cookie || "";
    const cookies = {};

    for (const part of header.split(";")) {
        const index = part.indexOf("=");
        if (index === -1) continue;

        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();

        if (key) {
            cookies[key] = decodeURIComponent(value);
        }
    }

    return cookies;
}

function createSession() {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;

    adminSessions.set(token, { expiresAt });

    return { token, expiresAt };
}

function getAdminSession(req) {
    const token = parseCookies(req)[ADMIN_SESSION_COOKIE];
    if (!token) return null;

    const session = adminSessions.get(token);

    if (!session || session.expiresAt <= Date.now()) {
        if (session) adminSessions.delete(token);
        return null;
    }

    return { token, ...session };
}

function destroyAdminSession(req) {
    const token = parseCookies(req)[ADMIN_SESSION_COOKIE];
    if (token) adminSessions.delete(token);
}

function setAdminSessionCookie(res, token, maxAgeSeconds) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

    res.setHeader(
        "Set-Cookie",
        `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`
    );
}

function clearAdminSessionCookie(res) {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

    res.setHeader(
        "Set-Cookie",
        `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
    );
}

function safeEqual(a, b) {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));

    if (left.length !== right.length) return false;

    return crypto.timingSafeEqual(left, right);
}

function verifyPassword(password, storedHash) {
    const parts = String(storedHash).split("$");

    if (parts.length !== 6 || parts[0] !== "scrypt") {
        return false;
    }

    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = parts[4];
    const expectedHex = parts[5];

    if (
        !Number.isInteger(N) ||
        !Number.isInteger(r) ||
        !Number.isInteger(p) ||
        !salt ||
        !/^[0-9a-f]+$/i.test(expectedHex)
    ) {
        return false;
    }

    try {
        const derived = crypto.scryptSync(password, salt, expectedHex.length / 2, {
            N,
            r,
            p
        });

        return safeEqual(derived.toString("hex"), expectedHex.toLowerCase());
    } catch {
        return false;
    }
}

function getClientIp(req) {
    return String(
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress ||
        "unknown"
    ).split(",")[0].trim();
}

function canAttemptLogin(ip) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const maxAttempts = 10;

    const entry = loginAttempts.get(ip);

    if (!entry || now - entry.startedAt > windowMs) {
        loginAttempts.set(ip, {
            startedAt: now,
            count: 0
        });
        return true;
    }

    return entry.count < maxAttempts;
}

function registerFailedLogin(ip) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const entry = loginAttempts.get(ip);

    if (!entry || now - entry.startedAt > windowMs) {
        loginAttempts.set(ip, {
            startedAt: now,
            count: 1
        });
        return;
    }

    entry.count += 1;
}

function clearLoginAttempts(ip) {
    loginAttempts.delete(ip);
}

async function adminLogin(req, res) {
    const ip = getClientIp(req);

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD_HASH) {
        return sendJson(res, 503, {
            error: "A autenticação administrativa ainda não foi configurada no .env."
        });
    }

    if (!canAttemptLogin(ip)) {
        return sendJson(res, 429, {
            error: "Muitas tentativas. Aguarde alguns minutos e tente novamente."
        });
    }

    let payload;

    try {
        payload = await readJson(req);
    } catch (error) {
        return sendJson(res, 400, {
            error: error.message
        });
    }

    const email = String(payload?.email || "").trim().toLowerCase();
    const password = String(payload?.password || "");

    const validEmail = safeEqual(email, ADMIN_EMAIL);
    const validPassword = verifyPassword(password, ADMIN_PASSWORD_HASH);

    if (!validEmail || !validPassword) {
        registerFailedLogin(ip);

        return sendJson(res, 401, {
            authenticated: false,
            error: "E-mail ou senha inválidos."
        });
    }

    clearLoginAttempts(ip);

    const { token } = createSession();

    setAdminSessionCookie(
        res,
        token,
        Math.floor(ADMIN_SESSION_TTL_MS / 1000)
    );

    return sendJson(res, 200, {
        authenticated: true
    });
}

function adminMe(req, res) {
    const session = getAdminSession(req);

    return sendJson(res, 200, {
        authenticated: Boolean(session),
        expiresAt: session?.expiresAt || null
    });
}

function adminLogout(req, res) {
    destroyAdminSession(req);
    clearAdminSessionCookie(res);

    return sendJson(res, 200, {
        authenticated: false
    });
}

function requireAdmin(req, res) {
    const session = getAdminSession(req);

    if (!session) {
        sendJson(res, 401, {
            authenticated: false,
            error: "Acesso administrativo não autorizado."
        });
        return false;
    }

    return true;
}

setInterval(() => {
    const now = Date.now();

    for (const [token, session] of adminSessions) {
        if (session.expiresAt <= now) {
            adminSessions.delete(token);
        }
    }

    for (const [ip, entry] of loginAttempts) {
        if (now - entry.startedAt > 15 * 60 * 1000) {
            loginAttempts.delete(ip);
        }
    }
}, 15 * 60 * 1000).unref();


// Dados combinados anteriormente para o teste inicial.
const ORIGIN_CEP = "60720-605";
const PACKAGE = {
    weight: 1,
    height: 10,
    width: 15,
    length: 20
};

function sendJson(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
    });
    res.end(body);
}

function readJson(req, maxBytes = 10000) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", chunk => {
            body += chunk;
            if (body.length > maxBytes) {
                req.destroy();
                reject(new Error("Payload muito grande."));
            }
        });
        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                reject(new Error("JSON inválido."));
            }
        });
        req.on("error", reject);
    });
}

function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
}

function findArray(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.services)) return data.services;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.quotes)) return data.quotes;
    return [];
}

function normalizeService(service) {
    const rawCode = service?.id ?? service?.code ?? service?.service_code ?? service?.serviceCode;
    const code = String(rawCode ?? "");

    const priceCandidates = [
        service?.price,
        service?.custom_price,
        service?.customPrice,
        service?.discounted_price,
        service?.final_price
    ];
    let price = priceCandidates.find(value => Number.isFinite(Number(value)));
    price = Number(price ?? 0);

    // Alguns retornos usam valores em centavos. A API da SuperFrete normalmente
    // devolve preço em reais; esta regra apenas evita um resultado obviamente inválido.
    if (price > 10000) price = price / 100;

    const name = String(
        service?.name ??
        service?.service_name ??
        service?.serviceName ??
        (code === "1" ? "PAC" : code === "2" ? "SEDEX" : "Serviço")
    );

    const deliveryValue =
        service?.delivery_time ??
        service?.deliveryTime ??
        service?.deadline ??
        service?.delivery_range ??
        service?.deliveryRange;

    let deliveryTime = "";
    if (deliveryValue !== undefined && deliveryValue !== null && deliveryValue !== "") {
        deliveryTime = typeof deliveryValue === "number"
            ? `${deliveryValue} dias úteis`
            : String(deliveryValue);
    }

    return {
        code,
        name,
        price: Number(price.toFixed(2)),
        deliveryTime
    };
}


function ensureOrdersFile() {
    if (!fs.existsSync(ORDERS_DIR)) fs.mkdirSync(ORDERS_DIR, { recursive: true });
    if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]", "utf8");
}

function readOrdersFile() {
    ensureOrdersFile();
    try {
        const parsed = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Erro ao ler pedidos:", error);
        throw new Error("Não foi possível ler os pedidos.");
    }
}

function writeOrdersFile(orders) {
    ensureOrdersFile();
    const temp = `${ORDERS_FILE}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(orders, null, 2), "utf8");
    fs.renameSync(temp, ORDERS_FILE);
}

function upsertPendingOrder(payload) {
    const orderNsu = String(payload?.order_nsu || "").trim();
    if (!orderNsu) return null;

    const orders = readOrdersFile();
    const existingIndex = orders.findIndex(order => order.order_nsu === orderNsu);
    const total = Array.isArray(payload.items)
        ? payload.items.reduce((sum, item) => sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 0), 0)
        : 0;

    const internal = payload.store_order && typeof payload.store_order === "object"
        ? payload.store_order
        : {};

    const order = {
        order_nsu: orderNsu,
        status: existingIndex >= 0 ? orders[existingIndex].status : "aguardando_pagamento",
        amount: total,
        items: Array.isArray(payload.items) ? payload.items.map(item => ({
            quantity: Number(item?.quantity) || 0,
            price: Number(item?.price) || 0,
            description: String(item?.description || "")
        })) : [],
        store_items: Array.isArray(internal.items) ? internal.items : [],
        customer: payload.customer || null,
        address: internal.address || payload.address || null,
        delivery: internal.delivery || null,
        freight: internal.freight || null,
        createdAt: existingIndex >= 0 ? orders[existingIndex].createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) orders[existingIndex] = { ...orders[existingIndex], ...order };
    else orders.push(order);
    writeOrdersFile(orders);
    return order;
}

function updateOrderPaid(data) {
    const orderNsu = String(data?.order_nsu || "").trim();
    if (!orderNsu) return null;
    const orders = readOrdersFile();
    const index = orders.findIndex(order => order.order_nsu === orderNsu);
    if (index < 0) return null;

    orders[index] = {
        ...orders[index],
        status: data.paid === false ? "aguardando_pagamento" : "pago",
        transaction_nsu: String(data.transaction_nsu || orders[index].transaction_nsu || ""),
        invoice_slug: String(data.slug || data.invoice_slug || orders[index].invoice_slug || ""),
        receipt_url: String(data.receipt_url || orders[index].receipt_url || ""),
        capture_method: String(data.capture_method || orders[index].capture_method || ""),
        paid_amount: Number(data.paid_amount || orders[index].paid_amount || 0),
        paidAt: data.paid === false ? orders[index].paidAt || null : (orders[index].paidAt || new Date().toISOString()),
        updatedAt: new Date().toISOString()
    };
    writeOrdersFile(orders);
    return orders[index];
}

async function createInfinitePayCheckout(req, res) {
    let payload;
    try { payload = await readJson(req, 50000); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }

    if (!payload?.handle || !Array.isArray(payload.items) || !payload.items.length || !payload.order_nsu) {
        return sendJson(res, 400, { error: "Dados do checkout da InfinitePay incompletos." });
    }

    // Guarda o pedido antes de enviar ao gateway. store_order é interno e não é enviado à InfinitePay.
    upsertPendingOrder(payload);

    const gatewayPayload = { ...payload };
    delete gatewayPayload.store_order;
    if (INFINITEPAY_WEBHOOK_URL) gatewayPayload.webhook_url = INFINITEPAY_WEBHOOK_URL;

    try {
        const response = await fetch(INFINITEPAY_CHECKOUT_API_URL, {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "DropsDeLuxo/1.0"
            },
            body: JSON.stringify(gatewayPayload)
        });
        const text = await response.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

        if (!response.ok) {
            console.error("InfinitePay HTTP", response.status, data);
            return sendJson(res, response.status >= 400 && response.status < 500 ? response.status : 502, {
                error: data?.message || data?.error || "A InfinitePay não conseguiu gerar o checkout.",
                infinitepayStatus: response.status
            });
        }
        return sendJson(res, 200, data);
    } catch (error) {
        console.error("Erro ao conectar com a InfinitePay:", error);
        return sendJson(res, 502, { error: "Não foi possível conectar com a InfinitePay.", detail: error.message });
    }
}

async function checkInfinitePayPayment(req, res) {
    let payload;
    try { payload = await readJson(req, 20000); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }

    const body = {
        handle: String(payload?.handle || ""),
        order_nsu: String(payload?.order_nsu || ""),
        transaction_nsu: String(payload?.transaction_nsu || ""),
        slug: String(payload?.slug || "")
    };

    if (!body.handle || !body.order_nsu || !body.transaction_nsu || !body.slug) {
        return sendJson(res, 400, { error: "Dados insuficientes para verificar o pagamento." });
    }

    try {
        const response = await fetch(INFINITEPAY_PAYMENT_CHECK_URL, {
            method: "POST",
            headers: { "Accept": "application/json", "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const text = await response.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
        if (!response.ok) return sendJson(res, 502, { error: "A InfinitePay não confirmou o pagamento.", infinitepayStatus: response.status });
        if (data?.paid) updateOrderPaid({ ...data, ...body, slug: body.slug });
        return sendJson(res, 200, data);
    } catch (error) {
        console.error("Erro no payment_check da InfinitePay:", error);
        return sendJson(res, 502, { error: "Não foi possível consultar o pagamento na InfinitePay." });
    }
}

async function infinitePayWebhook(req, res) {
    let payload;
    try { payload = await readJson(req, 50000); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }

    if (!payload?.order_nsu) return sendJson(res, 400, { error: "order_nsu ausente." });

    try {
        const order = updateOrderPaid({ ...payload, paid: true });
        if (!order) return sendJson(res, 400, { error: "Pedido não encontrado para este order_nsu." });
        return sendJson(res, 200, { ok: true });
    } catch (error) {
        console.error("Erro ao processar webhook InfinitePay:", error);
        return sendJson(res, 500, { error: "Não foi possível processar o webhook." });
    }
}

function getOrder(req, res, orderNsu) {
    try {
        const order = readOrdersFile().find(item => item.order_nsu === String(orderNsu || ""));
        if (!order) return sendJson(res, 404, { error: "Pedido não encontrado." });
        return sendJson(res, 200, { order });
    } catch (error) {
        return sendJson(res, 500, { error: error.message });
    }
}

async function calculateFreight(req, res) {
    if (!SUPERFRETE_TOKEN) {
        return sendJson(res, 500, {
            error: "SUPERFRETE_TOKEN não configurado no servidor."
        });
    }

    let payload;
    try {
        payload = await readJson(req);
    } catch (error) {
        return sendJson(res, 400, { error: error.message });
    }

    const to = onlyDigits(payload.to);
    if (to.length !== 8) {
        return sendJson(res, 400, {
            error: "Informe um CEP de destino válido."
        });
    }

    const apiPayload = {
        from: {
            postal_code: ORIGIN_CEP
        },
        to: {
            postal_code: to
        },
        // Somente PAC (1) e SEDEX (2).
        services: "1,2",
        options: {
            own_hand: false,
            receipt: false,
            insurance_value: 0,
            use_insurance_value: false
        },
        package: PACKAGE
    };

    try {
        const response = await fetch(SUPERFRETE_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${SUPERFRETE_TOKEN}`,
                "User-Agent": SUPERFRETE_USER_AGENT,
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(apiPayload)
        });

        const text = await response.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { raw: text };
        }

        if (!response.ok) {
            console.error("SuperFrete HTTP", response.status, data);
            return sendJson(res, response.status === 401 ? 502 : 502, {
                error: response.status === 401
                    ? "A SuperFrete recusou o token configurado no servidor. Verifique se ele pertence ao ambiente de produção."
                    : "A SuperFrete não conseguiu calcular o frete.",
                superfreteStatus: response.status
            });
        }

        const services = findArray(data)
            .map(normalizeService)
            .filter(item => item.code === "1" || item.code === "2")
            .filter(item => item.price >= 0);

        return sendJson(res, 200, {
            origin: ORIGIN_CEP,
            destination: to,
            options: services
        });

    } catch (error) {
        console.error(error);
        return sendJson(res, 502, {
            error: "Não foi possível conectar à SuperFrete."
        });
    }
}


/* =========================================================
   PRODUTOS — ETAPA 3
   Catálogo persistido no servidor.
   Alterações administrativas exigem sessão válida.
   ========================================================= */

const DATA_DIR = path.join(ROOT, "data");
const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");

const SEED_PRODUCTS = [
    { id:"p1", name:"Ouro Noir", category:"brand-masc", price:189.90, desc:"Amadeirado especiado, alta fixação.", stock:12 },
    { id:"p2", name:"Vetiver Real", category:"brand-masc", price:169.90, desc:"Fresco e sofisticado para o dia a dia.", stock:8 },
    { id:"p3", name:"Rosa Imperial", category:"brand-fem", price:179.90, desc:"Floral intenso com toque adocicado.", stock:10 },
    { id:"p4", name:"Jasmim Dourado", category:"brand-fem", price:199.90, desc:"Floral branco envolvente.", stock:6 },
    { id:"p5", name:"Âmbar do Deserto", category:"arabe-masc", price:149.90, desc:"Âmbar e oud, marcante e duradouro.", stock:15 },
    { id:"p6", name:"Sultão Al Rayhan", category:"arabe-masc", price:159.90, desc:"Especiarias orientais e almíscar.", stock:9 },
    { id:"p7", name:"Rosa do Oriente", category:"arabe-fem", price:154.90, desc:"Rosa árabe com fundo amadeirado.", stock:11 },
    { id:"p8", name:"Noor Al Layl", category:"arabe-fem", price:164.90, desc:"Floral noturno, doce e sedutor.", stock:7 },
    { id:"p9", name:"Terracota Splash", category:"body-splash", price:59.90, desc:"Hidratante perfumado, toque leve.", stock:20 },
    { id:"p10", name:"Areia Dourada Splash", category:"body-splash", price:59.90, desc:"Frescor cítrico e amadeirado.", stock:18 },
    { id:"p11", name:"Coleção Rota da Seda", category:"arabic-collection", price:219.90, desc:"Kit com 3 essências árabes exclusivas.", stock:5 },
    { id:"p12", name:"Coleção Oásis", category:"arabic-collection", price:229.90, desc:"Seleção de perfumes amadeirados.", stock:4 }
];

function ensureCatalogFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(CATALOG_FILE)) {
        fs.writeFileSync(
            CATALOG_FILE,
            JSON.stringify(SEED_PRODUCTS, null, 2),
            "utf8"
        );
    }
}

function readCatalogFile() {
    ensureCatalogFile();

    try {
        const parsed =
            JSON.parse(
                fs.readFileSync(CATALOG_FILE, "utf8")
            );

        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Erro ao ler catálogo:", error);
        throw new Error("Não foi possível ler o catálogo.");
    }
}

function writeCatalogFile(products) {
    ensureCatalogFile();

    const tempFile =
        `${CATALOG_FILE}.${process.pid}.${Date.now()}.tmp`;

    fs.writeFileSync(
        tempFile,
        JSON.stringify(products, null, 2),
        "utf8"
    );

    fs.renameSync(tempFile, CATALOG_FILE);
}

const ALLOWED_CATEGORIES = new Set([
    "brand-masc",
    "brand-fem",
    "arabe-masc",
    "arabe-fem",
    "body-splash",
    "arabic-collection",
    "kits",
    "outlet"
]);

const ALLOWED_GENDERS = new Set([
    "feminino",
    "masculino",
    "unissex"
]);

function normalizeProduct(input, existingId = null) {
    const name = String(input?.name || "").trim();
    const brand = String(input?.brand || "").trim();
    const category = String(input?.category || "").trim();
    const gender = String(input?.gender || "").trim();
    const volume = Number(input?.volume || 0);
    const price = Number(input?.price);
    const originalPrice = Number(input?.originalPrice || 0);
    const stock = Number(input?.stock || 0);
    const desc = String(input?.desc || "").trim();
    const image = String(input?.image || "");
    const isLaunch = Boolean(input?.isLaunch);
    const isFeatured = Boolean(input?.isFeatured);

    if (!name || !ALLOWED_CATEGORIES.has(category)) {
        throw new Error("Nome e categoria são obrigatórios e válidos.");
    }

    if (gender && !ALLOWED_GENDERS.has(gender)) {
        throw new Error("Gênero inválido.");
    }

    if (!Number.isFinite(price) || price < 0) {
        throw new Error("Preço de venda inválido.");
    }

    if (!Number.isFinite(volume) || volume < 0 || !Number.isInteger(volume)) {
        throw new Error("Volume inválido.");
    }

    if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) {
        throw new Error("Estoque inválido.");
    }

    if (
        !Number.isFinite(originalPrice) ||
        originalPrice < 0 ||
        (originalPrice > 0 && originalPrice < price)
    ) {
        throw new Error("Preço original inválido.");
    }

    if (image.length > 7_000_000) {
        throw new Error("A imagem é muito grande. Use uma imagem mais leve.");
    }

    return {
        id: existingId ||
            `p${Date.now()}${crypto.randomBytes(3).toString("hex")}`,
        name,
        brand,
        category,
        gender,
        volume,
        price: Number(price.toFixed(2)),
        originalPrice: originalPrice
            ? Number(originalPrice.toFixed(2))
            : 0,
        stock,
        desc,
        isLaunch,
        isFeatured,
        image
    };
}

function productsPublic(req, res) {
    try {
        return sendJson(res, 200, {
            source: "server",
            products: readCatalogFile()
        });
    } catch (error) {
        return sendJson(res, 500, {
            error: error.message
        });
    }
}

function adminProductsList(req, res) {
    if (!requireAdmin(req, res)) return;

    try {
        return sendJson(res, 200, {
            products: readCatalogFile()
        });
    } catch (error) {
        return sendJson(res, 500, {
            error: error.message
        });
    }
}

async function adminProductCreate(req, res) {
    if (!requireAdmin(req, res)) return;

    let payload;

    try {
        payload = await readJson(req, 8 * 1024 * 1024);
    } catch (error) {
        return sendJson(res, 400, {
            error: error.message
        });
    }

    try {
        const products = readCatalogFile();
        const product = normalizeProduct(payload);

        products.push(product);
        writeCatalogFile(products);

        return sendJson(res, 201, {
            ok: true,
            product
        });
    } catch (error) {
        return sendJson(res, 400, {
            error: error.message
        });
    }
}

function adminProductDelete(req, res, id) {
    if (!requireAdmin(req, res)) return;

    const productId =
        decodeURIComponent(String(id || ""));

    try {
        const products = readCatalogFile();
        const product =
            products.find(
                item => item.id === productId
            );

        if (!product) {
            return sendJson(res, 404, {
                error: "Produto não encontrado."
            });
        }

        writeCatalogFile(
            products.filter(
                item => item.id !== productId
            )
        );

        return sendJson(res, 200, {
            ok: true,
            removedId: productId
        });
    } catch (error) {
        return sendJson(res, 500, {
            error: error.message
        });
    }
}

async function adminCatalogImport(req, res) {
    if (!requireAdmin(req, res)) return;

    let payload;

    try {
        payload = await readJson(req, 8 * 1024 * 1024);
    } catch (error) {
        return sendJson(res, 400, {
            error: error.message
        });
    }

    if (!Array.isArray(payload?.products)) {
        return sendJson(res, 400, {
            error: "Envie um catálogo válido."
        });
    }

    try {
        const products =
            payload.products.map(item =>
                normalizeProduct(
                    item,
                    String(
                        item?.id ||
                        `p${Date.now()}${crypto.randomBytes(3).toString("hex")}`
                    )
                )
            );

        const unique = [];
        const ids = new Set();

        for (const product of products) {
            if (ids.has(product.id)) continue;
            ids.add(product.id);
            unique.push(product);
        }

        writeCatalogFile(unique);

        return sendJson(res, 200, {
            ok: true,
            imported: unique.length
        });
    } catch (error) {
        return sendJson(res, 400, {
            error: error.message
        });
    }
}

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".json": "application/json; charset=utf-8"
};

function serveStatic(req, res) {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname);
    } catch {
        res.writeHead(400);
        return res.end("URL inválida");
    }

    if (pathname === "/") pathname = "/index.html";
    if (pathname === "/admin" || pathname === "/admin/") {
        res.writeHead(302, { "Location": "/admin/index.html" });
        return res.end();
    }

    const filePath = path.resolve(ROOT, `.${pathname}`);
    if (!filePath.startsWith(path.resolve(ROOT) + path.sep)) {
        res.writeHead(403);
        return res.end("Forbidden");
    }

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            return res.end("Arquivo não encontrado");
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            "Content-Type": MIME[ext] || "application/octet-stream",
            "Cache-Control": "no-cache"
        });
        fs.createReadStream(filePath).pipe(res);
    });
}

const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        });
        return res.end();
    }

    const pathname = req.url.split("?")[0];

    if (req.method === "POST" && pathname === "/api/infinitepay/checkout/links") {
        return createInfinitePayCheckout(req, res);
    }

    if (req.method === "POST" && pathname === "/api/infinitepay/payment-check") {
        return checkInfinitePayPayment(req, res);
    }

    if (req.method === "POST" && pathname === "/api/infinitepay/webhook") {
        return infinitePayWebhook(req, res);
    }

    if (req.method === "GET" && pathname.startsWith("/api/orders/")) {
        return getOrder(req, res, pathname.slice("/api/orders/".length));
    }

    if (req.method === "POST" && pathname === "/api/freight") {
        return calculateFreight(req, res);
    }

    if (req.method === "POST" && pathname === "/api/admin/login") {
        return adminLogin(req, res);
    }

    if (req.method === "GET" && pathname === "/api/admin/me") {
        return adminMe(req, res);
    }

    if (req.method === "POST" && pathname === "/api/admin/logout") {
        return adminLogout(req, res);
    }

    if (req.method === "POST" && pathname === "/api/customer/register") {
        return customerRegister(req, res);
    }

    if (req.method === "POST" && pathname === "/api/customer/login") {
        return customerLogin(req, res);
    }

    if (req.method === "POST" && pathname === "/api/customer/profile") {
        return customerUpdateProfile(req, res);
    }

    if (req.method === "GET" && pathname === "/api/customer/me") {
        return customerMe(req, res);
    }

    if (req.method === "POST" && pathname === "/api/customer/logout") {
        return customerLogout(req, res);
    }

    if (req.method === "GET" && pathname === "/api/products") {
        return productsPublic(req, res);
    }

    if (req.method === "GET" && pathname === "/api/admin/products") {
        return adminProductsList(req, res);
    }

    if (req.method === "POST" && pathname === "/api/admin/products") {
        return adminProductCreate(req, res);
    }

    if (
        req.method === "DELETE" &&
        pathname.startsWith("/api/admin/products/")
    ) {
        const id =
            pathname.slice("/api/admin/products/".length);

        return adminProductDelete(req, res, id);
    }

    if (
        req.method === "POST" &&
        pathname === "/api/admin/catalog/import"
    ) {
        return adminCatalogImport(req, res);
    }

    /*
       Futuras rotas de gerenciamento da loja deverão passar por
       requireAdmin(req, res) antes de alterar produtos, banners,
       pedidos, clientes ou configurações.
    */

    if (req.method === "GET" && pathname === "/api/health") {
        return sendJson(res, 200, {
            ok: true,
            superfreteConfigured: Boolean(SUPERFRETE_TOKEN),
            adminConfigured: Boolean(ADMIN_EMAIL && ADMIN_PASSWORD_HASH),
            customerStoreReady: true,
            infinitePayWebhookConfigured: Boolean(INFINITEPAY_WEBHOOK_URL)
        });
    }

    if (req.method === "GET") return serveStatic(req, res);

    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Método não permitido");
});

server.listen(PORT, HOST, () => {
    console.log(`Drops de Luxo rodando em http://${HOST}:${PORT}`);
    console.log(`SuperFrete: ${SUPERFRETE_API_URL}`);
    console.log(`Token configurado: ${SUPERFRETE_TOKEN ? "SIM" : "NÃO"}`);
});
