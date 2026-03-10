const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, downloadMediaMessage, getContentType, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
// Enforce Santiago, Chile Timezone "a fuego"
process.env.TZ = 'America/Santiago';
const QRCode = require('qrcode'); // For web display
const path = require('path');
const fs = require('fs');
const express = require('express');
const pino = require('pino');
const { generateResponse } = require('./src/services/geminiService');

// Folder for storing credentials
const AUTH_FOLDER = 'auth_session_v2';
const PORT = process.env.PORT || 3000;

// Express Setup
const app = express();
let sock; // Global socket instance

// State for Web UI
let currentQR = null;
let isConnected = false;
const logs = []; // Log buffer

// 🛑 Memoria temporal para chats silenciados (Human Handoff)
const chatsSilenciados = new Set();

// ==========================================
// 🤫 MEMORIA DEL PACTO DE NO AGRESIÓN
// ==========================================
const chatsEnEncuesta = new Map();

// Historical Memory Storage
const chatHistory = {}; // Format: { jid: [{role, text}] }
const messageBuffers = {};
const bufferTimeouts = {};

// Log Capture Helper
function addLog(type, msg) {
    const time = new Date().toLocaleTimeString();
    logs.unshift(`[${time}] ${type}: ${msg}`);
    if (logs.length > 50) logs.pop();
}

// Cache for debounce
const lastCallResponse = {};

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

app.get('/', async (req, res) => {
    let htmlContent = `
        <html>
            <head>
                <title>Lucia Bot v2</title>
                <meta http-equiv="refresh" content="5">
                <style>
                    body { font-family: sans-serif; text-align: center; padding: 20px; }
                    img { border: 10px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
                    .status { font-weight: bold; font-size: 1.2em; margin-bottom: 20px; }
                    .connected { color: green; }
                    .disconnected { color: red; }
                    .logs { text-align: left; background: #f0f0f0; padding: 10px; margin-top: 20px; height: 300px; overflow-y: scroll; border: 1px solid #ccc; font-family: monospace; font-size: 0.9em; }
                    .log-entry { margin-bottom: 5px; border-bottom: 1px solid #ddd; }
                    .log-ERROR { color: red; }
                </style>
            </head>
            <body>
                <h1>🤖 Lucia Bot V2</h1>
    `;

    if (isConnected) {
        htmlContent += `<div class="status connected">✅ CONECTADO A WHATSAPP</div>`;
        htmlContent += `<p>El bot está operativo y listo para responder.</p>`;
        htmlContent += `<div style="margin-top:20px;padding:15px;border:1px solid #ccc;border-radius:8px;">`;
        htmlContent += `<h3>⚠️ Zona de Peligro</h3>`;
        htmlContent += `<p>Si necesitas cambiar de número o el bot no responde:</p>`;
        htmlContent += `<a href="/logout" onclick="return confirm('¿Seguro que quieres DESVINCULAR? Tendrás que escanear el QR de nuevo.')" style="background:#ff4444;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;font-weight:bold;">🔓 DESVINCULAR / LOGOUT</a>`;
        htmlContent += `</div>`;
    } else if (currentQR) {
        try {
            const qrImage = await QRCode.toDataURL(currentQR);
            htmlContent += `<div class="status disconnected">⚠️ ESCANEA EL CÓDIGO QR</div>`;
            htmlContent += `<img src="${qrImage}" alt="QR Code" />`;
            htmlContent += `<p>Abre WhatsApp > Dispositivos vinculados > Vincular dispositivo</p>`;
        } catch (err) {
            htmlContent += `<p>Error generando QR visual: ${err.message}</p>`;
        }
    } else {
        htmlContent += `<div class="status">⏳ Iniciando / Esperando QR...</div>`;
        htmlContent += `<p>La página se recargará automáticamente.</p>`;
    }

    htmlContent += `<br><p><small>¿problemas? <a href="/reset" onclick="return confirm('¿Seguro? Esto borrará la sesión.')">Reiniciar Sistema</a></small></p>`;

    htmlContent += `<h3>📜 Logs del Sistema (Últimos 50)</h3>`;
    htmlContent += `<div class="logs">`;
    logs.forEach(log => {
        const typeClass = log.includes('ERROR') ? 'log-ERROR' : 'log-INFO';
        htmlContent += `<div class="log-entry ${typeClass}">${log}</div>`;
    });
    htmlContent += `</div>`;

    htmlContent += `</body></html>`;
    res.send(htmlContent);
});

