const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const qrcode = require("qrcode");
const fs = require("fs");
const path = require("path");

const app = express();

// වැදගත්ම දේ: ඕනෑම ප්ලැට්ෆෝම් එකක පෝර්ට් එක ඔටෝම අල්ලගන්නවා
const PORT = process.env.PORT || 8000; 

let qrCodeURL = null;
let sessionID = null;
let sock = null;

app.use(express.static('public'));

async function startBot() {
    // Session Folder එක නැත්නම් හදනවා
    if (!fs.existsSync("./session_auth")) {
        fs.mkdirSync("./session_auth");
    }

    const { state, saveCreds } = await useMultiFileAuthState("./session_auth");
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        browser: ["PODDA-MD", "Chrome", "1.1.0"]
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrCodeURL = await qrcode.toDataURL(qr);
        }

        if (connection === "open") {
            const authPath = path.join(__dirname, "session_auth", "creds.json");
            await delay(5000);
            if (fs.existsSync(authPath)) {
                const authData = fs.readFileSync(authPath);
                sessionID = "PODDA-MD;;;" + Buffer.from(authData).toString("base64");
                await sock.sendMessage(sock.user.id, { text: `🚀 *PODDA-MD SESSION SUCCESS*\n\n\`${sessionID}\`` });
                console.log("✅ SESSION_ID_SENT");
            }
        }

        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode;
            // 401 (Logged Out) නෙමෙයි නම් විතරක් රීකනෙක්ට් වෙනවා
            if (reason !== DisconnectReason.loggedOut) {
                console.log("🔄 Reconnecting...");
                startBot();
            }
        }
    });

    sock.ev.on("creds.update", saveCreds);
}

// Routes
app.get("/pair", async (req, res) => {
    let num = req.query.number?.replace(/[^0-9]/g, '');
    if (!num) return res.status(400).json({ error: "INVALID_NUMBER" });

    try {
        if (!sock) return res.status(503).json({ error: "SYSTEM_STARTING" });
        const code = await sock.requestPairingCode(num);
        res.json({ code });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "CONNECTION_FAILED" });
    }
});

app.get("/qr", (req, res) => res.json({ qr: qrCodeURL }));
app.get("/status", (req, res) => res.json({ id: sessionID }));

// සර්වර් එක රන් කරනවා
app.listen(PORT, () => {
    console.log(`------------------------------------------`);
    console.log(`🚀 PODDA-MD IS LIVE ON PORT: ${PORT}`);
    console.log(`------------------------------------------`);
    startBot();
});
