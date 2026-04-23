const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const qrcode = require("qrcode");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 7860;

let qrCodeURL = null;
let sessionID = null;
let sock = null;

app.use(express.static('public'));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("./session_auth");
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: "silent" }),
        browser: ["PODDA-MD", "Chrome", "1.1.0"]
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // QR එකක් ආවොත් ඒක URL එකකට හරවනවා
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
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) startBot();
        }
    });

    sock.ev.on("creds.update", saveCreds);
}

// Pairing Route
app.get("/pair", async (req, res) => {
    let num = req.query.number.replace(/[^0-9]/g, '');
    if (!num) return res.status(400).json({ error: "ENTER_NUMBER" });
    try {
        if (!sock) return res.status(503).json({ error: "STARTING_SYSTEM" });
        const code = await sock.requestPairingCode(num);
        res.json({ code });
    } catch (err) {
        res.status(500).json({ error: "WHATSAPP_BUSY: Try QR or wait." });
    }
});

app.get("/qr", (req, res) => res.json({ qr: qrCodeURL }));
app.get("/status", (req, res) => res.json({ id: sessionID }));

app.listen(PORT, () => {
    console.log(`Server live on ${PORT}`);
    startBot();
});
