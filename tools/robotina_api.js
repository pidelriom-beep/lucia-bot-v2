// Configuración estricta para Fase 1 (Red Privada Railway). Sin fallbacks públicos.
const BASE_URL = process.env.ROBOTINA_API_URL;

if (BASE_URL) {
    console.log(`\x1b[90m[Init System]\x1b[0m \x1b[34mEndpoint de Robotina enrutado hacia red interna:\x1b[0m \x1b[36m${BASE_URL}\x1b[0m`);
} else {
    console.log(`\x1b[90m[Init System]\x1b[0m \x1b[34mADVERTENCIA: ROBOTINA_API_URL no está definida. Robotina aislada.\x1b[0m`);
}

// Timeout global para las peticiones a la API (ej. cálculos pesados de sobrecupos)
const API_TIMEOUT_MS = 25000; // 25 segundos

/**
 * Función genérica para hacer peticiones al servidor de Robotina (Python).
 * Retorna el mensaje de error exacto si el servidor está apagado o falla.
 */
async function fetchRobotina(endpoint, bodyData) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
        if (!BASE_URL) {
            throw new Error("ROBOTINA_API_URL no configurada en el entorno.");
        }

        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyData),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            console.error(`\x1b[90m[Robotina API]\x1b[0m \x1b[34mTimeout de red interna en ${endpoint} tras ${API_TIMEOUT_MS}ms\x1b[0m`);
            return "⏳ La operación está tardando más de lo esperado en procesar la disponibilidad en la clínica. Por favor, indícale al paciente que aguarde un momento e inténtalo de nuevo si es necesario.";
        }

        // Si Robotina está apagada o inalcanzable (Connection Refused, etc.)
        console.error(`\x1b[90m[Robotina API]\x1b[0m \x1b[34mConexión rechazada o servicio caído en ${endpoint}:\x1b[0m \x1b[90m${error.message}\x1b[0m`);
        return "❌ ERROR: El sistema interno de agenda (Robotina) está temporalmente desconectado por mantenimiento preventivo. Por favor toma nota mental de que no hay conexión de calendario y dile al paciente que deje sus datos para que lo contacten.";
    }
}

/**
 * Herramienta: checkAvailability
 */
async function checkAvailability(date, duration) {
    // CAMBIAR A RUTA CORTA: /check
    return await fetchRobotina('/check', { date, duration });
}

/**
 * Herramienta: findNextAvailable
 */
async function findNextAvailable(duration) {
    // CAMBIAR A RUTA CORTA: /find_next
    return await fetchRobotina('/find_next', { duration });
}

/**
 * Herramienta: insertEvent
 */
async function insertEvent(name, phone, date, duration, is_sobrecupo) {
    // CAMBIAR A RUTA CORTA: /insert
    return await fetchRobotina('/insert', { name, phone, date, duration, is_sobrecupo });
}

/**
 * Herramienta: rescheduleEvent
 */
async function rescheduleEvent(patient_name, new_start_iso, target_date = null) {
    return await fetchRobotina('/reschedule', { patient_name, new_start_iso, target_date });
}

/**
 * Herramienta: deleteEvent
 */
async function deleteEvent(patient_name, target_date = null) {
    return await fetchRobotina('/delete', { patient_name, target_date });
}

/**
 * Herramienta: getPatientAppointment
 */
async function getPatientAppointment(patient_name) {
    return await fetchRobotina('/get_appointment', { patient_name });
}

module.exports = {
    checkAvailability,
    findNextAvailable,
    insertEvent,
    rescheduleEvent,
    deleteEvent,
    getPatientAppointment
};
