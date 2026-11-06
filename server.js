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
const HOST = process.env.HOST || "0.0.0.0";

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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

/*
 * ARMAZENAMENTO PERSISTENTE
 * Em hospedagens como Render, configure DATA_DIR=/var/data e monte o disco
 * nesse mesmo caminho. Na primeira inicialização, os arquivos existentes em
 * ./data são copiados para o disco, sem sobrescrever nenhum arquivo já salvo.
 * Em desenvolvimento local, o padrão continua sendo ./data.
 */
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, "data");
const SOURCE_DATA_DIR = path.join(ROOT, "data");

function migrateInitialDataToPersistentStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (
    path.resolve(DATA_DIR) === path.resolve(SOURCE_DATA_DIR) ||
    !fs.existsSync(SOURCE_DATA_DIR)
  ) {
    return;
  }

  const entries = fs.readdirSync(SOURCE_DATA_DIR, { withFileTypes: true });
  let copied = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const sourceFile = path.join(SOURCE_DATA_DIR, entry.name);
    const destinationFile = path.join(DATA_DIR, entry.name);

    // Nunca substitui dados que já estejam no disco persistente.
    if (!fs.existsSync(destinationFile)) {
      fs.copyFileSync(sourceFile, destinationFile);
      copied += 1;
    }
  }

  console.log(
    `Armazenamento persistente: ${DATA_DIR} (${copied} arquivo(s) inicial(is) copiado(s)).`,
  );
}

migrateInitialDataToPersistentStorage();

const SUPERFRETE_TOKEN = process.env.SUPERFRETE_TOKEN || "";
const SUPERFRETE_API_URL =
  process.env.SUPERFRETE_API_URL ||
  "https://api.superfrete.com/api/v0/calculator";
const SUPERFRETE_CART_API_URL =
  process.env.SUPERFRETE_CART_API_URL ||
  "https://api.superfrete.com/api/v0/cart";
const SUPERFRETE_USER_AGENT =
  process.env.SUPERFRETE_USER_AGENT || "DropsDeLuxo/1.0";

// Dados do remetente usados na criação da etiqueta.
// O CEP de origem é fixo no projeto; os demais dados devem vir do .env.
const SUPERFRETE_FROM = {
  name: String(process.env.SUPERFRETE_FROM_NAME || "Drops de Luxo").trim(),
  address: String(
    process.env.SUPERFRETE_FROM_ADDRESS || "Av. Augusto dos Anjos",
  ).trim(),
  number: String(process.env.SUPERFRETE_FROM_NUMBER || "1127").trim(),
  complement: String(
    process.env.SUPERFRETE_FROM_COMPLEMENT || "Sala 11",
  ).trim(),
  district: String(process.env.SUPERFRETE_FROM_DISTRICT || "Parangaba").trim(),
  city: String(process.env.SUPERFRETE_FROM_CITY || "Fortaleza").trim(),
  state_abbr: String(process.env.SUPERFRETE_FROM_STATE || "CE")
    .trim()
    .toUpperCase(),
  email: String(process.env.SUPERFRETE_FROM_EMAIL || "").trim(),
  document: String(process.env.SUPERFRETE_FROM_DOCUMENT || "").trim(),
  country_id: "BR",
  postal_code: "60720605",
};

/* =========================================================
   INFINITEPAY — CHECKOUT E CONFIRMAÇÃO
   A criação do checkout passa pelo backend para evitar CORS.
   A webhook pública será usada quando o site estiver online.
   ========================================================= */
const INFINITEPAY_CHECKOUT_API_URL =
  "https://api.checkout.infinitepay.io/links";
const INFINITEPAY_PAYMENT_CHECK_URL =
  "https://api.checkout.infinitepay.io/payment_check";
const INFINITEPAY_WEBHOOK_URL = String(
  process.env.INFINITEPAY_WEBHOOK_URL || "",
).trim();
// A conta aceita pelo backend deve ser a mesma usada no checkout do navegador.
const INFINITEPAY_HANDLE = String(
  process.env.INFINITEPAY_HANDLE || "$luciene-lucas-3s1",
).trim();
const INFINITEPAY_API_KEY = String(
  process.env.INFINITEPAY_API_KEY || "",
).trim();
const ORDERS_DIR = DATA_DIR;
const ORDERS_FILE = path.join(ORDERS_DIR, "orders.json");
const FREIGHT_QUOTES_FILE = path.join(ORDERS_DIR, "freight-quotes.json");
const FREIGHT_QUOTE_TTL_MS = 15 * 60 * 1000;

/* =========================================================
   AUTENTICAÇÃO — ÁREA ADMINISTRATIVA
   A senha nunca fica no HTML/JS.
   Configure ADMIN_EMAIL e ADMIN_PASSWORD_HASH no .env.
   ========================================================= */

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "")
  .trim()
  .toLowerCase();
const ADMIN_PASSWORD_HASH = String(
  process.env.ADMIN_PASSWORD_HASH || "",
).trim();
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
const CUSTOMER_DATA_DIR = DATA_DIR;
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
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeCustomerPhone(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 13);
}

function hashCustomerPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const N = 16384;
  const r = 8;
  const p = 1;
  const keyLength = 64;

  const derived = crypto.scryptSync(password, salt, keyLength, {
    N,
    r,
    p,
    maxmem: 32 * 1024 * 1024,
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
    document: customer.document || "",
    address: customer.address || null,
    createdAt: customer.createdAt,
  };
}

function normalizeCustomerDocument(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 14);
}

function validateCustomerDocument(value) {
  const document = normalizeCustomerDocument(value);
  if (![11, 14].includes(document.length)) {
    throw new Error("Informe um CPF ou CNPJ válido com 11 ou 14 números.");
  }
  return document;
}

function validateCustomerAddress(payload) {
  const cep = onlyDigits(payload?.cep).slice(0, 8);
  const street = String(payload?.street || "")
    .trim()
    .replace(/\s+/g, " ");
  const number = String(payload?.number || "")
    .trim()
    .replace(/\s+/g, " ");
  const complement = String(payload?.complement || "")
    .trim()
    .replace(/\s+/g, " ");
  const neighborhood = String(payload?.neighborhood || "")
    .trim()
    .replace(/\s+/g, " ");
  const city = String(payload?.city || "")
    .trim()
    .replace(/\s+/g, " ");
  const state = String(payload?.state || "")
    .trim()
    .toUpperCase();

  if (cep.length !== 8) throw new Error("Informe um CEP válido com 8 números.");
  if (street.length < 2 || street.length > 180)
    throw new Error("Informe a rua/avenida.");
  if (number.length < 1 || number.length > 20)
    throw new Error("Informe o número.");
  if (complement.length > 100) throw new Error("Complemento muito longo.");
  if (neighborhood.length < 2 || neighborhood.length > 100)
    throw new Error("Informe o bairro.");
  if (city.length < 2 || city.length > 100)
    throw new Error("Informe a cidade.");
  if (!/^[A-Z]{2}$/.test(state))
    throw new Error("Informe o estado com 2 letras.");

  return { cep, street, number, complement, neighborhood, city, state };
}

