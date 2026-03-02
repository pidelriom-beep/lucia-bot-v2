const { generateResponse } = require('./src/services/geminiService');

async function test() {
    const history = [
        { role: 'user', text: 'Hola, me duele un diente.' },
        { role: 'model', text: 'Entiendo que estás con dolor. Te atenderemos lo más pronto posible. Isabel te contactará a la brevedad para agendarte un sobrecupo.' }
    ];
    // Simular que el paciente da los datos
    const response = await generateResponse("Mi nombre es Juanito Pérez y mi número es +56912345678", history, null);
    console.log("RESPONSE V2:", response);
}

test();
