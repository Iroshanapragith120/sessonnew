const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const qrcode = require("qrcode");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 8080; // Google Cloud Shell uses 8080
let qrCodeURL = null;
let sessionID = null;

app.use(express.static('public'));

async function startSession() {
    const { state, saveCreds } = await useMultiFileAuthState("./session_auth");
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: "silent" }),
        browser: ["PODDA-MD", "Safari", "1.0.0"]
    });

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrCodeURL = await qrcode.toDataURL(qr);

        if (connection === "open") {
            console.log("Connected!");
            const authData = fs.readFileSync("./session_auth/creds.json");
            sessionID = "PODDA-MD;;;" + Buffer.from(authData).toString("base64");
            
            // Send session ID to your own WhatsApp
            await sock.sendMessage(sock.user.id, { 
                text: `🚀 *PODDA-MD SESSION SUCCESS*\n\n\`${sessionID}\` \n\n> *Keep this safe!*` 
            });
            
            await delay(5000);
            process.exit(0); 
        }

        if (connection === "close") {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startSession();
        }
    });

    sock.ev.on("creds.update", saveCreds);
}

app.get("/qr", (req, res) => res.json({ qr: qrCodeURL }));
app.get("/status", (req, res) => res.json({ id: sessionID }));

app.listen(PORT, () => {
    console.log(`PODDA-MD Server running on port ${PORT}`);
    startSession();
});
