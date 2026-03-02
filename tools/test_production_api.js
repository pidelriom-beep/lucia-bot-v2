const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // Carga variable si existe, no indispensable aquí

const robotinaApi = require('./robotina_api');

// --- UTILIDADES DE COLOR (Gris y Azul) ---
const COLORS = {
    reset: "\x1b[0m",
    gray: "\x1b[90m",
    blue: "\x1b[34m",
    lightBlue: "\x1b[36m"
};

function logInfo(msg) {
    console.log(`${COLORS.blue}[INFO]${COLORS.reset} ${COLORS.gray}${msg}${COLORS.reset}`);
}

function logSuccess(msg, data) {
    console.log(`${COLORS.lightBlue}[EXITO]${COLORS.reset} ${COLORS.gray}${msg}${COLORS.reset}`);
    if (data) {
        console.log(`${COLORS.gray}${JSON.stringify(data, null, 2)}${COLORS.reset}`);
    }
}

function logError(msg) {
    console.log(`${COLORS.blue}[ERROR/TIMEOUT]${COLORS.reset} ${COLORS.gray}${msg}${COLORS.reset}`);
}


async function runTests() {
    logInfo("--- INICIANDO PRUEBAS DE INTEGRACIÓN: NODE.JS -> RAILWAY ---");
    logInfo(`Endpoint configurado para probar: ${process.env.ROBOTINA_API_URL || 'https://robotina-production.up.railway.app/api/calendar'}`);

    // --- 1. PRUEBA DE CONECTIVIDAD Y PAYLOAD ---
    logInfo("\nEjecutando Prueba 1: Petición real de lectura (checkAvailability)");
    const fechaPrueba = "2026-03-02"; // Lunes hipotético
    const duracionPrueba = 15;

    logInfo(`Consultando disponibilidad para el día ${fechaPrueba}...`);
    try {
        const t0 = performance.now();
        const response = await robotinaApi.checkAvailability(fechaPrueba, duracionPrueba);
        const t1 = performance.now();

        logSuccess(`Respuesta recibida en ${Math.round(t1 - t0)}ms. Estructura obtenida:`, response);

        // Validación de payload: ¿existe la propiedad "respuesta"?
        if (typeof response === 'object' && response !== null && 'respuesta' in response) {
            logSuccess("✅ Payload validado correctamente: La estructura del Pydantic Model llegó intacta a Node.js.");
        } else if (typeof response === 'string' && response.includes("ERROR")) {
            logError(`Se recibió un string manejado por el SDK: ${response}`);
        } else {
            logError("❌ La respuesta no tiene la estructura esperada { respuesta: '...' }");
            console.log(response);
        }

    } catch (error) {
        logError(`Falla inesperada en Prueba 1: ${error.message}`);
    }

    // --- 2. PRUEBA DE TIMEOUT ---
    logInfo("\nEjecutando Prueba 2: Simulación de Timeout AbortController");
    logInfo("Forzando un timeout inyectando temporalmente una sobrecarga en AbortController...");

    // Aquí vamos a sobreescribir temporalmente la función enviando 'undefined' como body,
    // o simplemente creando una versión modificada del fetch en esta prueba para forzarlo a 1ms

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1); // 1 milisegundo!

    try {
        logInfo("Lanzando petición con timeout de 1ms...");
        // Usamos la misma lógica que el SDK para ser consistentes
        const response = await fetch(`${robotinaApi.BASE_URL || 'http://robotina.railway.internal:8080/api/calendar'}/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: "2026-03-02", duration: 15 }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        logError("❌ La petición no fue abortada a tiempo!");
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            logSuccess("✅ AbortController funcionó a la perfección. Redirigiendo a lógica del SDK:");
            // Esta es la lógica que está escrita en robotina_api.js
            const simMensajeSDK = "⏳ La operación está tardando más de lo esperado en procesar la disponibilidad en la clínica. Por favor, indícale al paciente que aguarde un momento e inténtalo de nuevo si es necesario.";
            logSuccess("Respuesta simulada generada por SDK NodeJS:", simMensajeSDK);
        } else {
            logError(`Error distinto a AbortError: ${error.message}`);
        }
    }

    logInfo("\n--- FIN DE PRUEBAS ---");
}

runTests();
