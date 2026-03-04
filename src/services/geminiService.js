const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const robotinaApi = require('../../tools/robotina_api');
const promptClasico = require('../../prompts/prompt_clasico');
const promptRobotina = require('../../prompts/prompt_robotina');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Log estricto de inicialización en Producción para el Feature Flag (tonos grises y azules)
const initRobotinaFlag = String(process.env.ACTIVAR_ROBOTINA).toLowerCase() === 'true';
console.log(`\x1b[90m[Init System]\x1b[0m \x1b[34mEstado del motor Robotina (geminiService):\x1b[0m \x1b[36m${initRobotinaFlag ? 'ACTIVO (ON)' : 'INACTIVO (OFF)'}\x1b[0m`);
console.log(`\x1b[90m[Init System]\x1b[0m \x1b[34mMotor IA Principal cargado:\x1b[0m \x1b[36mgemini-2.5-flash\x1b[0m`);

// Configuración estricta de Herramientas
const robotinaTools = [
   {
      functionDeclarations: [
         {
            name: "google_calendar_check",
            description: "Revisa la disponibilidad en la agenda de la clínica. Pasa el día de la semana o término relativo exacto que mencionó el usuario, sin calcular fechas.",
            parameters: {
               type: "OBJECT",
               properties: {
                  dia_relativo: {
                     type: "STRING",
                     description: "El día mencionado por el usuario. Valores permitidos: 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'hoy', 'mañana'."
                  },
                  duration: {
                     type: "INTEGER",
                     description: "Duración de la cita en minutos."
                  }
               },
               required: ["dia_relativo", "duration"]
            }
         },
         {
            name: "google_calendar_find_next",
            description: "Encuentra el próximo horario disponible (normal o de sobrecupo) de manera automática a partir del momento actual. Úsalo si el paciente no da una fecha exacta y necesita atención urgente/rápida.",
            parameters: {
               type: "OBJECT",
               properties: {
                  duration: {
                     type: "INTEGER",
                     description: "Duración estimada en minutos (típicamente 15 para atenciones de evaluación/urgencia)."
                  }
               },
               required: ["duration"]
            }
         },
         {
            name: "google_calendar_insert",
            description: "Inserta un evento/cita (tanto turnos normales como sobrecupos) en el calendario del odontólogo. Úsalo SÓLO cuando el paciente confirme CLARAMENTE el horario propuesto.",
            parameters: {
               type: "OBJECT",
               properties: {
                  summary: {
                     type: "STRING",
                     description: "Título del evento. Sigue el formato estricto: 'WSP - BOT - URGENCIA/EVALUACIÓN - [Nombre del paciente]'. Ej: 'WSP - BOT - URGENCIA - Juan Perez'."
                  },
                  phone: {
                     type: "STRING",
                     description: "Número de teléfono en formato con código de país. Ej: '+56987654321'."
                  },
                  start_time: {
                     type: "STRING",
                     description: "Hora de inicio confirmada, en formato ISO-8601 chileno. Ej: '2026-02-28T09:15:00-03:00'."
                  },
                  duration: {
                     type: "INTEGER",
                     description: "Duración de la cita en minutos (suele ser 15)."
                  },
                  is_sobrecupo: {
                     type: "BOOLEAN",
                     description: "Indica si la cita es un sobrecupo (true) o una cita de agenda normal (false)."
                  }
               },
               required: ["summary", "phone", "start_time", "duration", "is_sobrecupo"]
            }
         },
         {
            name: "google_calendar_reschedule",
            description: "Reagenda o mueve una cita existente de un paciente a un nuevo horario usando la API de Robotina.",
            parameters: {
               type: "OBJECT",
               properties: {
                  patient_name: {
                     type: "STRING",
                     description: "El nombre del paciente del cual hay que buscar y mover la cita."
                  },
                  new_start_iso: {
                     type: "STRING",
                     description: "La nueva hora de inicio para reagendar en formato ISO-8601 chileno (Ej: '2026-03-01T15:30:00-03:00')."
                  },
                  target_date: {
                     type: "STRING",
                     description: "(Opcional) Si se indica, solo buscará citas de ese paciente en esta fecha específica (formato 'YYYY-MM-DD')."
                  }
               },
               required: ["patient_name", "new_start_iso"]
            }
         },
         {
            name: "google_calendar_delete",
            description: "Elimina o cancela una cita de manera definitiva de la agenda del odontólogo.",
            parameters: {
               type: "OBJECT",
               properties: {
                  patient_name: {
                     type: "STRING",
                     description: "El nombre completo del paciente a cancelar."
                  },
                  target_date: {
                     type: "STRING",
                     description: "(Opcional) La fecha particular ('YYYY-MM-DD') de la que hay que cancelar la cita si el paciente tuviese más de una."
                  }
               },
               required: ["patient_name"]
            }
         },
         {
            name: "google_calendar_get_appointment",
            description: "Sirve para consultar la o las horas agendadas a futuro de un paciente, para recordarles su próxima cita.",
            parameters: {
               type: "OBJECT",
               properties: {
                  patient_name: {
                     type: "STRING",
                     description: "El nombre del paciente a consultar."
                  }
               },
               required: ["patient_name"]
            }
         }
      ]
   }
];


