const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const qrcode = require("qrcode");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;
let qrCodeURL = null;
let pairCode = null;
let sessionID = null;

app.use(express.static('public'));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("./session_auth");
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: "silent" }),
        browser: ["PODDA-MD", "Chrome", "1.1.0"]
    });

    // Pairing Code logic
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
            await delay(2000); // Wait for file write
            if (fs.existsSync(authPath)) {
                const authData = fs.readFileSync(authPath);
                sessionID = "PODDA-MD;;;" + Buffer.from(authData).toString("base64");
                
                await sock.sendMessage(sock.user.id, { 
                    text: `🚀 *PODDA-MD SESSION SUCCESS*\n\n\`${sessionID}\` \n\n> *Keep this safe!*` 
                });
                console.log("Session Generated!");
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
    console.log(`Server started on ${PORT}`);
    startBot();
});
