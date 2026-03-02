const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');

async function getGroup() {
    console.log("Iniciando conexión para unirse al grupo...");
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log("✅ Conectado a WhatsApp.");

            try {
                // Invite Code from: https://chat.whatsapp.com/EIOz4KOyHgqLibThJpBCtq
                const inviteCode = 'EIOz4KOyHgqLibThJpBCtq';

                console.log(`Intentando unirse con código: ${inviteCode}`);

                // Primero intentamos obtener info del grupo para ver si ya estamos dentro o si el link es válido
                try {
                    const groupInfo = await sock.groupGetInviteInfo(inviteCode);
                    console.log(`Grupo encontrado: ${groupInfo.subject} (Creado por: ${groupInfo.owner})`);
                    console.log(`🆔 ID DEL GRUPO: ${groupInfo.id}`);

                    // Intentar unirse
                    const response = await sock.groupAcceptInvite(inviteCode);
                    console.log(`Respuesta al unirse: ${response}`); // Usually returns the JID

                    console.log("\n👇 COPIA ESTA LÍNEA EN TU .ENV 👇");
                    console.log(`ISABEL_GROUP_ID=${groupInfo.id}`);

                    process.exit(0);

                } catch (e) {
                    // Si falla puede ser porque ya estamos en el grupo
                    console.log("⚠️ No se pudo unir por invitación (¿Quizás ya estás dentro?). Buscando en grupos existentes...");

                    const groups = await sock.groupFetchAllParticipating();
                    for (const gId in groups) {
                        const g = groups[gId];
                        console.log(`Revisando: ${g.subject} (${g.id})`);
                        // No tenemos el subject del link sin unirse, pero imprimimos todos
                    }
                    console.log("Busca el ID del grupo 'Isabel' o similar en la lista de arriba.");
                    process.exit(0);
                }

            } catch (error) {
                console.error("Error:", error);
                process.exit(1);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

getGroup();