async function generateResponse(text, history = [], media = null) {
   try {
      // 1. EVALUAR FEATURE FLAG
      const isRobotinaActive = String(process.env.ACTIVAR_ROBOTINA).toLowerCase() === 'true';

      // 2. SELECCIONAR PROMPT BASE
      const SYSTEM_PROMPT = isRobotinaActive ? promptRobotina : promptClasico;

      // 3. OBTENER LA FECHA Y HORA ACTUAL DE CHILE E INYECTAR COMO RELOJ GLOBAL
      const now = new Date();
      const options = { timeZone: 'America/Santiago', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
      const fechaChile = now.toLocaleString('es-CL', options);
      const DYNAMIC_PROMPT = `${SYSTEM_PROMPT}\n\n**FECHA Y HORA ACTUAL DEL SISTEMA:** Hoy es ${fechaChile}.`;

      // 4. CONFIGURACIÓN DINÁMICA DE TOOLS Y SYSTEM INSTRUCTION
      const modelConfig = {
         model: "gemini-2.5-flash",
         systemInstruction: {
            role: "system",
            parts: [{ text: DYNAMIC_PROMPT }]
         }
      };

      // INYECTAR LAS HERRAMIENTAS SOLO SI ROBOTINA ESTÁ ACTIVA
      if (isRobotinaActive) {
         modelConfig.tools = robotinaTools;
      }

      const model = genAI.getGenerativeModel(modelConfig);

      const formattedHistory = history.map(msg => ({
         role: msg.role === 'model' ? 'model' : 'user',
         parts: [{ text: msg.text }]
      }));

      const chat = model.startChat({
         history: formattedHistory
      });

      let msgParts = [{ text: text }];

      if (media && media.data) {
         // Fix for Gemini 2.5 Flash hanging on audio codecs string
         let safeMimeType = media.mimeType;
         if (safeMimeType.includes("audio/ogg")) {
            safeMimeType = "audio/ogg";
         }

         msgParts.push({
            inlineData: {
               data: media.data.toString("base64"),
               mimeType: safeMimeType
            }
         });
      }

      let result = await chat.sendMessage(msgParts);

      // Bloque de procesamiento de llamadas a herramientas (Tool Calls)
      // PROTECCIÓN: Solo procesar herramientas si Robotina está activa
      if (isRobotinaActive) {
         let toolsWereCalled = false;
         while (result.response.functionCalls() && result.response.functionCalls().length > 0) {
            toolsWereCalled = true;
            const functionCalls = result.response.functionCalls();
            const functionResponses = [];

            for (const toolCall of functionCalls) {
               const functionName = toolCall.name;
               const args = toolCall.args;
               let apiResponse;

               console.log(`\x1b[90m[Gemini Tool]\x1b[0m \x1b[34mEjecutando:\x1b[0m \x1b[36m${functionName}\x1b[0m`, args);

               if (functionName === 'google_calendar_check') {
                  apiResponse = await robotinaApi.checkAvailability(args.dia_relativo, args.duration);
               } else if (functionName === 'google_calendar_find_next') {
                  apiResponse = await robotinaApi.findNextAvailable(args.duration);
               } else if (functionName === 'google_calendar_insert') {
                  apiResponse = await robotinaApi.insertEvent(args.summary, args.phone, args.start_time, args.duration, args.is_sobrecupo);
               } else if (functionName === 'google_calendar_reschedule') {
                  apiResponse = await robotinaApi.rescheduleEvent(args.patient_name, args.new_start_iso, args.target_date);
               } else if (functionName === 'google_calendar_delete') {
                  apiResponse = await robotinaApi.deleteEvent(args.patient_name, args.target_date);
               } else if (functionName === 'google_calendar_get_appointment') {
                  apiResponse = await robotinaApi.getPatientAppointment(args.patient_name);
               } else {
                  apiResponse = "❌ ERROR: Herramienta no reconocida.";
               }

               console.log(`\x1b[90m[Gemini Tool]\x1b[0m \x1b[34mRespuesta de Robotina:\x1b[0m`, apiResponse);

               functionResponses.push({
                  functionResponse: {
                     name: functionName,
                     response: { result: apiResponse }
                  }
               });
            }

            // Enviamos los resultados de vuelta a Gemini. 
            // Si Gemini pide OTRA herramienta, el 'while' vuelve a girar.
            result = await chat.sendMessage(functionResponses);
         }

         // Fallback si Gemini decide no responder texto tras usar herramientas
         let finalResponseText = result.response.text();
         if ((!finalResponseText || finalResponseText.trim() === '') && toolsWereCalled) {
            console.log(`\x1b[90m[Gemini Engine]\x1b[0m \x1b[33mGemini devolvió texto vacío tras usar herramientas. Forzando fallback.\x1b[0m`);
            return "¡Perfecto! Todo listo en la agenda. ¡Te esperamos! 😊";
         }
      }

      // Una vez que Gemini ya no pide herramientas (o si Robotina estaba apagada), nos da el texto final
      return result.response.text();

   } catch (error) {
      console.error("Gemini Error:", error);
      return "Disculpa, tuve un problema procesando tu mensaje. ¿Puedes intentarlo nuevamente?";
   }
}

module.exports = { generateResponse };