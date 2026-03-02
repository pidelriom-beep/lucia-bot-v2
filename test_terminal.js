const readline = require('readline');
const { generateResponse } = require('./src/services/geminiService');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const history = []; // Almacenar el historial de la conversación
const fakePhone = "56911111111"; // Teléfono falso simulando a un paciente

console.log("==========================================");
console.log("🤖 SIMULADOR DE CONSOLA - LUCIA V.2 (GEMINI + ROBOTINA API)");
console.log("Escribe 'salir' en cualquier momento para terminar.");
console.log("==========================================\n");

function askQuestion() {
    rl.question('[TÚ]: ', async (input) => {
        if (input.toLowerCase() === 'salir') {
            console.log('\nCerrando simulador...');
            rl.close();
            process.exit(0);
        }

        try {
            console.log('⏳ Procesando...');

            // Construimos un objeto similar a lo que recibe WhatsApp en messageBuffers
            const simulatedText = input.trim();

            // Llamamos a Gemini pasando el historial exacto que recibe desde Baileys
            const responseText = await generateResponse(simulatedText, history);

            console.log(`\n🤖 Lucía dice: ${responseText}\n`);
            console.log('------------------------------------------');

            // Actualizamos la memoria (historial) de la sesión con exactamente el mismo formato
            history.push({ role: 'user', text: simulatedText });
            history.push({ role: 'model', text: responseText });

            // Mantenemos un tamaño manejable como en WhatsApp (10 últimos)
            if (history.length > 10) {
                history.splice(0, history.length - 10);
            }

        } catch (error) {
            console.error('\n❌ Error al comunicarse con Gemini:', error);
            console.log('------------------------------------------');
        }

        // Volvemos a preguntar recursivamente
        askQuestion();
    });
}

// Iniciar el ciclo
askQuestion();
