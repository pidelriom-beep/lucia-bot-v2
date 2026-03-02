const greetingRegex = /^(hola|buen(as|os)|saludos)/i;

const testCases = [
    "Hola",
    "Hola, confirmo",
    "Buenas tardes",
    "Buenas, si asisto",
    "Saludos",
    "Saludos, necesito hora"
];

console.log("Testing Greeting Regex: " + greetingRegex);
testCases.forEach(msg => {
    const isGreeting = greetingRegex.test(msg.trim());
    console.log(`"${msg}" => Is Greeting? ${isGreeting} (Will Reset: ${isGreeting})`);
});
