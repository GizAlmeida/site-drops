const crypto = require("node:crypto");
const readline = require("node:readline");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(text, hidden = false) {
    if (!hidden) {
        return new Promise(resolve => rl.question(text, resolve));
    }

    return new Promise(resolve => {
        process.stdout.write(text);

        const stdin = process.stdin;
        const onData = char => {
            char = String(char);

            if (char === "\n" || char === "\r" || char === "\u0004") {
                stdin.setRawMode?.(false);
                stdin.pause();
                stdin.removeListener("data", onData);
                process.stdout.write("\n");
                resolve(password);
            } else if (char === "\u0003") {
                process.exit(1);
            } else if (char === "\u007f") {
                password = password.slice(0, -1);
            } else {
                password += char;
            }
        };

        let password = "";

        if (stdin.isTTY) {
            stdin.setRawMode(true);
            stdin.resume();
            stdin.on("data", onData);
        } else {
            rl.question("", answer => resolve(answer));
        }
    });
}

(async () => {
    const email = (await question("E-mail administrativo: ")).trim().toLowerCase();
    const password = await question("Senha administrativa: ", true);

    if (!email || !password) {
        console.error("E-mail e senha são obrigatórios.");
        rl.close();
        process.exit(1);
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const N = 16384;
    const r = 8;
    const p = 1;
    const keyLength = 64;

    const derived = crypto.scryptSync(password, salt, keyLength, {
        N,
        r,
        p
    });

    const hash = `scrypt$${N}$${r}$${p}$${salt}$${derived.toString("hex")}`;

    console.log("\nAdicione estas duas linhas ao seu .env:");
    console.log(`ADMIN_EMAIL=${email}`);
    console.log(`ADMIN_PASSWORD_HASH=${hash}`);
    console.log("\nNão envie esse hash nem o seu .env para ninguém.");
    rl.close();
})();
