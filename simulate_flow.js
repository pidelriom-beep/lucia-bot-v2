const chatHistory = {};
const jid = "56912345678@s.whatsapp.net";
const greetingRegex = /^(hola|buen(as|os)|saludos)/i;

// Mock Generate Response
async function generateResponse(text, history) {
    console.log(`\n🤖 [AI Thinking] Input: "${text}"`);
    console.log(`   [Context]:`, history.map(m => `${m.role}: ${m.text}`));

    // Simulate simple AI behavior based on context
    if (history.length === 0 && !text.includes("confirm")) {
        return "Hola soy Lucía de clínica Biodens, ¿en qué te puedo ayudar?";
    }
    if (text.includes("confirm") || (history.length > 0 && history[history.length - 1].text.includes("puedo ayudar"))) {
        // If the AI sees previous context, it might still be confused if the context isn't clear
        return "Entendido, estoy revisando (AI Mock Response)";
    }
    return "Respuesta genérica";
}

async function processMessage(text) {
    console.log(`\n👤 User says: "${text}"`);

    // Logic from app.js
    const isGreeting = text && greetingRegex.test(text.trim());
    if (isGreeting) {
        console.log(`👋 Saludo detectado: Reseteando memoria para ${jid}`);
        chatHistory[jid] = [];
    }

    const currentContext = chatHistory[jid] || [];
    const aiResponse = await generateResponse(text, currentContext);

    console.log(`🤖 Bot replies: "${aiResponse}"`);

    // Update History
    if (!chatHistory[jid]) chatHistory[jid] = [];
    chatHistory[jid].push({ role: 'user', text: text });
    chatHistory[jid].push({ role: 'model', text: aiResponse });
}

async function runSimulation() {
    console.log("--- SCENARIO 1: Fresh Start (Bot doesn't know about previous manual msg) ---");
    // Scenario: Human sent "Confirmar hora..." manually. Bot starts fresh.
    // User says "si asiste"
    await processMessage("si asiste");

    // User says "confirmando cita"
    await processMessage("confirmando cita");
}

runSimulation();
