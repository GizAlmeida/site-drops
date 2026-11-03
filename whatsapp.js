/**
 * WhatsApp — Drops de Luxo
 * Adaptador para Evolution API
 *
 * Nesta etapa:
 * - Não altera server.js.
 * - Não dispara mensagens automaticamente.
 * - Apenas prepara o envio para uma instância da Evolution API.
 *
 * .env:
 * EVOLUTION_API_URL=https://SEU-ENDERECO
 * EVOLUTION_API_KEY=SEU_TOKEN
 * EVOLUTION_INSTANCE_NAME=DropsDeLuxo
 */

const EVOLUTION_API_URL = String(process.env.EVOLUTION_API_URL || "")
    .trim().replace(/\/+$/, "");
const EVOLUTION_API_KEY = String(process.env.EVOLUTION_API_KEY || "").trim();
const EVOLUTION_INSTANCE_NAME = String(
    process.env.EVOLUTION_INSTANCE_NAME || "DropsDeLuxo"
).trim();

function normalizeWhatsAppPhone(phone) {
    return String(phone || "").replace(/[^\d]/g, "").trim();
}

function isConfigured() {
    return Boolean(
        EVOLUTION_API_URL &&
        EVOLUTION_API_KEY &&
        EVOLUTION_INSTANCE_NAME
    );
}

async function sendWhatsAppMessage(to, message) {
    const recipient = normalizeWhatsAppPhone(to);
    const text = String(message || "").trim();

    if (!recipient) throw new Error("Número de WhatsApp do destinatário não informado.");
    if (!text) throw new Error("Mensagem de WhatsApp vazia.");

    if (!isConfigured()) {
        throw new Error(
            "Evolution API não configurada. Informe EVOLUTION_API_URL, " +
            "EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME no .env."
        );
    }

    const endpoint =
        `${EVOLUTION_API_URL}/message/sendText/` +
        encodeURIComponent(EVOLUTION_INSTANCE_NAME);

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "apikey": EVOLUTION_API_KEY
        },
        body: JSON.stringify({ number: recipient, text })
    });

    const responseText = await response.text();
    let data;
    try {
        data = responseText ? JSON.parse(responseText) : {};
    } catch {
        data = { raw: responseText };
    }

    if (!response.ok) {
        const detail =
            data?.response?.message ||
            data?.message ||
            data?.error ||
            `HTTP ${response.status}`;
        throw new Error(`Evolution API: ${detail}`);
    }

    return data;
}

function getWhatsAppStatus() {
    return {
        provider: "evolution-api",
        configured: isConfigured(),
        apiUrlConfigured: Boolean(EVOLUTION_API_URL),
        apiKeyConfigured: Boolean(EVOLUTION_API_KEY),
        instanceConfigured: Boolean(EVOLUTION_INSTANCE_NAME)
    };
}

module.exports = {
    sendWhatsAppMessage,
    getWhatsAppStatus,
    normalizeWhatsAppPhone
};
