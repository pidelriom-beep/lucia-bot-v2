const express = require('express');
const { generateResponse } = require('./src/services/geminiService');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT_VOZ || 8081;

// Regex estricto para eliminar emojis
const removeEmojis = (str) => {
    return str.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
};

app.post('/vapi/chat/completions', async (req, res) => {
    try {
        const { messages, model } = req.body;
        
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: "No messages provided" });
        }

        // Extraer último mensaje
        const lastMessage = messages[messages.length - 1];
        
        // Validación básica (en caso de que Vapi mande algo distinto, pero generalmente es user)
        if (lastMessage.role !== 'user') {
            console.warn(`El último mensaje no es de 'user', es '${lastMessage.role}'`);
        }
        
        const userText = lastMessage.content || "";
        
        // Formatear historial para geminiService (espera 'role' y 'text')
        const history = messages.slice(0, -1).map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            text: msg.content || ''
        }));

        // Concatenar el contexto estricto al último mensaje del usuario
        const contextoEstricto = "\n\n[REGLA DE SISTEMA: Estás hablando por TELÉFONO. Tus respuestas deben ser MUY CORTAS (1 o 2 oraciones máximo), directas y conversacionales. ESTÁ ESTRICTAMENTE PROHIBIDO USAR EMOJIS.]";
        const textoConContexto = userText + contextoEstricto;

        // Llamar a la función central de IA del bot
        const rawResponse = await generateResponse(textoConContexto, history);

        // Aplicar regex estricto para eliminar cualquier emoji escapado y hacer trim()
        const cleanResponse = removeEmojis(rawResponse || "").trim();

        // Respuesta en formato JSON estricto de OpenAI Chat Completions para Vapi
        const responsePayload = {
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: model || "vapi-custom-llm",
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: cleanResponse
                    },
                    finish_reason: "stop"
                }
            ]
        };

        res.json(responsePayload);

    } catch (error) {
        console.error("Error en /vapi/chat/completions:", error);
        res.status(500).json({
            error: {
                message: "Internal server error processing completion",
                type: "server_error"
            }
        });
    }
});

app.listen(PORT, () => {
    console.log(`[Vapi Server] Servidor de Voz (Custom LLM) escuchando en puerto ${PORT}`);
});
