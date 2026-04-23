const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} = require("@whiskeysockets/baileys");
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
    try {
        const { state, saveCreds } = await useMultiFileAuthState("./session_auth");
        const { version } = await fetchLatestBaileysVersion();
        
        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: true,
            logger: pino({ level: "silent" }),
            browser: ["PODDA-MD", "Chrome", "1.0.0"]
        });

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) qrCodeURL = await qrcode.toDataURL(qr);

            if (connection === "open") {
                console.log("✅ Connection Open!");
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
                console.log("❌ Connection closed. Reason:", reason);
                // පෑස් (Pause) නොවී ඔටෝම රීකනෙක්ට් වෙනවා
                if (reason !== DisconnectReason.loggedOut) {
                    startBot();
                }
            }
        });

        sock.ev.on("creds.update", saveCreds);

    } catch (err) {
        console.error("CRITICAL ERROR IN STARTBOT:", err);
        // සර්වර් එක මැරෙන්න දෙන්නේ නැතුව තත්පර 5කින් ආයේ ට්‍රයි කරනවා
        setTimeout(startBot, 5000);
    }
}

// Pairing Code ලබාගන්නා තැන (With Safety Guards)
app.get("/pair", async (req, res) => {
    let num = req.query.number.replace(/[^0-9]/g, '');
    
    // වැරදි නම්බර් එකක් ගැහුවොත්
    if (!num || num.length < 10) {
        return res.status(400).json({ error: "INVALID_NUMBER: Please enter a valid WhatsApp number." });
    }

    try {
        if (!sock) {
            return res.status(503).json({ error: "SYSTEM_NOT_READY: Please wait a moment." });
        }

        // Timeout එකක් දානවා රන් නොවී හිර වුණොත් කියලා
        const code = await Promise.race([
            sock.requestPairingCode(num),
            new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 20000))
        ]);

        res.json({ code });

    } catch (err) {
        console.error("Pairing Request Failed:", err.message);
        
        let errorMessage = "CONNECTION_ERROR: Please try again.";
        if (err.message === "TIMEOUT") errorMessage = "REQUEST_TIMEOUT: WhatsApp is taking too long.";
        if (err.message.includes("428")) errorMessage = "CONNECTION_CLOSED: Reconnecting, please wait.";
        
        // Error එක UI එකට යවනවා මිසක් සර්වර් එක නවත්වන්නේ නැහැ
        res.status(500).json({ error: errorMessage });
    }
});

app.get("/qr", (req, res) => res.json({ qr: qrCodeURL }));
app.get("/status", (req, res) => res.json({ id: sessionID }));

app.listen(PORT, () => {
    console.log(`🚀 PODDA-MD Server is running on port ${PORT}`);
    startBot();
});

// Unhandled errors නිසා සර්වර් එක මැරෙන එක වළක්වන්න
process.on('uncaughtException', (err) => {
    console.error('Caught exception:', err);
});
