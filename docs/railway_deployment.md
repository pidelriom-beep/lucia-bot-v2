# Guía de Despliegue en Railway 🚀

Sigue estos pasos para poner a Lucía en la nube y que funcione 24/7.

## 1. Preparación del Proyecto
Asegúrate de tener los archivos `Dockerfile` y `railway.json` en tu carpeta (ya los he creado).

## 2. Subir a Railway
1.  Abre tu terminal en la carpeta del proyecto.
2.  Si no tienes Railway CLI instalado: `npm i -g @railway/cli` (Opcional, si prefieres usar la web).
3.  Vincula tu proyecto local con el proyecto vacío que ya creaste en Railway:
    ```bash
    railway link 3ba35e67-0568-455f-b8ef-7ebec795ef26
    ```
4.  Sube el código:
    ```bash
    railway up
    ```

## 3. Configurar Variables de Entorno
Ve al panel de control de Railway (en la web), selecciona tu proyecto y luego la pestaña **Variables**. Agrega:

-   `GEMINI_API_KEY`: (Tu clave de Google Gemini)
-   `ISABEL_GROUP_ID`: `120363405727306342@g.us`
-   `PORT`: `3000` (Railway suele asignarlo solo, pero mejor definirlo).

## 4. ⚠️ IMPORTANTE: Persistencia de Sesión (WhatsApp)
Para que no tengas que escanear el QR cada vez que Railway reinicia el servidor, **DEBES** crear un volumen persistente.

1.  En Railway, ve a tu servicio -> **Settings**.
2.  Baja hasta la sección **Volumes**.
3.  Haz clic en **+ Add Volume**.
4.  Usa EXACTAMENTE esta ruta de montaje (Mount Path):
    
    👉 **/app/auth_info_baileys**

    *(Esto conectará la carpeta interna del bot con un disco permanente en Railway).*

## 5. Verificación
1.  Una vez desplegado y configurado, ve a la pestaña **Deployments** -> **View Logs**.
2.  Verás el código QR en los logs (como texto ASCII).
3.  Escanéalo con tu celular (Dispositivos vinculados -> Vincular dispositivo).
4.  Debería decir "Conectado exitosamente".
5.  **Prueba de Fuego:** En la pestaña **Settings**, dale a **Restart**.
6.  Vuelve a los logs. Si se conecta automáticamente SIN pedir QR, ¡felicidades! Lucía es inmortal. 🎉