async function customerUpdateProfile(req, res) {
  const session = getCustomerSession(req);
  if (!session) {
    return sendJson(res, 401, {
      authenticated: false,
      error: "Entre na sua conta para alterar seus dados.",
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
    const index = customers.findIndex(
      (customer) => customer.id === session.customerId,
    );

    if (index === -1) {
      customerSessions.delete(session.token);
      clearCustomerSessionCookie(res);
      return sendJson(res, 401, {
        authenticated: false,
        error: "Conta do cliente não encontrada.",
      });
    }

    const document = payload?.document
      ? validateCustomerDocument(payload.document)
      : normalizeCustomerDocument(customers[index].document);

    customers[index].address = address;
    if (document) customers[index].document = document;
    customers[index].updatedAt = new Date().toISOString();
    writeCustomersFile(customers);

    return sendJson(res, 200, {
      authenticated: true,
      customer: sanitizeCustomer(customers[index]),
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

  res.setHeader(
    "Set-Cookie",
    `${CUSTOMER_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`,
  );
}

function clearCustomerSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${CUSTOMER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
  );
}

function getCustomerById(id) {
  return readCustomersFile().find((customer) => customer.id === id) || null;
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
  const name = String(payload?.name || "")
    .trim()
    .replace(/\s+/g, " ");
  const email = normalizeCustomerEmail(payload?.email);
  const phone = normalizeCustomerPhone(payload?.phone);
  const document = validateCustomerDocument(payload?.document);
  const password = String(payload?.password || "");

  if (name.length < 3 || name.length > 120)
    throw new Error("Informe seu nome completo.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180)
    throw new Error("Informe um e-mail válido.");
  if (phone.length < 10 || phone.length > 13)
    throw new Error("Informe um telefone válido com DDD.");
  if (password.length < 8 || password.length > 128)
    throw new Error("A senha deve ter entre 8 e 128 caracteres.");

  return { name, email, phone, document, password };
}

async function customerRegister(req, res) {
  let payload;
  try {
    payload = await readJson(req, 20000);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  try {
    const data = validateCustomerRegistration(payload);
    const customers = readCustomersFile();

    if (customers.some((customer) => customer.email === data.email)) {
      return sendJson(res, 409, {
        error: "Já existe uma conta cadastrada com este e-mail.",
      });
    }

    const customer = {
      id: `c${Date.now()}${crypto.randomBytes(4).toString("hex")}`,
      name: data.name,
      email: data.email,
      phone: data.phone,
      document: data.document,
      passwordHash: hashCustomerPassword(data.password),
      createdAt: new Date().toISOString(),
    };

    customers.push(customer);
    writeCustomersFile(customers);

    const { token, expiresAt } = createCustomerSession(customer.id);
    setCustomerSessionCookie(
      res,
      token,
      Math.floor(CUSTOMER_SESSION_TTL_MS / 1000),
    );

    return sendJson(res, 201, {
      authenticated: true,
      customer: sanitizeCustomer(customer),
      expiresAt,
    });
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
}

async function customerLogin(req, res) {
  const ip = getClientIp(req);
  if (!canAttemptCustomerLogin(ip)) {
    return sendJson(res, 429, {
      error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    });
  }

  let payload;
  try {
    payload = await readJson(req, 20000);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const email = normalizeCustomerEmail(payload?.email);
  const password = String(payload?.password || "");
  const customer = readCustomersFile().find((item) => item.email === email);
  const validPassword = customer
    ? verifyPassword(password, customer.passwordHash)
    : false;

  if (!customer || !validPassword) {
    registerFailedCustomerLogin(ip);
    return sendJson(res, 401, {
      authenticated: false,
      error: "E-mail ou senha inválidos.",
    });
  }

  clearCustomerLoginAttempts(ip);
  const { token, expiresAt } = createCustomerSession(customer.id);
  setCustomerSessionCookie(
    res,
    token,
    Math.floor(CUSTOMER_SESSION_TTL_MS / 1000),
  );

  return sendJson(res, 200, {
    authenticated: true,
    customer: sanitizeCustomer(customer),
    expiresAt,
  });
}

function customerMe(req, res) {
  const session = getCustomerSession(req);
  if (!session)
    return sendJson(res, 200, {
      authenticated: false,
      customer: null,
      expiresAt: null,
    });

  const customer = getCustomerById(session.customerId);
  if (!customer) {
    customerSessions.delete(session.token);
    clearCustomerSessionCookie(res);
    return sendJson(res, 200, {
      authenticated: false,
      customer: null,
      expiresAt: null,
    });
  }

  return sendJson(res, 200, {
    authenticated: true,
    customer: sanitizeCustomer(customer),
    expiresAt: session.expiresAt,
  });
}

function customerLogout(req, res) {
  const session = getCustomerSession(req);
  if (session) customerSessions.delete(session.token);
  clearCustomerSessionCookie(res);
  return sendJson(res, 200, { authenticated: false, customer: null });
}

setInterval(
  () => {
    const now = Date.now();
    for (const [token, session] of customerSessions) {
      if (session.expiresAt <= now) customerSessions.delete(token);
    }
    for (const [ip, entry] of customerLoginAttempts) {
      if (now - entry.startedAt > 15 * 60 * 1000)
        customerLoginAttempts.delete(ip);
    }
  },
  15 * 60 * 1000,
).unref();

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (key) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        /* Ignora cookies malformados sem derrubar a requisição. */
      }
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
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`,
  );
}

function clearAdminSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
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
      p,
    });

    return safeEqual(derived.toString("hex"), expectedHex.toLowerCase());
  } catch {
    return false;
  }
}

function getClientIp(req) {
  // Não confiar em X-Forwarded-For enviado pelo cliente: sem proxy confiável
  // configurado, esse cabeçalho pode ser falsificado para contornar rate limits.
  return String(req.socket?.remoteAddress || "unknown").trim();
}

function canAttemptLogin(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 10;

  const entry = loginAttempts.get(ip);

  if (!entry || now - entry.startedAt > windowMs) {
    loginAttempts.set(ip, {
      startedAt: now,
      count: 0,
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
      count: 1,
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
      error: "A autenticação administrativa ainda não foi configurada no .env.",
    });
  }

  if (!canAttemptLogin(ip)) {
    return sendJson(res, 429, {
      error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    });
  }

  let payload;

  try {
    payload = await readJson(req);
  } catch (error) {
    return sendJson(res, 400, {
      error: error.message,
    });
  }

  const email = String(payload?.email || "")
    .trim()
    .toLowerCase();
  const password = String(payload?.password || "");

  const validEmail = safeEqual(email, ADMIN_EMAIL);
  const validPassword = verifyPassword(password, ADMIN_PASSWORD_HASH);


  if (!validEmail || !validPassword) {
    registerFailedLogin(ip);

    return sendJson(res, 401, {
      authenticated: false,
      error: "E-mail ou senha inválidos.",
    });
  }

  clearLoginAttempts(ip);

  const { token } = createSession();

  setAdminSessionCookie(res, token, Math.floor(ADMIN_SESSION_TTL_MS / 1000));

  return sendJson(res, 200, {
    authenticated: true,
  });
}

function adminMe(req, res) {
  const session = getAdminSession(req);

  return sendJson(res, 200, {
    authenticated: Boolean(session),
    expiresAt: session?.expiresAt || null,
  });
}

function adminLogout(req, res) {
  destroyAdminSession(req);
  clearAdminSessionCookie(res);

  return sendJson(res, 200, {
    authenticated: false,
  });
}

function requireAdmin(req, res) {
  const session = getAdminSession(req);

  if (!session) {
    sendJson(res, 401, {
      authenticated: false,
      error: "Acesso administrativo não autorizado.",
    });
    return false;
  }

  return true;
}

setInterval(
  () => {
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
  },
  15 * 60 * 1000,
).unref();

// Dados de embalagem da loja. Peso-base: 200 g por perfume.
const ORIGIN_CEP = "60720-605";
function getSuperfreteVolume(quantity) {
  const count = Math.max(1, Number(quantity) || 1);
  if (count <= 2)
    return {
      height: 11,
      width: 18,
      length: 27,
      weight: Number((count * 0.2).toFixed(2)),
    };
  if (count <= 4)
    return {
      height: 22,
      width: 18,
      length: 27,
      weight: Number((count * 0.2).toFixed(2)),
    };
  if (count <= 6)
    return {
      height: 33,
      width: 18,
      length: 27,
      weight: Number((count * 0.2).toFixed(2)),
    };
  return null;
}

function splitSuperfreteVolumes(items) {
  const units = [];
  for (const item of items) {
    const quantity = Math.max(0, Number(item?.quantity) || 0);
    for (let i = 0; i < quantity; i += 1) {
      units.push({
        name: String(item?.name || item?.description || "Produto"),
        unitary_value: Number(item?.unitPrice ?? item?.price ?? 0) || 0,
      });
    }
  }

  const groups = [];
  for (let i = 0; i < units.length; i += 6) groups.push(units.slice(i, i + 6));
  return groups;
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function readJson(req, maxBytes = 10000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
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
  const rawCode =
    service?.id ??
    service?.code ??
    service?.service_code ??
    service?.serviceCode;
  const code = String(rawCode ?? "");

  const priceCandidates = [
    service?.price,
    service?.custom_price,
    service?.customPrice,
    service?.discounted_price,
    service?.final_price,
  ];
  let price = priceCandidates.find((value) => Number.isFinite(Number(value)));
  price = Number(price ?? 0);

  // Alguns retornos usam valores em centavos. A API da SuperFrete normalmente
  // devolve preço em reais; esta regra apenas evita um resultado obviamente inválido.
  if (price > 10000) price = price / 100;

  const name = String(
    service?.name ??
      service?.service_name ??
      service?.serviceName ??
      (code === "1" ? "PAC" : code === "2" ? "SEDEX" : "Serviço"),
  );

  const deliveryValue =
    service?.delivery_time ??
    service?.deliveryTime ??
    service?.deadline ??
    service?.delivery_range ??
    service?.deliveryRange;

  let deliveryTime = "";
  if (
    deliveryValue !== undefined &&
    deliveryValue !== null &&
    deliveryValue !== ""
  ) {
    deliveryTime =
      typeof deliveryValue === "number"
        ? `${deliveryValue} dias úteis`
        : String(deliveryValue);
  }

  return {
    code,
    name,
    price: Number(price.toFixed(2)),
    deliveryTime,
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
  const existingIndex = orders.findIndex(
    (order) => order.order_nsu === orderNsu,
  );
  // A mesma order_nsu nunca pode substituir um pedido já registrado. Isso evita
  // que uma nova tentativa altere valor, cliente ou itens de um pedido existente.
  if (existingIndex >= 0) {
    throw new Error(
      "Este identificador de pedido já foi utilizado. Gere um novo pedido antes de tentar novamente.",
    );
  }
  const total = Array.isArray(payload.items)
    ? payload.items.reduce(
        (sum, item) =>
          sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 0),
        0,
      )
    : 0;

  const internal =
    payload.store_order && typeof payload.store_order === "object"
      ? payload.store_order
      : {};

  const order = {
    order_nsu: orderNsu,
    // ID imutável da conta autenticada; pedidos de convidados permanecem sem vínculo.
    customer_id: payload.customer_id || null,
    status: "aguardando_pagamento",
    amount: total,
    items: Array.isArray(payload.items)
      ? payload.items.map((item) => ({
          quantity: Number(item?.quantity) || 0,
          price: Number(item?.price) || 0,
          description: String(item?.description || ""),
        }))
      : [],
    store_items: Array.isArray(internal.items) ? internal.items : [],
    customer: payload.customer || null,
    address: internal.address || payload.address || null,
    delivery: internal.delivery || null,
    freight: internal.freight || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  orders.push(order);
  writeOrdersFile(orders);
  return order;
}

function updateOrderPaid(data) {
  const orderNsu = String(data?.order_nsu || "").trim();
  if (!orderNsu) return null;
  const orders = readOrdersFile();
  const index = orders.findIndex((order) => order.order_nsu === orderNsu);
  if (index < 0) return null;
  const existingTransaction = String(orders[index].transaction_nsu || "");
  const incomingTransaction = String(data.transaction_nsu || "");
  // Um pedido pago não pode ser rebaixado nem ter sua transação substituída.
  if (orders[index].paidAt && data.paid === false) return orders[index];
  if (
    existingTransaction &&
    incomingTransaction &&
    existingTransaction !== incomingTransaction
  ) {
    throw new Error("O pedido já está associado a outra transação.");
  }

  const wasAlreadyPaid = Boolean(orders[index].paidAt);
  const currentOrder = orders[index];
  if (data.paid !== false && !wasAlreadyPaid && !currentOrder.stockDeductedAt) {
    const catalog = readCatalogFile();
    const orderItems = Array.isArray(currentOrder.store_items)
      ? currentOrder.store_items
      : [];
    const shortages = [];
    for (const line of orderItems) {
      const productId = String(line?.productId || "");
      const quantity = Number(line?.quantity || 0);
      const product = catalog.find((item) => String(item.id) === productId);
      if (!product || !Number.isInteger(quantity) || quantity < 1) continue;
      const available = Math.max(0, Number(product.stock || 0));
      if (available < quantity) {
        shortages.push({
          productId,
          productName: product.name || "Produto",
          requested: quantity,
          available,
        });
        product.stock = 0;
      } else {
        product.stock = available - quantity;
      }
    }
    if (orderItems.length) writeCatalogFile(catalog);
    orders[index].stockDeductedAt = new Date().toISOString();
    if (shortages.length) orders[index].inventoryIssue = shortages;
  }
  orders[index] = {
    ...orders[index],
    status: data.paid === false ? "aguardando_pagamento" : "pago",
    transaction_nsu: String(
      data.transaction_nsu || orders[index].transaction_nsu || "",
    ),
    invoice_slug: String(
      data.slug || data.invoice_slug || orders[index].invoice_slug || "",
    ),
    receipt_url: String(data.receipt_url || orders[index].receipt_url || ""),
    capture_method: String(
      data.capture_method || orders[index].capture_method || "",
    ),
    paid_amount: Number(
      data.paid_amount ?? data.amount ?? orders[index].paid_amount ?? 0,
    ),
    paidAt:
      data.paid === false
        ? orders[index].paidAt || null
        : orders[index].paidAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeOrdersFile(orders);
  return orders[index];
}

function ensureFreightQuotesFile() {
  if (!fs.existsSync(ORDERS_DIR)) fs.mkdirSync(ORDERS_DIR, { recursive: true });
  if (!fs.existsSync(FREIGHT_QUOTES_FILE))
    fs.writeFileSync(FREIGHT_QUOTES_FILE, "[]", "utf8");
}

function readFreightQuotes() {
  ensureFreightQuotesFile();
  let quotes;
  try {
    quotes = JSON.parse(fs.readFileSync(FREIGHT_QUOTES_FILE, "utf8"));
  } catch (error) {
    console.error("Erro ao ler cotações de frete:", error);
    throw new Error("Não foi possível validar a cotação de frete.");
  }
  if (!Array.isArray(quotes)) throw new Error("Registro de cotações inválido.");
  const now = Date.now();
  const valid = quotes.filter((q) => Number(q.expiresAtMs) > now);
  if (valid.length !== quotes.length) writeFreightQuotes(valid);
  return valid;
}

function writeFreightQuotes(quotes) {
  ensureFreightQuotesFile();
  const temp = `${FREIGHT_QUOTES_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(quotes, null, 2), "utf8");
  fs.renameSync(temp, FREIGHT_QUOTES_FILE);
}

function normalizeQuoteItems(rawItems, catalog) {
  if (!Array.isArray(rawItems) || !rawItems.length)
    throw new Error("Informe os produtos para calcular o frete.");
  const items = [];
  for (const line of rawItems) {
    const productId = String(line?.productId || "").trim();
    const quantity = Number(line?.quantity);
    if (
      !productId ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      throw new Error("Produto ou quantidade inválida para calcular o frete.");
    }
    const product = catalog.find((item) => String(item.id || "") === productId);
    if (!product)
      throw new Error(
        "Um produto do carrinho não está mais disponível. Atualize a página.",
      );
    const variantMl = Number(line?.variantMl || 0) || null;
    if (product.category === "decants" && ![5, 10].includes(variantMl)) {
      throw new Error(
        "Escolha o tamanho do decant (5 ml ou 10 ml) antes de calcular o frete.",
      );
    }
    if (product.category !== "decants" && variantMl) {
      throw new Error("Tamanho inválido para um dos produtos do carrinho.");
    }
    items.push({ productId, variantMl, quantity });
  }
  // Ordenação estável para que a assinatura lógica não dependa da ordem do carrinho.
  items.sort(
    (a, b) =>
      a.productId.localeCompare(b.productId) ||
      Number(a.variantMl || 0) - Number(b.variantMl || 0),
  );
  const merged = [];
  for (const item of items) {
    const existing = merged.find(
      (x) =>
        x.productId === item.productId &&
        Number(x.variantMl || 0) === Number(item.variantMl || 0),
    );
    if (existing) existing.quantity += item.quantity;
    else merged.push({ ...item });
  }
  if (merged.reduce((sum, item) => sum + item.quantity, 0) > 99)
    throw new Error(
      "A quantidade total excede o limite permitido para o frete.",
    );
  return merged;
}

function sameQuoteItems(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every(
      (item, index) =>
        item.productId === b[index].productId &&
        Number(item.variantMl || 0) === Number(b[index].variantMl || 0) &&
        item.quantity === b[index].quantity,
    )
  );
}

function validateCheckoutAgainstCatalog(payload) {
  const storeOrder = payload?.store_order;
  if (
    !storeOrder ||
    !Array.isArray(storeOrder.items) ||
    !storeOrder.items.length
  ) {
    return {
      ok: false,
      error:
        "Não foi possível validar os produtos do pedido. Atualize o carrinho e tente novamente.",
    };
  }

  let catalog;
  try {
    catalog = readCatalogFile();
  } catch {
    return {
      ok: false,
      error: "Não foi possível validar o catálogo neste momento.",
    };
  }

  const normalizedItems = [];
  const gatewayItems = [];
  for (const line of storeOrder.items) {
    const quantity = Number(line?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return { ok: false, error: "Quantidade inválida em um dos produtos." };
    }
    const productId = String(line?.productId || "").trim();
    const lineName = String(line?.name || "").trim();
    const product = catalog.find((item) =>
      productId
        ? String(item.id || "") === productId
        : String(item.name || "")
            .trim()
            .toLowerCase() === lineName.toLowerCase(),
    );
    if (!product)
      return {
        ok: false,
        error: `O produto "${lineName || "selecionado"}" não está mais disponível. Atualize o carrinho.`,
      };
    const variantMl = Number(line?.variantMl || 0) || null;
    if (product.category === "decants" && ![5, 10].includes(variantMl)) {
      return {
        ok: false,
        error: `Escolha o tamanho do decant para ${product.name}.`,
      };
    }
    if (product.category !== "decants" && variantMl) {
      return {
        ok: false,
        error: "Foi informado um tamanho inválido para um produto.",
      };
    }
    if (Number(product.stock || 0) < quantity) {
      return {
        ok: false,
        error: `Estoque insuficiente para ${product.name}. Este item não pode ser comprado na quantidade solicitada.`,
      };
    }
    const unitPrice =
      product.category === "decants"
        ? Number(product.decantPrices?.[String(variantMl)])
        : Number(product.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return {
        ok: false,
        error: "Um produto possui preço inválido no catálogo.",
      };
    }
    const cents = Math.round(unitPrice * 100);
    normalizedItems.push({
      productId: String(product.id || productId),
      name: `${String(product.name || lineName)}${variantMl ? ` (${variantMl} ml)` : ""}`,
      productName: String(product.name || lineName),
      category: String(product.category || line.category || ""),
      variantMl,
      quantity,
      unitPrice,
      total: Number((unitPrice * quantity).toFixed(2)),
    });
    gatewayItems.push({
      quantity,
      price: cents,
      description: String(
        line.description ||
          `${product.name || lineName}${variantMl ? ` (${variantMl} ml)` : ""}`,
      ),
    });
  }

  const freightPrice = Number(storeOrder.freight?.price ?? 0);
  if (
    !Number.isFinite(freightPrice) ||
    freightPrice < 0 ||
    freightPrice > 100000
  ) {
    return {
      ok: false,
      error: "O valor do frete é inválido. Calcule o frete novamente.",
    };
  }
  const selectedService = String(storeOrder.freight?.service || "");
  const quoteId = String(storeOrder.freight?.quoteId || "").trim();
  if (selectedService === "1" || selectedService === "2") {
    if (!quoteId)
      return {
        ok: false,
        error:
          "A cotação do frete expirou ou não foi identificada. Calcule o frete novamente.",
      };
    let quotes;
    try {
      quotes = readFreightQuotes();
    } catch {
      return {
        ok: false,
        error: "Não foi possível validar a cotação. Calcule o frete novamente.",
      };
    }
    const quote = quotes.find((item) => item.id === quoteId);
    const destinationCep = onlyDigits(
      storeOrder.address?.cep || payload.address?.cep || "",
    );
    let quoteItems;
    try {
      quoteItems = normalizeQuoteItems(
        storeOrder.items.map((item) => ({
          productId: item.productId,
          variantMl: item.variantMl,
          quantity: item.quantity,
        })),
        catalog,
      );
    } catch {
      return {
        ok: false,
        error: "Os produtos do pedido mudaram. Calcule o frete novamente.",
      };
    }
    const option = quote?.options?.find(
      (item) => String(item.code) === selectedService,
    );
    if (
      !quote ||
      Number(quote.expiresAtMs) <= Date.now() ||
      quote.destination !== destinationCep ||
      !sameQuoteItems(quote.items, quoteItems) ||
      !option ||
      Math.round(Number(option.price) * 100) !== Math.round(freightPrice * 100)
    ) {
      return {
        ok: false,
        error:
          "A cotação do frete expirou ou não corresponde ao pedido. Calcule o frete novamente.",
      };
    }
  } else if (freightPrice > 0) {
    return {
      ok: false,
      error: "Selecione uma cotação válida de frete antes de pagar.",
    };
  }

  const declaredFreightItems = payload.items.filter((item) =>
    /^frete\b/i.test(String(item?.description || "")),
  );
  const declaredFreightCents = declaredFreightItems.reduce((sum, item) => {
    const q = Number(item?.quantity);
    const price = Number(item?.price);
    if (!Number.isInteger(q) || q < 1 || !Number.isFinite(price) || price < 0)
      return NaN;
    return sum + q * price;
  }, 0);
  const expectedFreightCents = Math.round(freightPrice * 100);
  if (
    !Number.isFinite(declaredFreightCents) ||
    declaredFreightCents !== expectedFreightCents ||
    declaredFreightItems.length > 1
  ) {
    return {
      ok: false,
      error:
        "O frete do checkout não corresponde ao valor registrado. Calcule o frete novamente.",
    };
  }

  const declaredProductItems = payload.items.filter(
    (item) => !/^frete\b/i.test(String(item?.description || "")),
  );
  if (declaredProductItems.length !== normalizedItems.length) {
    return {
      ok: false,
      error:
        "Os produtos do checkout não correspondem ao carrinho. Atualize e tente novamente.",
    };
  }
  const expectedByKey = new Map(
    normalizedItems.map((item) => [
      `${item.productId}|${item.quantity}`,
      Math.round(item.unitPrice * 100),
    ]),
  );
  for (const item of declaredProductItems) {
    const quantity = Number(item?.quantity);
    const price = Number(item?.price);
    const description = String(item?.description || "").trim();
    const match = normalizedItems.find(
      (line) =>
        line.quantity === quantity &&
        (description.toLowerCase() === line.name.toLowerCase() ||
          description.toLowerCase().startsWith(`${line.name.toLowerCase()} (`)),
    );
    if (
      !match ||
      !Number.isInteger(quantity) ||
      !Number.isFinite(price) ||
      price !== Math.round(match.unitPrice * 100)
    ) {
      return {
        ok: false,
        error:
          "O preço ou a quantidade de um produto mudou. Atualize o carrinho antes de pagar.",
      };
    }
  }

  const productSubtotalCents = normalizedItems.reduce(
    (sum, item) => sum + Math.round(item.unitPrice * 100) * item.quantity,
    0,
  );
  const totalCents = productSubtotalCents + expectedFreightCents;
  const internalTotal = Number(storeOrder.total);
  if (
    Number.isFinite(internalTotal) &&
    Math.round(internalTotal * 100) !== totalCents
  ) {
    return {
      ok: false,
      error:
        "O total do pedido não corresponde aos produtos e ao frete. Atualize o carrinho.",
    };
  }

  const authoritativePayload = {
    ...payload,
    items: [
      ...normalizedItems.map((item) => ({
        quantity: item.quantity,
        price: Math.round(item.unitPrice * 100),
        description: item.name,
      })),
      ...(expectedFreightCents > 0
        ? [
            {
              quantity: 1,
              price: expectedFreightCents,
              description: String(
                declaredFreightItems[0]?.description || "Frete",
              ),
            },
          ]
        : []),
    ],
    store_order: {
      ...storeOrder,
      items: normalizedItems,
      subtotal: Number((productSubtotalCents / 100).toFixed(2)),
      total: Number((totalCents / 100).toFixed(2)),
      freight: {
        ...(storeOrder.freight || {}),
        price: Number((expectedFreightCents / 100).toFixed(2)),
      },
    },
  };
  return { ok: true, payload: authoritativePayload };
}

async function createInfinitePayCheckout(req, res) {
  let payload;
  try {
    payload = await readJson(req, 50000);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  if (
    !payload?.handle ||
    !Array.isArray(payload.items) ||
    !payload.items.length ||
    !payload.order_nsu
  ) {
    return sendJson(res, 400, {
      error: "Dados do checkout da InfinitePay incompletos.",
    });
  }
  if (String(payload.handle).trim() !== INFINITEPAY_HANDLE) {
    return sendJson(res, 400, {
      error:
        "A conta InfinitePay do checkout não corresponde à conta configurada na loja.",
    });
  }
  if (!INFINITEPAY_API_KEY) {
    return sendJson(res, 503, {
      error: "A chave da API InfinitePay não está configurada no servidor.",
    });
  }

  // Valida preços/quantidades contra o catálogo oficial antes de registrar o pedido.
  // Os valores enviados pelo navegador nunca são tratados como fonte de verdade.
  const validation = validateCheckoutAgainstCatalog(payload);
  if (!validation.ok) return sendJson(res, 400, { error: validation.error });
  payload = validation.payload;

  // A identidade do comprador vem exclusivamente da sessão HttpOnly do servidor.
  // Nunca associar uma conta com base em customer enviado pelo navegador.
  const customerSession = getCustomerSession(req);
  if (customerSession) {
    const authenticatedCustomer = getCustomerById(customerSession.customerId);
    if (!authenticatedCustomer) {
      customerSessions.delete(customerSession.token);
      clearCustomerSessionCookie(res);
      return sendJson(res, 401, {
        authenticated: false,
        error: "Sua sessão de cliente expirou. Entre novamente para continuar.",
      });
    }
    payload.customer_id = authenticatedCustomer.id;
    payload.customer = sanitizeCustomer(authenticatedCustomer);
    // Mantém no registro os dados de cadastro verificados no servidor.
    if (payload.store_order && typeof payload.store_order === "object") {
      payload.store_order.customer_id = authenticatedCustomer.id;
    }
  } else {
    // Compra como convidado: não aceitar vínculo arbitrário enviado pelo browser.
    payload.customer_id = null;
    payload.customer = null;
    if (payload.store_order && typeof payload.store_order === "object") {
      delete payload.store_order.customer_id;
    }
  }

  // Impede reutilização de order_nsu: evita sobrescrita e checkout duplicado para
  // o mesmo identificador. O cliente deve gerar um novo identificador para novo pedido.
  try {
    if (
      readOrdersFile().some(
        (order) => order.order_nsu === String(payload.order_nsu).trim(),
      )
    ) {
      return sendJson(res, 409, {
        error:
          "Este pedido já foi registrado. Atualize o carrinho para iniciar um novo pedido.",
      });
    }
    upsertPendingOrder(payload);
  } catch (error) {
    console.error("Não foi possível registrar o pedido:", error);
    return sendJson(res, 409, {
      error: error.message || "Não foi possível registrar este pedido.",
    });
  }

  const gatewayPayload = { ...payload };
  delete gatewayPayload.store_order;
  // Com API Key (X-Api-Key), a documentação dispensa o handle no payload externo.
  delete gatewayPayload.handle;
  if (INFINITEPAY_WEBHOOK_URL) {
    // Formato documentado pela InfinitePay: webhook com URL e eventos inscritos.
    // Por enquanto assinamos apenas `paid`, pois a loja ainda não implementa
    // o fluxo de estorno/cancelamento recebido por webhook.
    gatewayPayload.webhook = {
      url: INFINITEPAY_WEBHOOK_URL,
      events: ["paid"],
    };
  }

  try {
    const response = await fetch(INFINITEPAY_CHECKOUT_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "DropsDeLuxo/1.0",
        "X-Api-Key": INFINITEPAY_API_KEY,
      },
      body: JSON.stringify(gatewayPayload),
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      console.error("InfinitePay HTTP", response.status, data);
      return sendJson(
        res,
        response.status >= 400 && response.status < 500 ? response.status : 502,
        {
          error:
            data?.message ||
            data?.error ||
            "A InfinitePay não conseguiu gerar o checkout.",
          infinitepayStatus: response.status,
        },
      );
    }
    return sendJson(res, 200, data);
  } catch (error) {
    console.error("Erro ao conectar com a InfinitePay:", error);
    return sendJson(res, 502, {
      error: "Não foi possível conectar com a InfinitePay.",
    });
  }
}

async function requestInfinitePayPaymentCheck(body) {
  const response = await fetch(INFINITEPAY_PAYMENT_CHECK_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Api-Key": INFINITEPAY_API_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  return { response, data };
}

function validateInfinitePayConfirmation(data, body, order) {
  if (!data || data.paid !== true) {
    return { ok: false, reason: "A InfinitePay não confirmou o pagamento." };
  }

  // A resposta documentada de payment_check pode não repetir os identificadores
  // enviados na consulta. O vínculo é feito pelo pedido local e pelos parâmetros
  // usados na consulta; se a API devolver identificadores, eles precisam coincidir.
  const returnedOrder = data.order_nsu == null ? "" : String(data.order_nsu);
  const returnedTransaction =
    data.transaction_nsu == null ? "" : String(data.transaction_nsu);
  const returnedHandle = data.handle == null ? "" : String(data.handle);
  const returnedSlug =
    data.slug == null && data.invoice_slug == null
      ? ""
      : String(data.slug || data.invoice_slug);

  if (returnedOrder && returnedOrder !== body.order_nsu) {
    return {
      ok: false,
      reason:
        "O pedido retornado pela InfinitePay não corresponde ao pedido consultado.",
    };
  }
  if (returnedTransaction && returnedTransaction !== body.transaction_nsu) {
    return {
      ok: false,
      reason:
        "A transação retornada pela InfinitePay não corresponde à transação consultada.",
    };
  }
  if (returnedHandle && returnedHandle !== body.handle) {
    return {
      ok: false,
      reason:
        "A conta retornada pela InfinitePay não corresponde à conta consultada.",
    };
  }
  if (returnedSlug && returnedSlug !== body.slug) {
    return {
      ok: false,
      reason:
        "A cobrança retornada pela InfinitePay não corresponde à cobrança consultada.",
    };
  }

  // O valor local é o total calculado e guardado no checkout, em centavos.
  // Para evitar confirmar pagamentos incompletos, a resposta deve trazer o valor.
  const paidAmountRaw = data.paid_amount ?? data.amount;
  const paidAmount = Number(paidAmountRaw);
  const expectedAmount = Number(order?.amount);
  if (
    paidAmountRaw === undefined ||
    paidAmountRaw === null ||
    paidAmountRaw === "" ||
    !Number.isFinite(paidAmount) ||
    !Number.isFinite(expectedAmount) ||
    paidAmount !== expectedAmount
  ) {
    return {
      ok: false,
      reason:
        "O valor retornado pela InfinitePay está ausente ou não corresponde ao total do pedido.",
    };
  }

  return { ok: true };
}

async function checkInfinitePayPayment(req, res) {
  let payload;
  try {
    payload = await readJson(req, 20000);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const body = {
    handle: String(payload?.handle || ""),
    order_nsu: String(payload?.order_nsu || ""),
    transaction_nsu: String(payload?.transaction_nsu || ""),
    slug: String(payload?.slug || ""),
  };

  if (!body.handle || !body.order_nsu || !body.transaction_nsu || !body.slug) {
    return sendJson(res, 400, {
      error: "Dados insuficientes para verificar o pagamento.",
    });
  }
  if (body.handle !== INFINITEPAY_HANDLE) {
    return sendJson(res, 400, {
      error: "A conta InfinitePay não corresponde à conta configurada na loja.",
    });
  }

  // Não consulta nem altera pagamentos de identificadores que não correspondem a um pedido local.
  try {
    const orderExists = readOrdersFile().some(
      (order) => order.order_nsu === body.order_nsu,
    );
    if (!orderExists)
      return sendJson(res, 404, { error: "Pedido não encontrado." });

    const { response, data } = await requestInfinitePayPaymentCheck(body);
    if (!response.ok) {
      return sendJson(res, 502, {
        error: "A InfinitePay não confirmou o pagamento.",
        infinitepayStatus: response.status,
      });
    }

    // O pedido local é a referência para conferir total e existência.
    const localOrder = readOrdersFile().find(
      (order) => order.order_nsu === body.order_nsu,
    );
    if (!localOrder)
      return sendJson(res, 404, { error: "Pedido não encontrado." });

    if (data?.paid === true) {
      const validation = validateInfinitePayConfirmation(
        data,
        body,
        localOrder,
      );
      if (!validation.ok) {
        console.warn("Confirmação InfinitePay recusada:", validation.reason);
        return sendJson(res, 409, { paid: false, error: validation.reason });
      }
      const updated = updateOrderPaid({
        ...data,
        order_nsu: body.order_nsu,
        transaction_nsu: body.transaction_nsu,
        paid: true,
        slug: body.slug,
      });
      if (!updated)
        return sendJson(res, 404, {
          error: "Pedido não encontrado para atualização.",
        });
    }
    return sendJson(res, 200, data);
  } catch (error) {
    console.error("Erro no payment_check da InfinitePay:", error);
    return sendJson(res, 502, {
      error: "Não foi possível consultar o pagamento na InfinitePay.",
    });
  }
}

async function infinitePayWebhook(req, res) {
  console.info("[InfinitePay webhook] Requisição recebida", {
    method: req.method,
    contentType: req.headers["content-type"] || "",
  });
  let payload;
  try {
    payload = await readJson(req, 50000);
  } catch (error) {
    console.warn("[InfinitePay webhook] JSON inválido", { message: error.message });
    return sendJson(res, 400, { error: error.message });
  }
  // Diagnóstico sem registrar valores, identificadores, dados de clientes ou credenciais.
  console.info("[InfinitePay webhook] Campos recebidos", {
    keys: Object.keys(payload || {}),
    hasHandle: Boolean(payload?.handle),
    hasOrderNsu: Boolean(payload?.order_nsu),
    hasTransactionNsu: Boolean(payload?.transaction_nsu),
    hasSlug: Boolean(payload?.slug || payload?.invoice_slug),
    event: typeof payload?.event === "string" ? payload.event : undefined,
  });

  // O webhook oficial documentado não inclui necessariamente o campo `handle`.
  // Nesse caso, usamos o handle configurado no servidor; se vier no payload,
  // ele precisa corresponder à conta configurada.
  const receivedHandle = String(payload?.handle || "").trim();
  const body = {
    handle: receivedHandle || INFINITEPAY_HANDLE,
    order_nsu: String(payload?.order_nsu || "").trim(),
    transaction_nsu: String(payload?.transaction_nsu || "").trim(),
    slug: String(payload?.slug || payload?.invoice_slug || "").trim(),
  };

  if (!body.order_nsu || !body.transaction_nsu || !body.slug) {
    console.warn("[InfinitePay webhook] Rejeitado: identificadores obrigatórios ausentes", {
      hasOrderNsu: Boolean(body.order_nsu),
      hasTransactionNsu: Boolean(body.transaction_nsu),
      hasSlug: Boolean(body.slug),
    });
    return sendJson(res, 400, {
      error: "Dados insuficientes para validar o webhook da InfinitePay.",
    });
  }
  if (receivedHandle && receivedHandle !== INFINITEPAY_HANDLE) {
    console.warn("[InfinitePay webhook] Rejeitado: handle divergente");
    return sendJson(res, 400, {
      error:
        "A conta InfinitePay do webhook não corresponde à conta configurada na loja.",
    });
  }

  try {
    const localOrder = readOrdersFile().find(
      (order) => order.order_nsu === body.order_nsu,
    );
    if (!localOrder) {
      console.warn("[InfinitePay webhook] Pedido local não encontrado");
      return sendJson(res, 404, {
        error: "Pedido não encontrado para este order_nsu.",
      });
    }

    // Nunca confiar apenas no corpo do webhook: confirmar o pagamento consultando a InfinitePay.
    const { response, data } = await requestInfinitePayPaymentCheck(body);
    if (!response.ok) {
      console.error("[InfinitePay webhook] payment_check retornou HTTP não-2xx", {
        status: response.status,
      });
      return sendJson(res, 502, {
        error: "Não foi possível validar o webhook com a InfinitePay.",
      });
    }
    const validation = validateInfinitePayConfirmation(data, body, localOrder);
    if (!validation.ok) {
      console.warn("[InfinitePay webhook] Confirmação não validada", {
        reason: validation.reason,
      });
      return sendJson(res, 409, {
        ok: false,
        paid: false,
        error: validation.reason,
      });
    }

    const order = updateOrderPaid({
      ...data,
      order_nsu: body.order_nsu,
      transaction_nsu: body.transaction_nsu,
      paid: true,
      slug: body.slug,
    });
    if (!order) {
      console.error("[InfinitePay webhook] Pedido não foi atualizado após validação");
      return sendJson(res, 404, {
        error: "Pedido não encontrado para atualização.",
      });
    }
    console.info("[InfinitePay webhook] Pagamento validado e pedido atualizado");
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("Erro ao processar webhook InfinitePay:", error);
    return sendJson(res, 500, {
      error: "Não foi possível processar o webhook.",
    });
  }
}

function getOrder(req, res, orderNsu) {
  // A rota legada /api/orders/:id não pode expor dados pessoais só com o identificador.
  // Administradores autenticados podem consultar; clientes só podem consultar o próprio pedido.
  if (getAdminSession(req)) {
    try {
      const order = readOrdersFile().find(
        (item) => item.order_nsu === String(orderNsu || ""),
      );
      if (!order)
        return sendJson(res, 404, { error: "Pedido não encontrado." });
      return sendJson(res, 200, { order });
    } catch (error) {
      return sendJson(res, 500, {
        error: "Não foi possível consultar o pedido.",
      });
    }
  }

  const session = getCustomerSession(req);
  if (!session) {
    return sendJson(res, 401, {
      authenticated: false,
      error: "Faça login para consultar seu pedido.",
    });
  }

  try {
    const customer = getCustomerById(session.customerId);
    if (!customer)
      return sendJson(res, 401, {
        authenticated: false,
        error: "Sessão do cliente inválida.",
      });
    const email = normalizeCustomerEmail(customer.email);
    const order = readOrdersFile().find(
      (item) =>
        item.order_nsu === String(orderNsu || "") &&
        ((item.customer_id && item.customer_id === customer.id) ||
          (!item.customer_id && normalizeCustomerEmail(item?.customer?.email) === email)),
    );
    if (!order) return sendJson(res, 404, { error: "Pedido não encontrado." });
    const safeOrder = {
      order_nsu: order.order_nsu,
      status: order.status,
      amount: order.amount,
      items: Array.isArray(order.store_items)
        ? order.store_items.map((item) => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
          }))
        : Array.isArray(order.items)
          ? order.items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              price: item.price,
            }))
          : [],
      tracking: order.tracking
        ? {
            code: order.tracking.code || "",
            url: order.tracking.url || "",
            shippedAt: order.tracking.shippedAt || null,
          }
        : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paidAt: order.paidAt || null,
    };
    return sendJson(res, 200, { order: safeOrder });
  } catch (error) {
    return sendJson(res, 500, {
      error: "Não foi possível consultar o pedido.",
    });
  }
}

const ORDER_STATUSES = new Set([
  "aguardando_pagamento",
  "pago",
  "pedido_confirmado",
  "em_preparacao",
  "enviado",
  "entregue",
  "cancelado",
]);

function normalizeOrderStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function orderMatchesSearch(order, search) {
  if (!search) return true;
  const customer = order?.customer || {};
  const haystack = [
    order?.order_nsu,
    customer?.name,
    customer?.email,
    customer?.phone_number,
    customer?.phone,
    order?.status,
  ].map((value) => String(value || "").toLowerCase());
  return haystack.some((value) => value.includes(search));
}

function adminOrdersList(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const status = normalizeOrderStatus(url.searchParams.get("status"));
    const search = String(url.searchParams.get("q") || "")
      .trim()
      .toLowerCase();

    let orders = readOrdersFile();

    if (status)
      orders = orders.filter(
        (order) => normalizeOrderStatus(order.status) === status,
      );
    if (search)
      orders = orders.filter((order) => orderMatchesSearch(order, search));

    orders.sort((a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );

    return sendJson(res, 200, {
      orders,
      total: orders.length,
      statuses: [...ORDER_STATUSES],
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}

function adminOrderDetail(req, res, orderNsu) {
  if (!requireAdmin(req, res)) return;

  try {
    const order = readOrdersFile().find(
      (item) => item.order_nsu === String(orderNsu || ""),
    );
    if (!order) return sendJson(res, 404, { error: "Pedido não encontrado." });
    return sendJson(res, 200, { order, statuses: [...ORDER_STATUSES] });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}

async function adminSuperfreteCreateCart(req, res, orderNsu) {
  if (!requireAdmin(req, res)) return;
  if (!SUPERFRETE_TOKEN)
    return sendJson(res, 500, {
      error: "SUPERFRETE_TOKEN não configurado no servidor.",
    });

  const missingFrom = [
    ["SUPERFRETE_FROM_NAME", SUPERFRETE_FROM.name],
    ["SUPERFRETE_FROM_ADDRESS", SUPERFRETE_FROM.address],
    ["SUPERFRETE_FROM_NUMBER", SUPERFRETE_FROM.number],
    ["SUPERFRETE_FROM_DISTRICT", SUPERFRETE_FROM.district],
    ["SUPERFRETE_FROM_CITY", SUPERFRETE_FROM.city],
    ["SUPERFRETE_FROM_STATE", SUPERFRETE_FROM.state_abbr],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingFrom.length) {
    return sendJson(res, 400, {
      error: "Dados do remetente SuperFrete incompletos no .env.",
      missing: missingFrom,
    });
  }

  try {
    const orders = readOrdersFile();
    const index = orders.findIndex(
      (item) => item.order_nsu === String(orderNsu || ""),
    );
    if (index < 0)
      return sendJson(res, 404, { error: "Pedido não encontrado." });

    const order = orders[index];
    if (String(order.status || "").toLowerCase() === "cancelado") {
      return sendJson(res, 400, {
        error: "Não é possível criar etiqueta para pedido cancelado.",
      });
    }

    const service = Number(order?.freight?.service);
    if (![1, 2].includes(service)) {
      return sendJson(res, 400, {
        error: "O pedido precisa ter PAC (1) ou SEDEX (2) selecionado.",
      });
    }

    const orderCustomer = order.customer || {};
    const latestCustomer = orderCustomer.id
      ? getCustomerById(orderCustomer.id)
      : orderCustomer.email
        ? readCustomersFile().find(
            (item) =>
              String(item.email || "").toLowerCase() ===
              String(orderCustomer.email || "").toLowerCase(),
          )
        : null;
    const customer = { ...orderCustomer, ...(latestCustomer || {}) };
    const address = order.address || customer.address || {};
    const cep = onlyDigits(
      address.cep ||
        address.postal_code ||
        address.postalCode ||
        address.zip_code ||
        address.zipCode,
    ).slice(0, 8);
    if (cep.length !== 8)
      return sendJson(res, 400, {
        error: "CEP do destinatário inválido.",
        addressReceived: address,
      });

    const document = normalizeCustomerDocument(
      customer.document || customer.cpf || customer.cnpj,
    );
    if (![11, 14].includes(document.length)) {
      return sendJson(res, 400, {
        error: "CPF/CNPJ do destinatário não informado ou inválido.",
        message:
          "Cadastre o CPF/CNPJ do cliente em Minha Conta antes de criar a etiqueta SuperFrete.",
      });
    }

    const baseItems =
      Array.isArray(order.store_items) && order.store_items.length
        ? order.store_items
        : Array.isArray(order.items)
          ? order.items.map((item) => ({
              name: item.description || "Produto",
              quantity: Number(item.quantity) || 0,
              unitPrice: Number(item.price) || 0,
            }))
          : [];

    if (!baseItems.length)
      return sendJson(res, 400, {
        error: "O pedido não possui produtos para declarar.",
      });

    const volumeGroups = splitSuperfreteVolumes(baseItems);
    if (!volumeGroups.length)
      return sendJson(res, 400, {
        error: "O pedido não possui quantidade válida de produtos.",
      });

    const to = {
      name: String(customer.name || "Destinatário").trim(),
      address: String(address.street || address.address || "").trim(),
      number: String(address.number || "S/N").trim(),
      district: String(address.neighborhood || address.district || "").trim(),
      city: String(address.city || "").trim(),
      state_abbr: String(address.state || address.state_abbr || "")
        .trim()
        .toUpperCase(),
      postal_code: cep,
      document,
    };

    const complement = String(address.complement || "").trim();
    const email = String(customer.email || "").trim();
    if (complement) to.complement = complement;
    if (email) to.email = email;

    const requiredTo = [
      "name",
      "address",
      "district",
      "city",
      "state_abbr",
      "postal_code",
      "document",
    ];
    const missingTo = requiredTo.filter((key) => !to[key]);
    if (missingTo.length)
      return sendJson(res, 400, {
        error: "Endereço do destinatário incompleto.",
        missing: missingTo,
      });

    const endpoint = SUPERFRETE_CART_API_URL;
    const created = [];

    for (const group of volumeGroups) {
      const volume = getSuperfreteVolume(group.length);
      const products = [];
      for (const item of group) {
        const existing = products.find(
          (p) => p.name === item.name && p.unitary_value === item.unitary_value,
        );
        if (existing) existing.quantity += 1;
        else
          products.push({
            name: item.name,
            quantity: 1,
            unitary_value: Number(item.unitary_value.toFixed(2)),
          });
      }

      const from = {
        name: SUPERFRETE_FROM.name,
        address: SUPERFRETE_FROM.address,
        number: SUPERFRETE_FROM.number,
        district: SUPERFRETE_FROM.district,
        state_abbr: SUPERFRETE_FROM.state_abbr,
        postal_code: SUPERFRETE_FROM.postal_code,
        city: SUPERFRETE_FROM.city,
      };
      if (SUPERFRETE_FROM.complement)
        from.complement = SUPERFRETE_FROM.complement;
      if (SUPERFRETE_FROM.email) from.email = SUPERFRETE_FROM.email;
      if (SUPERFRETE_FROM.document) from.document = SUPERFRETE_FROM.document;

      const requestBody = {
        from,
        to,
        service,
        products_or_options: products,
        volumes: volume,
        platform: "Drops de Luxo",
      };

      const response = await fetch(SUPERFRETE_CART_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPERFRETE_TOKEN}`,
          "User-Agent": SUPERFRETE_USER_AGENT,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        console.error("SuperFrete /cart HTTP", response.status, data);
        const detail = String(
          data?.message ??
            data?.error ??
            (Array.isArray(data?.errors)
              ? data.errors
                  .map(
                    (item) =>
                      item?.message || item?.error || JSON.stringify(item),
                  )
                  .join("; ")
              : "") ??
            "",
        ).trim();
        return sendJson(
          res,
          response.status >= 400 && response.status < 500
            ? response.status
            : 502,
          {
            error: detail
              ? `SuperFrete recusou a criação da etiqueta (${response.status}): ${detail}`
              : `SuperFrete recusou a criação da etiqueta (HTTP ${response.status}).`,
            superfreteStatus: response.status,
            response: data,
            created,
          },
        );
      }

      const payload =
        data?.data && typeof data.data === "object" ? data.data : data;
      const id = String(
        payload?.id ||
          payload?.protocol ||
          payload?.order?.id ||
          payload?.order_id ||
          data?.id ||
          data?.protocol ||
          "",
      ).trim();
      if (!id) {
        return sendJson(res, 502, {
          error:
            "A SuperFrete respondeu sem um identificador de etiqueta. Nenhuma etiqueta foi considerada criada.",
          response: data,
          created,
        });
      }

      created.push({
        id,
        status: payload?.status || data?.status || "pending",
        tracking: payload?.tracking || data?.tracking || null,
        printUrl:
          payload?.print?.url ||
          payload?.print_url ||
          data?.print?.url ||
          data?.print_url ||
          null,
        price: Number(payload?.price ?? data?.price ?? 0),
        service,
      });
    }

    orders[index] = {
      ...order,
      customer: {
        ...order.customer,
        ...(latestCustomer || {}),
        document,
      },
      superfrete: {
        orders: created,
        createdAt: new Date().toISOString(),
        service,
        status: created.length === 1 ? created[0].status : "pending",
      },
      updatedAt: new Date().toISOString(),
    };
    writeOrdersFile(orders);

    return sendJson(res, 200, {
      ok: true,
      message: "Etiqueta(s) criada(s) na SuperFrete e aguardando pagamento.",
      order: orders[index],
    });
  } catch (error) {
    console.error("Erro ao criar carrinho SuperFrete:", error);
    return sendJson(res, 502, {
      error: "Não foi possível criar a etiqueta na SuperFrete.",
      detail: error.message,
    });
  }
}

async function adminSuperfreteCheckout(req, res, orderNsu) {
  if (!requireAdmin(req, res)) return;
  if (!SUPERFRETE_TOKEN)
    return sendJson(res, 500, {
      error: "SUPERFRETE_TOKEN não configurado no servidor.",
    });
  try {
    const orders = readOrdersFile();
    const index = orders.findIndex(
      (item) => item.order_nsu === String(orderNsu || ""),
    );
    if (index < 0)
      return sendJson(res, 404, { error: "Pedido não encontrado." });
    const order = orders[index];
    const labels = Array.isArray(order?.superfrete?.orders)
      ? order.superfrete.orders
      : [];
    const ids = labels
      .map((item) => String(item?.id || "").trim())
      .filter(Boolean);
    if (!ids.length)
      return sendJson(res, 400, {
        error: "Este pedido ainda não possui etiquetas SuperFrete.",
      });
    if (order?.superfrete?.simulation === true)
      return sendJson(res, 400, {
        error: "Pedido simulado não pode ser emitido na SuperFrete.",
      });
    const response = await fetch("https://api.superfrete.com/api/v0/checkout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPERFRETE_TOKEN}`,
        "User-Agent": SUPERFRETE_USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orders: ids }),
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!response.ok) {
      console.error("SuperFrete /checkout HTTP", response.status, data);
      return sendJson(
        res,
        response.status >= 400 && response.status < 500 ? response.status : 502,
        {
          error:
            data?.message ||
            data?.error ||
            `A SuperFrete recusou a solicitação de emissão (HTTP ${response.status}).`,
          superfreteStatus: response.status,
          endpoint: "/api/v0/checkout",
          response: data,
        },
      );
    }
    return sendJson(res, 200, {
      ok: true,
      message:
        "Solicitação enviada à SuperFrete. Atualize o status para confirmar a emissão e o PDF.",
      checkout: data,
    });
  } catch (error) {
    console.error("Erro no checkout SuperFrete:", error);
    return sendJson(res, 502, {
      error: "Não foi possível concluir a solicitação à SuperFrete.",
      detail: error.message,
      endpoint: "/api/v0/checkout",
    });
  }
}

async function adminSuperfreteSimulatePayment(req, res, orderNsu) {
  if (!requireAdmin(req, res)) return;

  try {
    const orders = readOrdersFile();
    const index = orders.findIndex(
      (item) => item.order_nsu === String(orderNsu || ""),
    );
    if (index < 0)
      return sendJson(res, 404, { error: "Pedido não encontrado." });

    const order = orders[index];
    const superOrders = Array.isArray(order?.superfrete?.orders)
      ? order.superfrete.orders
      : [];
    if (!superOrders.length) {
      return sendJson(res, 400, {
        error: "Este pedido ainda não possui etiqueta SuperFrete.",
      });
    }

    const now = new Date().toISOString();
    const service = Number(
      order?.freight?.service || order?.superfrete?.service || 2,
    );
    const fakeTracking = service === 1 ? "AA000000001BR" : "AA000000002BR";

    const simulatedOrders = superOrders.map((item, index) => ({
      ...item,
      status: "released",
      tracking: index === 0 ? fakeTracking : `AA00000000${index + 2}BR`,
      printUrl: item.printUrl || null,
      simulatedPayment: true,
      releasedAt: now,
    }));

    const tracking = simulatedOrders[0].tracking;
    orders[index] = {
      ...order,
      superfrete: {
        ...order.superfrete,
        orders: simulatedOrders,
        status: "released",
        simulation: true,
        simulatedPaymentAt: now,
      },
      tracking: {
        carrier: "Correios",
        service: service === 1 ? "PAC" : "SEDEX",
        code: tracking,
        url: `https://rastreamento.correios.com.br/app/index.php?objeto=${encodeURIComponent(tracking)}`,
        shippedAt: now,
        simulated: true,
      },
      status: "enviado",
      updatedAt: now,
    };

    writeOrdersFile(orders);

    return sendJson(res, 200, {
      ok: true,
      simulation: true,
      message:
        "Pagamento da etiqueta simulado com sucesso. Rastreio de teste liberado.",
      order: orders[index],
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: "Não foi possível simular o pagamento da etiqueta.",
      detail: error.message,
    });
  }
}

async function adminSuperfreteOrderInfo(req, res, orderNsu) {
  if (!requireAdmin(req, res)) return;
  if (!SUPERFRETE_TOKEN)
    return sendJson(res, 500, {
      error: "SUPERFRETE_TOKEN não configurado no servidor.",
    });

  try {
    const orders = readOrdersFile();
    const order = orders.find(
      (item) => item.order_nsu === String(orderNsu || ""),
    );
    if (order?.superfrete?.simulation === true) {
      return sendJson(res, 200, { ok: true, simulation: true, order });
    }
    if (!order) return sendJson(res, 404, { error: "Pedido não encontrado." });
    const superOrders = Array.isArray(order?.superfrete?.orders)
      ? order.superfrete.orders
      : [];
    if (!superOrders.length)
      return sendJson(res, 400, {
        error: "Este pedido ainda não possui etiqueta SuperFrete.",
      });

    const results = [];
    for (const item of superOrders) {
      const id = String(item?.id || "").trim();
      if (!id) continue;
      const endpoint = `https://api.superfrete.com/api/v0/order/info/${encodeURIComponent(id)}`;
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${SUPERFRETE_TOKEN}`,
          "User-Agent": SUPERFRETE_USER_AGENT,
          Accept: "application/json",
        },
      });
      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }
      if (!response.ok)
        return sendJson(res, 502, {
          error: "Não foi possível consultar a etiqueta na SuperFrete.",
          superfreteStatus: response.status,
          response: data,
        });
      const payload =
        data?.data && typeof data.data === "object" ? data.data : data;
      results.push({ ...payload, _raw: data, _requestedId: id });
    }

    const refreshedOrders = superOrders.map((previous, index) => {
      const item = results[index] || {};
      const status = String(item.status || previous.status || "pending").trim();
      const normalizedStatus = status
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[\s-]+/g, "_");

      // A URL may be returned/stored before the label is actually issued.
      // Do not expose it in the admin UI until the carrier label is in an
      // issued/released/completed state; "pending" means awaiting issuance.
      const labelIssued =
        /^(issued|released|completed|posted|printed|shipped|emitted|emitida|emitido|postada|postado|concluida|concluido|paid|pago|paga|ready_to_print|ready_for_print|available|available_to_print|authorized|autorizada|autorizado)$/.test(
          normalizedStatus,
        );
      const apiPrintUrl = item?.print?.url || item?.print_url || null;
      const savedPrintUrl = previous.printUrl || null;
      const printUrl = labelIssued ? apiPrintUrl || savedPrintUrl : null;

      return {
        ...previous,
        id: String(
          item.id || item.order_id || item._requestedId || previous.id || "",
        ),
        status,
        tracking:
          item.tracking || item.tracking_code || previous.tracking || null,
        printUrl,
        price: Number(item.price ?? previous.price ?? 0),
        service: Number(
          item.service_id || item.service || previous.service || 0,
        ),
      };
    });
    const firstTracking =
      refreshedOrders.find((item) => item.tracking)?.tracking || null;
    const firstService =
      refreshedOrders.find((item) => item.service)?.service ||
      Number(order?.freight?.service || 0);
    const merged = {
      ...order,
      superfrete: {
        ...order.superfrete,
        orders: refreshedOrders,
        status:
          refreshedOrders.length &&
          refreshedOrders.every((item) =>
            /^(issued|released|completed|posted|printed|shipped|emitted|emitida|emitido|postada|postado|concluida|concluido|paid|pago|paga|ready_to_print|ready_for_print|available|available_to_print|authorized|autorizada|autorizado)$/i.test(
              String(item.status || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[\s-]+/g, "_"),
            ),
          )
            ? "issued"
            : refreshedOrders.some((item) =>
                  /cancel/i.test(String(item.status || "")),
                )
              ? "cancelled"
              : "pending",
        checkedAt: new Date().toISOString(),
      },
      ...(firstTracking
        ? {
            tracking: {
              carrier: "Correios",
              service:
                firstService === 1
                  ? "PAC"
                  : firstService === 2
                    ? "SEDEX"
                    : "Correios",
              code: firstTracking,
              url: `https://rastreamento.correios.com.br/app/index.php?objeto=${encodeURIComponent(firstTracking)}`,
              shippedAt: order?.tracking?.shippedAt || new Date().toISOString(),
            },
            status: "enviado",
          }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    const index = orders.findIndex(
      (item) => item.order_nsu === String(orderNsu || ""),
    );
    orders[index] = merged;
    writeOrdersFile(orders);
    return sendJson(res, 200, { ok: true, order: merged });
  } catch (error) {
    return sendJson(res, 502, {
      error: "Não foi possível consultar a etiqueta SuperFrete.",
      detail: error.message,
    });
  }
}

async function adminOrderTrackingUpdate(req, res, orderNsu) {
  if (!requireAdmin(req, res)) return;

  let payload;
  try {
    payload = await readJson(req, 10000);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const carrier = String(payload?.carrier || "").trim();
  const service = String(payload?.service || "").trim();
  const trackingCode = String(payload?.trackingCode || "")
    .trim()
    .toUpperCase();
  let trackingUrl = String(payload?.trackingUrl || "").trim();

  if (trackingCode && !trackingUrl && carrier.toLowerCase() === "correios") {
    trackingUrl = `https://rastreamento.correios.com.br/app/index.php?objeto=${encodeURIComponent(trackingCode)}`;
  }

  if (!trackingCode) {
    return sendJson(res, 400, { error: "Informe o código de rastreio." });
  }

  if (trackingUrl && !/^https?:\/\//i.test(trackingUrl)) {
    return sendJson(res, 400, {
      error: "O link de rastreamento deve começar com http:// ou https://.",
    });
  }

  try {
    const orders = readOrdersFile();
    const index = orders.findIndex(
      (item) => item.order_nsu === String(orderNsu || ""),
    );
    if (index < 0)
      return sendJson(res, 404, { error: "Pedido não encontrado." });

    const previous = orders[index];
    orders[index] = {
      ...previous,
      tracking: {
        carrier: carrier || previous?.tracking?.carrier || "",
        service: service || previous?.tracking?.service || "",
        code: trackingCode,
        url: trackingUrl || previous?.tracking?.url || "",
        shippedAt: previous?.tracking?.shippedAt || new Date().toISOString(),
      },
      status: "enviado",
      updatedAt: new Date().toISOString(),
    };

    writeOrdersFile(orders);
    return sendJson(res, 200, { ok: true, order: orders[index] });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}

async function adminOrderStatusUpdate(req, res, orderNsu) {
  if (!requireAdmin(req, res)) return;

  let payload;
  try {
    payload = await readJson(req, 10000);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const status = normalizeOrderStatus(payload?.status);
  if (!ORDER_STATUSES.has(status)) {
    return sendJson(res, 400, {
      error: "Status de pedido inválido.",
      statuses: [...ORDER_STATUSES],
    });
  }

  try {
    const orders = readOrdersFile();
    const index = orders.findIndex(
      (item) => item.order_nsu === String(orderNsu || ""),
    );

    if (index < 0)
      return sendJson(res, 404, { error: "Pedido não encontrado." });

    if (status === "pago") {
      const current = orders[index];
      const transaction = String(current.transaction_nsu || "");
      const gatewayVerified =
        Boolean(current.paidAt) &&
        Boolean(transaction) &&
        !transaction.startsWith("SIMULADO-");
      if (!gatewayVerified) {
        return sendJson(res, 409, {
          error:
            "Este pedido só pode ser marcado como pago após confirmação validada pela InfinitePay.",
        });
      }
    }

    orders[index] = {
      ...orders[index],
      status,
      updatedAt: new Date().toISOString(),
    };

    writeOrdersFile(orders);
    return sendJson(res, 200, { ok: true, order: orders[index] });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}

function getCustomerOrders(req, res) {
  const session = getCustomerSession(req);
  if (!session) {
    return sendJson(res, 401, {
      authenticated: false,
      error: "Faça login para consultar seus pedidos.",
    });
  }

  try {
    const customer = getCustomerById(session.customerId);
    if (!customer) {
      return sendJson(res, 401, {
        authenticated: false,
        error: "Sessão do cliente inválida.",
      });
    }

    const email = normalizeCustomerEmail(customer.email);
    const orders = readOrdersFile()
      .filter(
        (order) =>
          (order.customer_id && order.customer_id === customer.id) ||
          (!order.customer_id && normalizeCustomerEmail(order?.customer?.email) === email),
      )
      .sort((a, b) =>
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
      )
      .map((order) => ({
        order_nsu: order.order_nsu,
        status: order.status,
        amount: order.amount,
        items: Array.isArray(order.store_items)
          ? order.store_items.map((item) => ({
              productId: item.productId,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
            }))
          : Array.isArray(order.items)
            ? order.items.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                price: item.price,
              }))
            : [],
        tracking: order.tracking
          ? {
              code: order.tracking.code || "",
              url: order.tracking.url || "",
              shippedAt: order.tracking.shippedAt || null,
            }
          : null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        paidAt: order.paidAt || null,
      }));

    return sendJson(res, 200, { orders });
  } catch (error) {
    // Não revelar caminhos de arquivos, detalhes de armazenamento ou stack interno ao cliente.
    console.error("Falha ao consultar pedidos do cliente:", error);
    return sendJson(res, 500, {
      error: "Não foi possível consultar seus pedidos no momento.",
    });
  }
}

function getCustomerOrder(req, res, orderNsu) {
  const session = getCustomerSession(req);
  if (!session) {
    return sendJson(res, 401, {
      authenticated: false,
      error: "Faça login para consultar seu pedido.",
    });
  }

  try {
    const customer = getCustomerById(session.customerId);
    if (!customer) {
      customerSessions.delete(session.token);
      clearCustomerSessionCookie(res);
      return sendJson(res, 401, {
        authenticated: false,
        error: "Sessão do cliente inválida.",
      });
    }
    const email = normalizeCustomerEmail(customer.email);
    const order = readOrdersFile().find(
      (item) =>
        item.order_nsu === String(orderNsu || "") &&
        ((item.customer_id && item.customer_id === customer.id) ||
          (!item.customer_id && normalizeCustomerEmail(item?.customer?.email) === email)),
    );

    if (!order) return sendJson(res, 404, { error: "Pedido não encontrado." });
    const safeOrder = {
      order_nsu: order.order_nsu,
      status: order.status,
      amount: order.amount,
      items: Array.isArray(order.store_items)
        ? order.store_items.map((item) => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
          }))
        : Array.isArray(order.items)
          ? order.items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              price: item.price,
            }))
          : [],
      tracking: order.tracking
        ? {
            code: order.tracking.code || "",
            url: order.tracking.url || "",
            shippedAt: order.tracking.shippedAt || null,
          }
        : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paidAt: order.paidAt || null,
    };
    return sendJson(res, 200, { order: safeOrder });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}

