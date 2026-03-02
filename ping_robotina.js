// Using native fetch

// Por defecto probamos la URL local donde Robotina está corriendo (8000)
const TARGET_URL = 'http://127.0.0.1:8000/api/calendar';

async function testPing() {
    console.log(`📡 Haciendo ping HTTP a: ${TARGET_URL}/check`);
    try {
        // Hacemos una petición simple a /check o /find_next
        // Nota: Robotina espera POST con un body
        const response = await fetch(`${TARGET_URL}/check`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ date: new Date().toISOString().split('T')[0], duration: 15 })
        });

        console.log(`Status de respuesta: ${response.status} ${response.statusText}`);

        if (response.ok) {
            const data = await response.json();
            console.log('✅ Conexión HTTP EXITOSA. Respuesta de Robotina:', data);
        } else {
            console.log('❌ Error en la conexión HTTP. Status HTTP no es OK.');
            try {
                const text = await response.text();
                console.log('Cuerpo del error:', text);
            } catch (e) { }
        }
    } catch (error) {
        console.error('❌ Error de red severo al intentar conectar:', error.message);
    }
}

testPing();
