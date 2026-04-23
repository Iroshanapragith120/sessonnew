const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const qrcode = require("qrcode");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 7860; // Hugging Face එකට අනිවාර්යයි

let qrCodeURL = null;
let sessionID = null;

app.use(express.static('public'));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("./session_auth");
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        browser: ["PODDA-MD", "Chrome", "1.0.0"]
    });

    app.get("/pair", async (req, res) => {
        let num = req.query.number.replace(/[^0-9]/g, '');
        if (!sock.authState.creds.registered) {
            await delay(1500);
            const code = await sock.requestPairingCode(num);
            res.json({ code });
        }
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrCodeURL = await qrcode.toDataURL(qr);
        if (connection === "open") {
            const authPath = path.join(__dirname, "session_auth", "creds.json");
            await delay(5000);
            if (fs.existsSync(authPath)) {
                const authData = fs.readFileSync(authPath);
                sessionID = "PODDA-MD;;;" + Buffer.from(authData).toString("base64");
                await sock.sendMessage(sock.user.id, { text: sessionID });
            }
        }
        if (connection === "close") {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        }
    });
    sock.ev.on("creds.update", saveCreds);
}

app.get("/qr", (req, res) => res.json({ qr: qrCodeURL }));
app.get("/status", (req, res) => res.json({ id: sessionID }));

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startBot();
});