async function calculateFreight(req, res) {
  if (!SUPERFRETE_TOKEN) {
    return sendJson(res, 500, {
      error: "SUPERFRETE_TOKEN não configurado no servidor.",
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
      error: "Informe um CEP de destino válido.",
    });
  }

  let quoteItems;
  let catalog;
  try {
    catalog = readCatalogFile();
    quoteItems = normalizeQuoteItems(payload.items, catalog);
  } catch (error) {
    return sendJson(res, 400, {
      error:
        error.message || "Não foi possível validar os produtos para o frete.",
    });
  }
  const totalQuantity = quoteItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const volumeGroups = [];
  const units = [];
  for (const item of quoteItems) {
    const product = catalog.find(
      (product) => String(product.id || "") === item.productId,
    );
    for (let i = 0; i < item.quantity; i += 1)
      units.push({ productId: item.productId, quantity: 1, product });
  }
  for (let i = 0; i < units.length; i += 6)
    volumeGroups.push(units.slice(i, i + 6));

  async function calculateVolume(group) {
    const quantity = group.length || 1;
    const packageData = getSuperfreteVolume(quantity);
    if (!packageData)
      throw new Error("Não foi possível determinar o volume da embalagem.");

    const apiPayload = {
      from: { postal_code: ORIGIN_CEP },
      to: { postal_code: to },
      services: "1,2",
      options: {
        own_hand: false,
        receipt: false,
        insurance_value: 0,
        use_insurance_value: false,
      },
      package: packageData,
    };

    const response = await fetch(SUPERFRETE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPERFRETE_TOKEN}`,
        "User-Agent": SUPERFRETE_USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apiPayload),
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
      throw Object.assign(
        new Error(
          response.status === 401
            ? "A SuperFrete recusou o token configurado no servidor."
            : "A SuperFrete não conseguiu calcular o frete.",
        ),
        { superfreteStatus: response.status, response: data },
      );
    }

    return findArray(data)
      .map(normalizeService)
      .filter((item) => item.code === "1" || item.code === "2")
      .filter((item) => item.price >= 0);
  }

  try {
    const perVolume = [];
    for (const group of volumeGroups)
      perVolume.push(await calculateVolume(group));

    const options = ["1", "2"]
      .map((code) => {
        const services = perVolume
          .map((list) => list.find((item) => item.code === code))
          .filter(Boolean);
        if (!services.length) return null;
        const price = services.reduce(
          (sum, item) => sum + Number(item.price || 0),
          0,
        );
        const deliveryValues = services
          .map((item) => Number(item.deliveryTime || item.delivery || 0))
          .filter(Boolean);
        const deliveryTime = deliveryValues.length
          ? Math.max(...deliveryValues)
          : 0;
        const first = services[0];
        return {
          ...first,
          code,
          price: Number(price.toFixed(2)),
          deliveryTime,
        };
      })
      .filter(Boolean);

    if (!options.length)
      return sendJson(res, 502, {
        error: "A SuperFrete não retornou opções válidas para este CEP.",
      });
    const quoteId = crypto.randomBytes(24).toString("hex");
    const createdAtMs = Date.now();
    const quotes = readFreightQuotes();
    quotes.push({
      id: quoteId,
      origin: ORIGIN_CEP,
      destination: to,
      items: quoteItems,
      options: options.map((option) => ({
        code: String(option.code),
        price: Number(option.price),
        deliveryTime: Number(option.deliveryTime || 0),
        name: String(option.name || option.service || ""),
      })),
      createdAtMs,
      expiresAtMs: createdAtMs + FREIGHT_QUOTE_TTL_MS,
    });
    // Mantém somente as 500 cotações mais recentes para limitar o crescimento do arquivo.
    writeFreightQuotes(quotes.slice(-500));
    return sendJson(res, 200, {
      quoteId,
      expiresAt: new Date(createdAtMs + FREIGHT_QUOTE_TTL_MS).toISOString(),
      origin: ORIGIN_CEP,
      destination: to,
      quantity: totalQuantity,
      volumes: volumeGroups.map((group) =>
        getSuperfreteVolume(group.length || 1),
      ),
      options,
    });
  } catch (error) {
    console.error(error);
    return sendJson(res, error?.superfreteStatus === 401 ? 502 : 502, {
      error: error.message || "Não foi possível conectar à SuperFrete.",
      superfreteStatus: error?.superfreteStatus,
      response: error?.response,
    });
  }
}

/* =========================================================
   PRODUTOS — ETAPA 3
   Catálogo persistido no servidor.
   Alterações administrativas exigem sessão válida.
   ========================================================= */

const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");

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

function ensureCatalogFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(CATALOG_FILE)) {
    fs.writeFileSync(
      CATALOG_FILE,
      JSON.stringify(SEED_PRODUCTS, null, 2),
      "utf8",
    );
  }
}

function readCatalogFile() {
  ensureCatalogFile();

  try {
    const parsed = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf8"));

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Erro ao ler catálogo:", error);
    throw new Error("Não foi possível ler o catálogo.");
  }
}

function writeCatalogFile(products) {
  ensureCatalogFile();

  const tempFile = `${CATALOG_FILE}.${process.pid}.${Date.now()}.tmp`;

  fs.writeFileSync(tempFile, JSON.stringify(products, null, 2), "utf8");

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
  "outlet",
  "decants",
  "compartilhaveis",
  "infantil",
]);

const ALLOWED_GENDERS = new Set(["feminino", "masculino", "unissex"]);

function normalizeProduct(input, existingId = null) {
  const name = String(input?.name || "").trim();
  const brand = String(input?.brand || "").trim();
  const category = String(input?.category || "").trim();
  const gender = String(input?.gender || "").trim();
  const volume = Number(input?.volume || 0);
  const decantPricesInput =
    input?.decantPrices && typeof input.decantPrices === "object"
      ? input.decantPrices
      : {};
  const decantPrice5 = Number(
    decantPricesInput["5"] ?? input?.decantPrice5 ?? input?.price,
  );
  const decantPrice10 = Number(decantPricesInput["10"] ?? input?.decantPrice10);
  const isDecants = category === "decants";
  const price = isDecants ? decantPrice5 : Number(input?.price);
  const originalPrice = Number(input?.originalPrice || 0);
  const stock = Number(input?.stock || 0);
  const desc = String(input?.desc || "").trim();
  const rawFamilies = Array.isArray(input?.olfactoryFamilies)
    ? input.olfactoryFamilies
    : String(input?.olfactoryFamilies || input?.olfactoryFamily || "").split(
        /[,;|]/,
      );
  const olfactoryFamilies = [
    ...new Set(
      rawFamilies
        .map((value) =>
          String(value || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ].slice(0, 8);

  const legacyImage = String(input?.image || "");
  const rawImages = Array.isArray(input?.images) ? input.images : [];

  const images = rawImages
    .map((item) => String(item || ""))
    .filter(Boolean)
    .slice(0, 3);

  if (!images.length && legacyImage) {
    images.push(legacyImage);
  }

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
  if (
    isDecants &&
    (!Number.isFinite(decantPrice5) ||
      decantPrice5 <= 0 ||
      !Number.isFinite(decantPrice10) ||
      decantPrice10 <= 0)
  ) {
    throw new Error("Informe preços válidos para os decants de 5 ml e 10 ml.");
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

  if (images.length > 3) {
    throw new Error("Um produto pode ter no máximo 3 fotos.");
  }

  for (const image of images) {
    if (image.length > 7_000_000) {
      throw new Error(
        "Uma das imagens é muito grande. Use imagens mais leves.",
      );
    }
  }

  return {
    id: existingId || `p${Date.now()}${crypto.randomBytes(3).toString("hex")}`,
    name,
    brand,
    category,
    gender,
    volume,
    price: Number(price.toFixed(2)),
    ...(isDecants
      ? {
          decantPrices: {
            5: Number(decantPrice5.toFixed(2)),
            10: Number(decantPrice10.toFixed(2)),
          },
          volume: 5,
        }
      : {}),
    originalPrice: originalPrice ? Number(originalPrice.toFixed(2)) : 0,
    stock,
    desc,
    olfactoryFamilies,
    isLaunch,
    isFeatured,
    image: images[0] || "",
    images,
  };
}

/* =========================================================
   BANNERS — APARÊNCIA DA LOJA
   Os banners ficam no servidor para que o painel administrativo
   seja a fonte oficial das imagens e destinos.
   ========================================================= */
const BANNERS_FILE = path.join(DATA_DIR, "banners.json");
const DEFAULT_BANNERS = [
  { image: "imgs/banner1.jpg", category: "" },
  { image: "imgs/banner2.jpg", category: "" },
  { image: "imgs/banner3.jpg", category: "" },
  { image: "imgs/banner4.jpg", category: "" },
];

const BANNER_CATEGORIES = new Set([
  "",
  "brand-masc",
  "brand-fem",
  "arabe-masc",
  "arabe-fem",
  "body-splash",
  "arabic-collection",
  "kits",
  "outlet",
  "decants",
  "compartilhaveis",
  "infantil",
]);

function ensureBannersFile() {
  const dir = path.dirname(BANNERS_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(BANNERS_FILE)) {
    fs.writeFileSync(
      BANNERS_FILE,
      JSON.stringify(DEFAULT_BANNERS, null, 2),
      "utf8",
    );
  }
}

function readBannersFile() {
  ensureBannersFile();

  try {
    const parsed = JSON.parse(fs.readFileSync(BANNERS_FILE, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("Formato inválido.");

    return DEFAULT_BANNERS.map((item, index) => ({
      ...item,
      ...(parsed[index] || {}),
    }));
  } catch (error) {
    console.error("Erro ao ler banners:", error);
    throw new Error("Não foi possível ler os banners.");
  }
}

function writeBannersFile(banners) {
  ensureBannersFile();

  const tempFile = `${BANNERS_FILE}.${process.pid}.${Date.now()}.tmp`;

  fs.writeFileSync(tempFile, JSON.stringify(banners, null, 2), "utf8");

  fs.renameSync(tempFile, BANNERS_FILE);
}

function bannersPublic(req, res) {
  try {
    return sendJson(res, 200, {
      source: "server",
      banners: readBannersFile(),
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}

async function adminBannerUpdate(req, res, index) {
  if (!requireAdmin(req, res)) return;

  const bannerIndex = Number(index);

  if (
    !Number.isInteger(bannerIndex) ||
    bannerIndex < 0 ||
    bannerIndex >= DEFAULT_BANNERS.length
  ) {
    return sendJson(res, 400, { error: "Índice de banner inválido." });
  }

  let payload;

  try {
    // A imagem é enviada como data URL depois de ser comprimida no navegador.
    payload = await readJson(req, 16 * 1024 * 1024);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const category = String(payload?.category ?? "").trim();
  const image =
    payload?.image === undefined
      ? undefined
      : String(payload.image || "").trim();

  if (!BANNER_CATEGORIES.has(category)) {
    return sendJson(res, 400, { error: "Categoria de destino inválida." });
  }

  if (image !== undefined) {
    if (!image) {
      return sendJson(res, 400, { error: "A imagem do banner é obrigatória." });
    }

    // Aceita imagens enviadas pelo painel como data URL ou caminhos locais
    // já existentes no projeto. Limita o payload para evitar arquivos acidentais.
    const validDataUrl = /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(
      image,
    );
    const validLocalPath = /^(?:\.\/)?imgs\/[^\\/]+\.(?:jpe?g|png|webp)$/i.test(
      image,
    );

    if (!validDataUrl && !validLocalPath) {
      return sendJson(res, 400, {
        error: "Formato de imagem inválido. Selecione uma imagem pelo painel.",
      });
    }

    if (image.length > 7_000_000) {
      return sendJson(res, 400, {
        error: "A imagem é muito grande. Use uma imagem mais leve.",
      });
    }
  }

  try {
    const banners = readBannersFile();
    banners[bannerIndex] = {
      ...banners[bannerIndex],
      category,
      ...(image !== undefined ? { image } : {}),
    };

    writeBannersFile(banners);

    return sendJson(res, 200, {
      ok: true,
      banner: banners[bannerIndex],
      banners,
    });
  } catch (error) {
    console.error("Erro ao salvar banner:", error);
    return sendJson(res, 500, { error: "Não foi possível salvar o banner." });
  }
}

/* =========================================================
   FAMÍLIAS OLFATIVAS — gerenciamento independente
   ========================================================= */
const OLFACTORY_FAMILIES_FILE = path.join(DATA_DIR, "olfactory-families.json");

function ensureOlfactoryFamiliesFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(OLFACTORY_FAMILIES_FILE)) {
    fs.writeFileSync(OLFACTORY_FAMILIES_FILE, "[]", "utf8");
  }
}
function readOlfactoryFamilies() {
  ensureOlfactoryFamiliesFile();
  const parsed = JSON.parse(fs.readFileSync(OLFACTORY_FAMILIES_FILE, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}
function writeOlfactoryFamilies(families) {
  ensureOlfactoryFamiliesFile();
  const temp = `${OLFACTORY_FAMILIES_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(families, null, 2), "utf8");
  fs.renameSync(temp, OLFACTORY_FAMILIES_FILE);
}
function normalizeFamily(payload, previous = {}) {
  const name = String(payload?.name ?? previous.name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const description = String(
    payload?.description ?? previous.description ?? "",
  ).trim();
  const image = String(payload?.image ?? previous.image ?? "").trim();
  const order = Math.max(0, Number(payload?.order ?? previous.order ?? 0) || 0);
  const active =
    payload?.active === undefined
      ? previous.active !== false
      : Boolean(payload.active);
  const productIds = Array.isArray(payload?.productIds)
    ? [
        ...new Set(
          payload.productIds.map((id) => String(id).trim()).filter(Boolean),
        ),
      ]
    : Array.isArray(previous.productIds)
      ? previous.productIds
      : [];
  if (name.length < 2 || name.length > 80)
    throw new Error("Informe um nome de família entre 2 e 80 caracteres.");
  if (description.length > 240)
    throw new Error("A descrição deve ter no máximo 240 caracteres.");
  if (image.length > 4_000_000) throw new Error("A imagem é muito grande.");
  return {
    id: String(
      payload?.id ||
        previous.id ||
        `olf-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    ),
    name,
    description,
    image,
    order,
    active,
    productIds,
    updatedAt: new Date().toISOString(),
    createdAt: previous.createdAt || new Date().toISOString(),
  };
}
function syncFamilyProducts(families) {
  const products = readCatalogFile();
  const productFamilies = new Map();
  for (const family of families) {
    if (family.active === false) continue;
    for (const productId of family.productIds || []) {
      if (!productFamilies.has(productId)) productFamilies.set(productId, []);
      productFamilies.get(productId).push(family.name);
    }
  }
  const updated = products.map((product) => ({
    ...product,
    olfactoryFamilies: productFamilies.get(String(product.id)) || [],
  }));
  writeCatalogFile(updated);
}
async function adminOlfactoryAssignment(req, res) {
  if (!requireAdmin(req, res)) return;
  let payload;
  try {
    payload = await readJson(req, 10000);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
  const productId = String(payload?.productId || "").trim();
  const familyId = String(payload?.familyId || "").trim();
  if (!productId || !familyId)
    return sendJson(res, 400, {
      error: "Selecione um produto e uma família olfativa.",
    });
  try {
    const families = readOlfactoryFamilies();
    const family = families.find((item) => String(item.id) === familyId);
    const products = readCatalogFile();
    const product = products.find((item) => String(item.id) === productId);
    if (!family || family.active === false)
      return sendJson(res, 404, {
        error: "Família olfativa não encontrada ou inativa.",
      });
    if (!product)
      return sendJson(res, 404, {
        error: "Produto não encontrado no catálogo.",
      });
    // A interface define uma família por produto: remove associações anteriores
    // para este produto e registra a família escolhida agora.
    for (const item of families) {
      item.productIds = (
        Array.isArray(item.productIds) ? item.productIds : []
      ).filter((id) => String(id) !== productId);
    }
    family.productIds = [
      ...new Set([
        ...(Array.isArray(family.productIds) ? family.productIds : []),
        productId,
      ]),
    ];
    family.updatedAt = new Date().toISOString();
    writeOlfactoryFamilies(families);
    syncFamilyProducts(families);
    return sendJson(res, 200, {
      ok: true,
      productId,
      familyId,
      family: family.name,
      product: product.name,
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error.message || "Não foi possível associar o produto à família.",
    });
  }
}

function publicOlfactoryFamilies(req, res) {
  try {
    const families = readOlfactoryFamilies()
      .filter((family) => family.active !== false)
      .sort(
        (a, b) =>
          (Number(a.order) || 0) - (Number(b.order) || 0) ||
          a.name.localeCompare(b.name, "pt-BR"),
      );
    return sendJson(res, 200, { families });
  } catch (error) {
    return sendJson(res, 500, {
      error: "Não foi possível carregar as famílias olfativas.",
    });
  }
}
function adminOlfactoryFamiliesList(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    return sendJson(res, 200, {
      families: readOlfactoryFamilies(),
      products: readCatalogFile(),
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: "Não foi possível carregar as famílias olfativas.",
    });
  }
}
async function adminOlfactoryFamilySave(req, res, id = "") {
  if (!requireAdmin(req, res)) return;
  let payload;
  try {
    payload = await readJson(req, 6 * 1024 * 1024);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
  try {
    const families = readOlfactoryFamilies();
    const familyId = decodeURIComponent(String(id || payload?.id || ""));
    const index = familyId ? families.findIndex((f) => f.id === familyId) : -1;
    if (familyId && index < 0)
      return sendJson(res, 404, { error: "Família olfativa não encontrada." });
    const family = normalizeFamily(payload, index >= 0 ? families[index] : {});
    const duplicate = families.some(
      (f, i) =>
        i !== index &&
        f.name.toLocaleLowerCase("pt-BR") ===
          family.name.toLocaleLowerCase("pt-BR"),
    );
    if (duplicate)
      return sendJson(res, 409, {
        error: "Já existe uma família com esse nome.",
      });
    if (index >= 0) families[index] = family;
    else families.push(family);
    writeOlfactoryFamilies(families);
    syncFamilyProducts(families);
    return sendJson(res, index >= 0 ? 200 : 201, { ok: true, family });
  } catch (error) {
    return sendJson(res, 400, {
      error: error.message || "Não foi possível salvar a família.",
    });
  }
}
function adminOlfactoryFamilyDelete(req, res, id) {
  if (!requireAdmin(req, res)) return;
  const familyId = decodeURIComponent(String(id || ""));
  try {
    const families = readOlfactoryFamilies();
    if (!families.some((f) => f.id === familyId))
      return sendJson(res, 404, { error: "Família olfativa não encontrada." });
    const remaining = families.filter((f) => f.id !== familyId);
    writeOlfactoryFamilies(remaining);
    syncFamilyProducts(remaining);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: "Não foi possível excluir a família." });
  }
}

function productsPublic(req, res) {
  try {
    return sendJson(res, 200, {
      source: "server",
      products: readCatalogFile(),
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error.message,
    });
  }
}

function adminCustomersList(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const query = String(url.searchParams.get("q") || "")
      .trim()
      .toLowerCase();
    const customers = readCustomersFile();
    const orders = readOrdersFile();

    const result = customers
      .map((customer) => {
        const email = normalizeCustomerEmail(customer.email);
        const customerOrders = orders
          .filter(
            (order) => normalizeCustomerEmail(order?.customer?.email) === email,
          )
          .sort((a, b) =>
            String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
          );

        return {
          ...sanitizeCustomer(customer),
          orderCount: customerOrders.length,
          lastOrderAt: customerOrders[0]?.createdAt || null,
          orders: customerOrders.map((order) => ({
            order_nsu: order.order_nsu,
            status: order.status,
            amount: order.amount,
            createdAt: order.createdAt,
          })),
        };
      })
      .filter((customer) => {
        if (!query) return true;
        return [customer.name, customer.email, customer.phone].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(query),
        );
      })
      .sort((a, b) =>
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
      );

    return sendJson(res, 200, { customers: result });
  } catch (error) {
    console.error("Erro ao listar clientes no admin:", error);
    return sendJson(res, 500, {
      error: "Não foi possível carregar os clientes.",
    });
  }
}

const MAX_LAUNCH_PRODUCTS = 10;
const MAX_FEATURED_PRODUCTS = 6;

function enforceLaunchLimit(products) {
  let kept = 0;
  let changed = false;
  const normalized = products.map((product) => {
    if (product?.isLaunch === true) {
      kept += 1;
      if (kept > MAX_LAUNCH_PRODUCTS) {
        changed = true;
        return { ...product, isLaunch: false };
      }
    }
    return product;
  });
  return { products: normalized, changed };
}

function validateLaunchCapacity(products, candidate, currentId = null) {
  if (candidate?.isLaunch !== true) return;
  const count = products.filter(
    (product) =>
      product?.isLaunch === true &&
      String(product.id) !== String(currentId ?? ""),
  ).length;
  if (count >= MAX_LAUNCH_PRODUCTS) {
    throw new Error(
      "A área de Lançamentos está totalmente preenchida (10 produtos). Remova primeiro um produto que já esteja em Lançamentos para incluir outro.",
    );
  }
}

function enforceFeaturedLimit(products) {
  let kept = 0;
  let changed = false;
  const normalized = products.map((product) => {
    if (product?.isFeatured === true) {
      kept += 1;
      if (kept > MAX_FEATURED_PRODUCTS) {
        changed = true;
        return { ...product, isFeatured: false };
      }
    }
    return product;
  });
  return { products: normalized, changed };
}

function validateFeaturedCapacity(products, candidate, currentId = null) {
  if (candidate?.isFeatured !== true) return;
  const count = products.filter(
    (product) =>
      product?.isFeatured === true &&
      String(product.id) !== String(currentId ?? ""),
  ).length;
  if (count >= MAX_FEATURED_PRODUCTS) {
    throw new Error(
      "A área de Destaques está totalmente preenchida (6 produtos). Remova primeiro um produto que já esteja em Destaques para incluir outro.",
    );
  }
}

function adminProductsList(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    const current = readCatalogFile();
    const limitedLaunches = enforceLaunchLimit(current);
    const limitedFeatured = enforceFeaturedLimit(limitedLaunches.products);
    // Corrige marcações antigas acima dos limites para impedir fila de espera.
    if (limitedLaunches.changed || limitedFeatured.changed)
      writeCatalogFile(limitedFeatured.products);
    return sendJson(res, 200, {
      products: limitedFeatured.products,
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error.message,
    });
  }
}

async function adminProductCreate(req, res) {
  if (!requireAdmin(req, res)) return;

  let payload;

  try {
    payload = await readJson(req, 16 * 1024 * 1024);
  } catch (error) {
    return sendJson(res, 400, {
      error: error.message,
    });
  }

  try {
    const products = readCatalogFile();
    const product = normalizeProduct(payload);
    validateLaunchCapacity(products, product);
    validateFeaturedCapacity(products, product);

    products.push(product);
    writeCatalogFile(products);

    return sendJson(res, 201, {
      ok: true,
      product,
    });
  } catch (error) {
    return sendJson(res, 400, {
      error: error.message,
    });
  }
}

async function adminProductUpdate(req, res, id) {
  if (!requireAdmin(req, res)) return;
  const productId = decodeURIComponent(String(id || ""));
  let payload;
  try {
    payload = await readJson(req, 16 * 1024 * 1024);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
  try {
    const products = readCatalogFile();
    const index = products.findIndex((item) => item.id === productId);
    if (index === -1)
      return sendJson(res, 404, { error: "Produto não encontrado." });
    const product = normalizeProduct(
      { ...products[index], ...payload, id: productId },
      productId,
    );
    validateLaunchCapacity(products, product, productId);
    validateFeaturedCapacity(products, product, productId);
    writeCatalogFile(products.map((item, i) => (i === index ? product : item)));
    return sendJson(res, 200, { ok: true, product });
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }
}

function adminProductDelete(req, res, id) {
  if (!requireAdmin(req, res)) return;

  const productId = decodeURIComponent(String(id || ""));

  try {
    const products = readCatalogFile();
    const product = products.find((item) => item.id === productId);

    if (!product) {
      return sendJson(res, 404, {
        error: "Produto não encontrado.",
      });
    }

    writeCatalogFile(products.filter((item) => item.id !== productId));

    return sendJson(res, 200, {
      ok: true,
      removedId: productId,
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error.message,
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
      error: error.message,
    });
  }

  if (!Array.isArray(payload?.products)) {
    return sendJson(res, 400, {
      error: "Envie um catálogo válido.",
    });
  }

  try {
    const products = payload.products.map((item) =>
      normalizeProduct(
        item,
        String(
          item?.id || `p${Date.now()}${crypto.randomBytes(3).toString("hex")}`,
        ),
      ),
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
      imported: unique.length,
    });
  } catch (error) {
    return sendJson(res, 400, {
      error: error.message,
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
  ".json": "application/json; charset=utf-8",
};

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname,
    );
  } catch {
    res.writeHead(400);
    return res.end("URL inválida");
  }

  if (pathname === "/") pathname = "/index.html";

  // Never expose dotfiles, backups, server-side code/configuration, cookies,
  // or persistent customer/order data through the public static-file handler.
  const normalizedPath = pathname.replace(/\\/g, "/");
  const segments = normalizedPath.split("/").filter(Boolean);
  const basename = segments.at(-1) || "";
  const blockedExact = new Set([
    "/server.js",
    "/package.json",
    "/package-lock.json",
    "/data",
    "/data/",
    "/catalog.json",
    "/orders.json",
    "/customers.json",
  ]);
  const blockedSegments = segments.some(
    (segment) =>
      segment.startsWith(".") ||
      segment.toLowerCase() === "node_modules" ||
      segment.toLowerCase() === "data" ||
      /backup/i.test(segment) ||
      segment.toLowerCase() === "cookies.txt",
  );
  const sensitiveFilename =
    /(?:^|\/)(?:server(?:[^/]*)?\.js|package(?:-lock)?\.json|orders(?:\.json)?|customers(?:\.json)?|catalog(?:\.json)?|cookies(?:[-_.].*)?|.*\.env(?:\..*)?)$/i.test(
      normalizedPath,
    );
  if (
    blockedExact.has(normalizedPath) ||
    blockedSegments ||
    sensitiveFilename ||
    /\.(?:log|pem|key|sqlite|db|tmp)$/i.test(normalizedPath)
  ) {
    res.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    return res.end("Arquivo não encontrado");
  }

  if (pathname === "/admin" || pathname === "/admin/") {
    res.writeHead(302, { Location: "/admin/index.html" });
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
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function superfreteCartProbe(req, res) {
  if (!requireAdmin(req, res)) return;
  return sendJson(res, 200, {
    probe: true,
    configured: Boolean(SUPERFRETE_TOKEN),
    endpoint: SUPERFRETE_CART_API_URL,
    note: "Diagnóstico local apenas. Nenhuma requisição de criação de etiqueta foi enviada.",
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    // Same-origin app: do not enable cross-origin API access by default.
    res.writeHead(204, {
      Allow: "GET, POST, PATCH, DELETE, OPTIONS",
      Vary: "Origin",
      "X-Content-Type-Options": "nosniff",
    });
    return res.end();
  }

  const pathname = req.url.split("?")[0];
  if (req.method === "GET" && pathname === "/api/admin/superfrete/cart-probe") {
    return superfreteCartProbe(req, res);
  }

  if (req.method === "POST" && pathname === "/api/infinitepay/checkout/links") {
    return createInfinitePayCheckout(req, res);
  }

  if (req.method === "POST" && pathname === "/api/infinitepay/payment-check") {
    return checkInfinitePayPayment(req, res);
  }

  if (req.method === "POST" && pathname === "/api/infinitepay/webhook") {
    return infinitePayWebhook(req, res);
  }

  // GET deve ser somente leitura: atualização de status exige PATCH.
  // Isso evita alterações de estado por links, prefetchers ou requisições GET acidentais.
  if (
    req.method === "GET" &&
    pathname.startsWith("/api/admin/orders/") &&
    pathname.endsWith("/status")
  ) {
    res.setHeader("Allow", "PATCH");
    return sendJson(res, 405, {
      error:
        "Método não permitido. Use PATCH para atualizar o status do pedido.",
    });
  }

  if (
    req.method === "POST" &&
    pathname.startsWith("/api/admin/orders/") &&
    pathname.endsWith("/superfrete")
  ) {
    const orderNsu = pathname.slice(
      "/api/admin/orders/".length,
      -"/superfrete".length,
    );
    return adminSuperfreteCreateCart(req, res, decodeURIComponent(orderNsu));
  }

  if (
    req.method === "POST" &&
    pathname.startsWith("/api/admin/orders/") &&
    pathname.endsWith("/superfrete/simulate-payment")
  ) {
    const orderNsu = pathname.slice(
      "/api/admin/orders/".length,
      -"/superfrete/simulate-payment".length,
    );
    return adminSuperfreteSimulatePayment(
      req,
      res,
      decodeURIComponent(orderNsu),
    );
  }

  if (
    req.method === "POST" &&
    pathname.startsWith("/api/admin/orders/") &&
    pathname.endsWith("/superfrete/checkout")
  ) {
    const orderNsu = pathname.slice(
      "/api/admin/orders/".length,
      -"/superfrete/checkout".length,
    );
    return adminSuperfreteCheckout(req, res, decodeURIComponent(orderNsu));
  }

  if (
    req.method === "POST" &&
    pathname.startsWith("/api/admin/orders/") &&
    pathname.endsWith("/superfrete/refresh")
  ) {
    const orderNsu = pathname.slice(
      "/api/admin/orders/".length,
      -"/superfrete/refresh".length,
    );
    return adminSuperfreteOrderInfo(req, res, decodeURIComponent(orderNsu));
  }

  if (
    req.method === "PATCH" &&
    pathname.startsWith("/api/admin/orders/") &&
    pathname.endsWith("/tracking")
  ) {
    const orderNsu = pathname.slice(
      "/api/admin/orders/".length,
      -"/tracking".length,
    );
    return adminOrderTrackingUpdate(req, res, decodeURIComponent(orderNsu));
  }

  if (
    req.method === "PATCH" &&
    pathname.startsWith("/api/admin/orders/") &&
    pathname.endsWith("/status")
  ) {
    const orderNsu = pathname.slice(
      "/api/admin/orders/".length,
      -"/status".length,
    );
    return adminOrderStatusUpdate(req, res, decodeURIComponent(orderNsu));
  }

  if (req.method === "GET" && pathname === "/api/admin/orders") {
    return adminOrdersList(req, res);
  }

  if (req.method === "GET" && pathname.startsWith("/api/admin/orders/")) {
    return adminOrderDetail(
      req,
      res,
      decodeURIComponent(pathname.slice("/api/admin/orders/".length)),
    );
  }

  if (req.method === "GET" && pathname === "/api/customer/orders") {
    return getCustomerOrders(req, res);
  }

  if (req.method === "GET" && pathname.startsWith("/api/customer/orders/")) {
    return getCustomerOrder(
      req,
      res,
      decodeURIComponent(pathname.slice("/api/customer/orders/".length)),
    );
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

  if (req.method === "GET" && pathname === "/api/banners") {
    return bannersPublic(req, res);
  }

  if (req.method === "POST" && pathname.startsWith("/api/admin/banners/")) {
    const index = pathname.slice("/api/admin/banners/".length);
    return adminBannerUpdate(req, res, index);
  }

  if (req.method === "GET" && pathname === "/api/olfactory-families") {
    return publicOlfactoryFamilies(req, res);
  }

  if (req.method === "POST" && pathname === "/api/admin/olfactory-assignment") {
    return adminOlfactoryAssignment(req, res);
  }

  if (req.method === "GET" && pathname === "/api/admin/olfactory-families") {
    return adminOlfactoryFamiliesList(req, res);
  }

  if (req.method === "POST" && pathname === "/api/admin/olfactory-families") {
    return adminOlfactoryFamilySave(req, res);
  }

  if (
    req.method === "PUT" &&
    pathname.startsWith("/api/admin/olfactory-families/")
  ) {
    return adminOlfactoryFamilySave(
      req,
      res,
      pathname.slice("/api/admin/olfactory-families/".length),
    );
  }

  if (
    req.method === "DELETE" &&
    pathname.startsWith("/api/admin/olfactory-families/")
  ) {
    return adminOlfactoryFamilyDelete(
      req,
      res,
      pathname.slice("/api/admin/olfactory-families/".length),
    );
  }

  if (req.method === "GET" && pathname === "/api/products") {
    return productsPublic(req, res);
  }

  if (req.method === "GET" && pathname === "/api/admin/customers") {
    return adminCustomersList(req, res);
  }

  if (req.method === "GET" && pathname === "/api/admin/products") {
    return adminProductsList(req, res);
  }

  if (req.method === "POST" && pathname === "/api/admin/products") {
    return adminProductCreate(req, res);
  }

  if (req.method === "PUT" && pathname.startsWith("/api/admin/products/")) {
    const id = pathname.slice("/api/admin/products/".length);
    return adminProductUpdate(req, res, id);
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/admin/products/")) {
    const id = pathname.slice("/api/admin/products/".length);

    return adminProductDelete(req, res, id);
  }

  if (req.method === "POST" && pathname === "/api/admin/catalog/import") {
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
      infinitePayWebhookConfigured: Boolean(INFINITEPAY_WEBHOOK_URL),
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