app.get('/api/missed-call', async (req, res) => {
    const { number, secret } = req.query;

    const validSecret = process.env.GEMINI_API_KEY;
    if (!secret || secret !== validSecret) {
        res.status(403).json({ error: 'Unauthorized: Invalid Secret' });
        return;
    }

    if (!number || typeof number !== 'string') {
        res.status(400).json({ error: 'Missing phone number' });
        return;
    }

    let cleanNumber = number.replace(/\D/g, '');
    if (cleanNumber.length === 9 && cleanNumber.startsWith('9')) cleanNumber = '56' + cleanNumber;
    else if (cleanNumber.length === 8) cleanNumber = '569' + cleanNumber;

    const targetChatId = `${cleanNumber}@s.whatsapp.net`;

    const now = Date.now();
    if (lastCallResponse[targetChatId] && (now - lastCallResponse[targetChatId] < 10000)) {
        console.log(`⏳ Webhook ignorado por duplicado (Debounce): ${cleanNumber}`);
        res.json({ success: true, status: 'debounced' });
        return;
    }

    const message = "Hola soy Lucía de clínica Biodens vi una llamada perdida de este número cuéntame en qué te puedo ayudar.";

    try {
        if (!sock) throw new Error('WhatsApp socket not initialized');
        console.log(`📡 Webhook Triggered for: ${cleanNumber}`);
        addLog('WEBHOOK', `Trigger for ${cleanNumber}`);
        await sock.sendMessage(targetChatId, { text: message });
        lastCallResponse[targetChatId] = now;
        res.json({ success: true, target: targetChatId });
    } catch (error) {
        console.error('❌ Error Webhook:', error);
        addLog('ERROR', `Webhook: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.get('/reset', async (req, res) => {
    try {
        console.log('⚠️ RESET SOLICITADO');
        await fs.promises.rm(AUTH_FOLDER, { recursive: true, force: true });
        res.send('Sesión y archivos borrados. El sistema se reiniciará en 5 segundos. Vuelve al inicio en 1 minuto.');
        setTimeout(() => process.exit(1), 2000);
    } catch (e) {
        res.status(500).send('Error: ' + e.message);
    }
});

app.get('/logout', async (req, res) => {
    if (sock) {
        try {
            console.log('⚠️ LOGOUT SOLICITADO VIA WEB');
            addLog('WARNING', 'Usuario solicitó desvincular dispositivo...');
            await sock.logout();
            res.send('<h1>✅ Desvinculando...</h1><p>El bot cerrará sesión y generará un nuevo QR en 10 segundos.</p><script>setTimeout(() => window.location.href = "/", 10000);</script>');
        } catch (e) {
            res.status(500).send('Error al desvincular: ' + e.message);
        }
    } else {
        res.redirect('/');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor Web escuchando en puerto ${PORT} (0.0.0.0)`);
});

// ============================================================================
// 🚀 NUEVA FUNCIÓN: PROCESAR MENSAJE AGRUPADO (Extraída para ser reutilizable)
// ============================================================================
async function procesarMensajeAgrupado(jid) {
    if (!messageBuffers[jid]) return; // Medida de seguridad

    const combinedText = messageBuffers[jid].texts.join(' \n ');
    const finalMedia = messageBuffers[jid].media;
    const lastMsg = messageBuffers[jid].msgs[messageBuffers[jid].msgs.length - 1];

    // Vaciamos la memoria
    delete messageBuffers[jid];
    delete bufferTimeouts[jid];

    console.log(`📦 Bloque de mensajes cerrado para ${jid.split('@')[0]}: "${combinedText}"`);

    // Mostrar feedback visual de "Procesando..." para evitar silencios incómodos
    try {
        await sock.sendPresenceUpdate('composing', jid);

        // Solo enviar el texto visual si el usuario parece estar interactuando con agendamientos
        const includesAgendaWords = /agend|hora|cit|cup|sobrecup|eval|dol|urgenc/i.test(combinedText);
        if (includesAgendaWords) {
            if (/(hola|buen|ola|holi)/i.test(combinedText)) {
                await sock.sendMessage(jid, { text: "¡Hola! 👋" });
            }
            await sock.sendMessage(jid, { text: "_⏳ Consultando la agenda, un momento por favor..._" });
        }
    } catch (e) {
        console.error("Error enviando feedback de procesamiento:", e);
    }

    try {
        const currentContext = chatHistory[jid] || [];

        let aiResponse = await generateResponse(combinedText, currentContext, finalMedia, sock);
        console.log(`🤖 Respuesta cruda de Gemini:\n${aiResponse}\n-------------------`);

        // 1. Nuevo Regex exclusivo para problemas de agenda llena
        const ID_GRUPO_AGENDA = "120363407514449745@g.us";
        const agendaRegex = /\[ALERTA_AGENDA_LLENA:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\]/;
        const matchAgenda = aiResponse.match(agendaRegex);

        if (matchAgenda) {
            const nombrePaciente = matchAgenda[1].trim();
            const telefonoPaciente = matchAgenda[2].trim();
            const diaSolicitado = matchAgenda[3].trim();
            const numeroLimpio = telefonoPaciente.replace(/\D/g, '');

            const mensajeAgendaLlena = `⚠️ *PACIENTE NO PUDO AGENDAR (AGENDA LLENA)* ⚠️\n\n*Paciente:* ${nombrePaciente}\n*Teléfono:* ${telefonoPaciente}\n*Día solicitado:* ${diaSolicitado}\n*Estado:* No hay cupos normales ni sobrecupos disponibles.\n*Chat directo:* wa.me/${numeroLimpio}`;

            try {
                await sock.sendMessage(ID_GRUPO_AGENDA, { text: mensajeAgendaLlena });
                console.log(`✅ Alerta de agenda llena enviada para: ${nombrePaciente}`);
            } catch (error) {
                console.error("❌ Error enviando alerta de agenda:", error);
            }

            // Limpiamos el tag para que el paciente no lo vea
            aiResponse = aiResponse.replace(matchAgenda[0], '').trim();
        }

        const escalateRegex = /\[ESCALATE_TO_HUMAN:\s*([\s\S]*?)\]/;
        const escalateMatch = aiResponse.match(escalateRegex);

        if (escalateMatch) {
            const extractedData = escalateMatch[1].trim();
            let patientName = "Paciente";
            let patientPhone = "No especificado";
            let reason = "Derivación a Isabel";

            if (extractedData.includes('|')) {
                const parts = extractedData.split('|').map(p => p.trim());
                if (parts.length >= 3) {
                    patientName = parts[0];
                    patientPhone = parts[1];
                    reason = parts.slice(2).join(' | ');
                } else if (parts.length === 2) {
                    patientName = parts[0];
                    reason = parts[1];
                }
            } else {
                reason = extractedData;
            }

            let formattedPhone = patientPhone;
            const digitsOnly = patientPhone.replace(/\D/g, '');

            if (digitsOnly.length === 9) {
                formattedPhone = `+56 9 ${digitsOnly.slice(1, 5)} ${digitsOnly.slice(5)}`;
            } else if (digitsOnly.length === 11 && digitsOnly.startsWith('56')) {
                formattedPhone = `+56 9 ${digitsOnly.slice(3, 7)} ${digitsOnly.slice(7)}`;
            }

            console.log(`🚨 Escalando a Isabel: ${patientName} - ${formattedPhone} - ${reason}`);

            const groupId = process.env.ISABEL_GROUP_ID;
            if (groupId) {
                const notification = `🔔 *DERIVACIÓN A ISABEL*\n\n` +
                    `👤 *Nombre:* ${patientName}\n` +
                    `📱 *Teléfono:* ${formattedPhone}\n` +
                    `📋 *Motivo:* ${reason}`;

                try {
                    await sock.sendMessage(groupId, { text: notification });
                    console.log(`✅ Notificación enviada exitosamente al grupo de Isabel (${groupId})`);
                    addLog('INFO', `Derivación enviada a grupo: ${patientName}`);
                } catch (err) {
                    console.error(`❌ Error enviando mensaje al grupo ${groupId}:`, err);
                    addLog('ERROR', `Fallo al enviar al grupo de Isabel. Verifica permisos.`);
                }
            } else {
                console.error('❌ ISABEL_GROUP_ID no configurado en las variables de entorno');
                addLog('ERROR', 'Falta la variable ISABEL_GROUP_ID en Railway.');
            }

            aiResponse = aiResponse.replace(escalateRegex, '').trim();
        }

        // Dejamos de simular que escribimos
        await sock.sendPresenceUpdate('paused', jid);

        if (aiResponse) {
            await sock.sendMessage(jid, { text: aiResponse });

            if (!chatHistory[jid]) chatHistory[jid] = [];
            chatHistory[jid].push({ role: 'user', text: combinedText });
            chatHistory[jid].push({ role: 'model', text: aiResponse });

            if (chatHistory[jid].length > 10) {
                chatHistory[jid] = chatHistory[jid].slice(-10);
            }
        }
    } catch (error) {
        console.error('Error enviando respuesta a WhatsApp:', error);
        addLog('ERROR', `Generando respuesta: ${error.message}`);
    }
}
// ============================================================================

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`📡 Usando WA v${version.join('.')}, isLatest: ${isLatest}`);

    sock = makeWASocket({
        version,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'),
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 60000
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            addLog('INFO', 'Generando nuevo QR... (ver web)');
            currentQR = qr;
            isConnected = false;
        }

        if (connection === 'close') {
            isConnected = false;
            currentQR = null;
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 405;

            console.log('Conexión cerrada due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            addLog('WARNING', `Desconexión: ${statusCode || 'Unknown'}`);

            if (shouldReconnect) {
                if (statusCode === 408) {
                    console.log('⏳ QR Timeout detectado (408). Borrando credenciales y esperando 30 segundos antes de reconectar para no saturar el servidor...');
                    addLog('WARNING', 'QR Timeout (408) - Esperando 30s');
                    setTimeout(async () => {
                        try {
                            await fs.promises.rm(AUTH_FOLDER, { recursive: true, force: true });
                        } catch (err) {
                            console.error('Error limpiando credenciales tras 408:', err);
                        }
                        startSock();
                    }, 30000);
                } else {
                    console.log('🔄 Reconectando en 5 segundos...');
                    setTimeout(startSock, 5000);
                }
            } else {
                console.log('Sesión cerrada o inválida (401). Borrando credenciales y reiniciando...');
                try {
                    await fs.promises.rm(AUTH_FOLDER, { recursive: true, force: true });
                    startSock();
                } catch (err) {
                    console.error('Error credentials:', err);
                    addLog('ERROR', `Credentials cleanup failed: ${err.message}`);
                }
            }
        }

        if (connection === 'open') {
            isConnected = true;
            currentQR = null;

            console.log('✅ Lucía conectada exitosamente a Clínica Biodens');
            addLog('INFO', 'Conexión establecida exitosamente.');

            // Escáner temporal de Grupos de WhatsApp
            try {
                const groups = await sock.groupFetchAllParticipating();
                console.log('\n=== 📋 LISTA DE GRUPOS DEL BOT ===');
                for (const id in groups) {
                    console.log(`Nombre: "${groups[id].subject}"  |  ID: ${id}`);
                }
                console.log('==================================\n');
            } catch (error) {
                console.error('Error obteniendo la lista de grupos:', error);
            }

            const now = new Date();
            const dia = now.getDay();
            const hora = now.getHours();
            const min = now.getMinutes();

            let activarTeresa = false;

            if (dia >= 1 && dia <= 3) {
                if (hora > 16 || (hora === 16 && min >= 30)) activarTeresa = true;
            } else if (dia === 4) {
                if (hora > 17 || (hora === 17 && min >= 15)) activarTeresa = true;
            } else if (dia === 5) {
                if (hora > 16 || (hora === 16 && min >= 15)) activarTeresa = true;
            }

            if (activarTeresa) {
                const grupoId = '120363408250412374@g.us';

                sock.sendMessage(grupoId, {
                    text: '🤖 Sistema Lucía activo. Teresa, ya puedes iniciar el barrido de encuestas de hoy.'
                }).then(() => {
                    console.log('📢 Señal de fin de jornada enviada a Teresa.');
                    addLog('INFO', 'Grito de guerra enviado (Turno Tarde).');
                }).catch(err => {
                    console.log("⚠️ Error al avisar a Teresa:", err);
                    addLog('ERROR', 'Fallo al enviar señal a Teresa.');
                });
            } else {
                const minTxt = min < 10 ? '0' + min : min;
                console.log(`🕒 Conexión a las ${hora}:${minTxt} hrs. Modo silencioso activo. Teresa no fue despertada.`);
                addLog('INFO', `Conexión sin grito de guerra (${hora}:${minTxt}).`);
            }
        }
    });

    sock.ev.on('call', async (call) => {
        const { id, from, status } = call[0];
        if (status === 'offer') {
            console.log(`📞 Llamada de WhatsApp entrante de: ${from}`);
            addLog('INFO', `Llamada entrante de ${from}`);

            setTimeout(async () => {
                const message = "Hola soy Lucía de clínica Biodens vi una llamada de WhatsApp de este número cuéntame en qué te puedo ayudar.";
                try {
                    await sock.sendMessage(from, { text: message });
                    addLog('INFO', `Mensaje de llamada perdida enviado a ${from}`);
                } catch (error) {
                    console.error('Error al enviar mensaje de llamada perdida:', error);
                }
            }, 5000);
        }
    });

    // ============================================================================
    // 👁️ OREJA 1: DETECTOR DE ESCRITURA (PRESENCE UPDATE)
    // ============================================================================
    sock.ev.on('presence.update', (update) => {
        const jid = update.id;

        // Blindaje contra errores si update.presences viene vacío
        const presence = update.presences?.[jid]?.lastKnownPresence;

        // Si el paciente tiene un mensaje en la memoria y vemos que está escribiendo
        if (messageBuffers[jid] && presence === 'composing') {
            console.log(`👀 Viendo a ${jid.split('@')[0]} teclear... reiniciando paciencia a 5 segundos.`);

            if (bufferTimeouts[jid]) {
                clearTimeout(bufferTimeouts[jid]); // Detenemos el reloj anterior
            }

            // Arrancamos el cronómetro nuevamente a 0.5 segundos
            bufferTimeouts[jid] = setTimeout(() => {
                procesarMensajeAgrupado(jid);
            }, 500);
        }
    });

    // ============================================================================
    // 👂 OREJA 2: RECEPTOR DE MENSAJES (MESSAGES UPSERT)
    // ============================================================================
    sock.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];

                if (!msg.message) return;

                const remitente = msg.key.remoteJid;
                const conversationType = getContentType(msg.message);
                let textMessage = null;
                let media = null;

                if (conversationType === 'conversation') {
                    textMessage = msg.message.conversation;
                } else if (conversationType === 'extendedTextMessage') {
                    textMessage = msg.message.extendedTextMessage?.text;
                } else if (conversationType === 'audioMessage') {
                    console.log('🎙️ Audio recibido. Procesando...');
                    addLog('INFO', 'Audio recibido...');
                    const buffer = await downloadMediaMessage(msg, 'buffer', {});
                    media = { data: buffer, mimeType: msg.message.audioMessage.mimetype };
                    textMessage = "(El paciente envió un audio)";
                } else if (conversationType === 'imageMessage') {
                    console.log('📸 Imagen recibida. Analizando...');
                    addLog('INFO', 'Imagen recibida...');
                    const buffer = await downloadMediaMessage(msg, 'buffer', {});
                    media = { data: buffer, mimeType: msg.message.imageMessage.mimetype };
                    textMessage = msg.message.imageMessage.caption || "(El paciente envió una imagen)";
                } else if (conversationType === 'documentMessage') {
                    const mimeType = msg.message.documentMessage.mimetype;
                    if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
                        console.log(`📄 Documento (${mimeType}) recibido. Analizando...`);
                        addLog('INFO', `Documento (${mimeType}) recibido...`);
                        const buffer = await downloadMediaMessage(msg, 'buffer', {});
                        media = { data: buffer, mimeType };
                        textMessage = msg.message.documentMessage.caption || "(El paciente envió un documento)";
                    }
                }

                // ---------------------------------------------------------
                // 🛑 SISTEMA DE CONTROL HUMANO (!humano / !lucia)
                // ---------------------------------------------------------
                const textoLimpio = (textMessage || "").trim().toLowerCase();

                // 1. Si el mensaje lo enviaste TÚ (desde tu WhatsApp)
                if (msg.key.fromMe) {
                    if (textoLimpio === '!humano') {
                        chatsSilenciados.add(remitente);
                        console.log(`🔇 MODO SILENCIO ACTIVO: Lucía ya no responderá a ${remitente}`);
                        addLog('INFO', `Modo !humano activado para ${remitente}`);
                        return; 
                    } 
                    else if (textoLimpio === '!lucia') {
                        chatsSilenciados.delete(remitente);
                        console.log(`🔊 MODO SILENCIO DESACTIVADO: Lucía vuelve a atender a ${remitente}`);
                        addLog('INFO', `Modo !lucia activado para ${remitente}`);
                        return;
                    }
                    // Ignora tus otros mensajes normales para que Lucía no te responda a ti mismo
                    return; 
                }

                // 2. Si el mensaje es del PACIENTE, verificamos si está silenciado
                if (chatsSilenciados.has(remitente)) {
                    console.log(`[PAUSA] Ignorando mensaje de ${remitente} (Modo !humano activo).`);
                    return; // 🛑 Corta la ejecución aquí, el mensaje no llega a Gemini
                }
                
                // Si el mensaje está vacío y no hay multimedia, ignorar
                if (!textMessage && !media) return;
                // ---------------------------------------------------------
                
            // 🤫 PACTO DE NO AGRESIÓN: LUCÍA RESPETA A TERESA (HASTA MEDIANOCHE Y 8 DÍGITOS)
            // ==========================================================
            if (msg.key.fromMe && textMessage && textMessage.includes('soy Teresa de Clínica Biodens')) {
                // Calculamos exactamente la medianoche de HOY
                const finDelDia = new Date();
                finDelDia.setHours(23, 59, 59, 999);

                chatsEnEncuesta.set(remitente, finDelDia.getTime());
                console.log(`🔒 Pacto activado: Lucía se silencia hasta la medianoche con ${remitente}`);
                return;
            }

            // Buscador Inteligente de Lucía (Los 8 dígitos)
            let pacienteSilenciadoKey = null;
            if (chatsEnEncuesta.has(remitente)) {
                pacienteSilenciadoKey = remitente;
            } else if (!msg.key.fromMe) {
                const match8 = remitente.match(/(\d{8})@/);
                if (match8) {
                    const ultimos8 = match8[1];
                    for (const jidSilenciado of chatsEnEncuesta.keys()) {
                        if (jidSilenciado.includes(ultimos8)) {
                            pacienteSilenciadoKey = jidSilenciado;
                            break;
                        }
                    }
                }
            }

            if (!msg.key.fromMe && pacienteSilenciadoKey) {
                const expiracion = chatsEnEncuesta.get(pacienteSilenciadoKey);

                // Si todavía no es medianoche...
                if (Date.now() < expiracion) {
                    console.log(`🤫 Paciente respondiendo encuesta hoy (8 dígitos). Lucía guarda silencio.`);
                    return;
                } else {
                    // Si ya es el día siguiente, Lucía vuelve a atenderlo
                    chatsEnEncuesta.delete(pacienteSilenciadoKey);
                }
            }
            // ==========================================================

            // Si llegamos hasta aquí y el mensaje es propio (fromMe), lo ignoramos para no hacer eco
            if (msg.key.fromMe) return;

         // Lógica normal de Lucía
            delete require.cache[require.resolve('./src/config/blacklist')];
            const blacklist = require('./src/config/blacklist') || [];
            
            // 💡 Cortamos cualquier número de dispositivo extra (ej. WhatsApp Web)
            const senderNumber = remitente.split('@')[0].split(':')[0];

            // 🛡️ FILTRO BLINDADO ANTI-ERRORES DE WHATSAPP
            const estaBloqueado = blacklist.some(numeroLista => {
                const numLimpio = String(numeroLista).trim();
                // Bloquea si es idéntico, o si al menos los últimos 8 dígitos coinciden
                return senderNumber === numLimpio || senderNumber.endsWith(numLimpio.slice(-8));
            });

            if (estaBloqueado) {
                console.log(`🚫 Número bloqueado ignorado: ${senderNumber}`);
                addLog('WARNING', `Mensaje ignorado de bloqueado: ${senderNumber}`);
                return;
            }

            if (textMessage || media) {
                if (textMessage) console.log('Mensaje recibido:', textMessage);
                const jid = msg.key.remoteJid;

                // ⬇️ ESTA ES LA LÍNEA MÁGICA QUE ENCIENDE LA OREJA 1 ⬇️
                try { await sock.presenceSubscribe(jid); } catch (e) { console.log("No se pudo suscribir a presencia"); }

                if (textMessage && textMessage.trim().toLowerCase() === '!reset') {
                    chatHistory[jid] = [];
                    console.log(`🧹 Memoria borrada manualmente para ${jid}`);
                    await sock.sendMessage(jid, { text: '🧹 Memoria limpiada. Empiezo de cero.' }, { quoted: msg });
                    return;
                }

                if (!messageBuffers[jid]) {
                    messageBuffers[jid] = { texts: [], media: null, msgs: [] };
                }

                if (textMessage) messageBuffers[jid].texts.push(textMessage);
                if (media) messageBuffers[jid].media = media;
                messageBuffers[jid].msgs.push(msg);

                if (bufferTimeouts[jid]) {
                    clearTimeout(bufferTimeouts[jid]);
                }

                // Hacemos que Lucía simule estar escribiendo mientras procesa/espera
                await sock.sendPresenceUpdate('composing', jid);

                // Arrancamos el reloj estándar (se reinicia con cada mensaje nuevo)
                bufferTimeouts[jid] = setTimeout(() => {
                    procesarMensajeAgrupado(jid);
                }, 500);
            }
        } catch (error) {
            console.error('Error procesando mensaje:', error);
            addLog('ERROR', `Error msg: ${error.message}`);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startSock();