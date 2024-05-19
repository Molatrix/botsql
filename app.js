const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot');
require("dotenv").config();

const { setupReminders } = require('./reminder');
const QRPortalWeb = require('@bot-whatsapp/portal');
const BaileysProvider = require('@bot-whatsapp/provider/baileys');
const MySQLAdapter = require('@bot-whatsapp/database/mysql')

const MYSQL_DB_HOST = 'localhost' /* Servidor de base de datos */
const MYSQL_DB_USER = 'Movilizados' /* Usario base de datos */
const MYSQL_DB_PASSWORD = 'a76019884P+' /* Contraseña del usuario de la base de datos */
const MYSQL_DB_NAME = 'bot' /* Nombre de la base de datos */
const MYSQL_DB_PORT = '3306' /* Puerto del servidor de la base de datos */

const path = require("path");
const fs = require("fs");
const chat = require("./chatGPT");
const { handlerAI } = require("./whisper");

const menuPath = path.join(__dirname, "mensajes", "menu.txt");
const menu = fs.readFileSync(menuPath, "utf8");

const pathConsultas = path.join(__dirname, "mensajes", "promptConsultas.txt");
const promptConsultas = fs.readFileSync(pathConsultas, "utf8");

const flowVoice = addKeyword(EVENTS.VOICE_NOTE).addAnswer("Estoy procesando su audio para darle una respuesta apropiada, le ruego que tenga paciencia y procure hablar en un entorno con poco ruido para comprenderle mejor", null, async (ctx, ctxFn) => {
    const text = await handlerAI(ctx);
    const prompt = promptConsultas;
    const consulta = text;
    const answer = await chat(prompt, consulta);
    await ctxFn.flowDynamic(answer.content);
    console.log(text);
});

const flowBienvenida = addKeyword(EVENTS.WELCOME)
    .addAnswer("Bienvenido, soy el Asistente Virtual de RJ SOLUCIONES", {
        delay: 5000 // Espera 5 segundos antes de mostrar el catálogo
    })
    .addAnswer(async (ctx, ctxFn) => {
        console.log("Mostrando catálogo...");
        const catalogFilePath = path.join(__dirname, 'media', 'catalogo.pdf');
        try {
            await ctxFn.flowDynamic({
                text: 'A continuación, aquí tienes nuestro catálogo:',
                media: catalogFilePath
            });
        } catch (error) {
            console.error('Error al leer el catálogo:', error);
            await ctxFn.flowDynamic('Lo siento, no pude cargar el catálogo en este momento.');
        }
    })
    .addAnswer("Para ver las opciones disponibles escribe la palabra: Inicio");

module.exports = {
    flowBienvenida,
    // Otros flujos de conversación...
};


const { authorize, listAvailableTimes } = require('./calendar');

const flowCitaPrevia = addKeyword(EVENTS.ACTION)
    .addAnswer('Por favor, proporcione una fecha (YYYY-MM-DD) para ver los horarios disponibles:', { capture: true }, async (ctx, ctxFn) => {
        const dateInput = ctx.body;
        const date = new Date(dateInput);

        if (isNaN(date)) {
            await ctxFn.flowDynamic('Fecha no válida. Por favor, proporcione una fecha válida en el formato YYYY-MM-DD.');
            return;
        }

        const auth = authorize();
        const availableTimes = await listAvailableTimes(auth, date);

        if (availableTimes.length === 0) {
            await ctxFn.flowDynamic('Lo siento, no hay horarios disponibles para la fecha seleccionada. Por favor, elija otra fecha.');
            return;
        }

        let response = 'Estos son los horarios disponibles:\n';
        availableTimes.forEach((time, index) => {
            response += `${index + 1}. ${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n`;
        });

        response += 'Por favor, seleccione un horario (número):';
        await ctxFn.flowDynamic(response);

        ctxFn.keep(async (nextCtx, nextFn) => {
            const selectedIndex = parseInt(nextCtx.body) - 1;

            if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= availableTimes.length) {
                await nextFn.flowDynamic('Opción no válida. Por favor, seleccione un horario válido (número):');
                return;
            }

            const selectedTime = availableTimes[selectedIndex];
            await nextFn.flowDynamic(`Ha seleccionado ${selectedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Su cita ha sido reservada.`);

            // Aquí puedes agregar la lógica para crear el evento en Google Calendar
            const calendar = google.calendar({ version: 'v3', auth });
            await calendar.events.insert({
                calendarId: 'primary', // Reemplaza con el ID de tu calendario
                resource: {
                    summary: 'Cita Reservada',
                    start: { dateTime: selectedTime.toISOString() },
                    end: { dateTime: new Date(selectedTime.getTime() + 2 * 60 * 60 * 1000).toISOString() },
                },
            });

            await nextFn.flowDynamic('La cita ha sido creada en el calendario.');
        });
    });

const flowCategorias = addKeyword(['informacion', 'categorias'])
    .addAnswer('Seleccione una categoría:\n1. Productos\n2. Servicios\n3. Contacto', { capture: true }, async (ctx, ctxFn) => {
        switch (ctx.body) {
            case '1':
                await ctxFn.flowDynamic('Aquí está la información sobre nuestros productos...');
                break;
            case '2':
                await ctxFn.flowDynamic('Aquí está la información sobre nuestros servicios...');
                break;
            case '3':
                await ctxFn.flowDynamic('Aquí está la información de contacto...');
                break;
            default:
                await ctxFn.flowDynamic('Opción no válida. Por favor, seleccione una opción válida.');
        }
    });

const flowSoporteEnVivo = addKeyword(['soporte', 'representante'])
    .addAnswer('Está siendo conectado con un representante en vivo...', null, async (ctx, ctxFn) => {
        // Aquí podrías integrar con un sistema de soporte en vivo
        await ctxFn.flowDynamic('Un representante en vivo se comunicará con usted pronto.');
    });

const flowMostrarImagen = addKeyword(['mostrar', 'imagen', 'articulo'])
    .addAnswer('Por favor, proporcione el nombre del artículo que desea ver:', { capture: true }, async (ctx, ctxFn) => {
        const itemName = ctx.body.toLowerCase().replace(/\s+/g, '-'); // Normaliza el nombre del artículo
        const mediaPath = path.join(__dirname, 'media');
        const files = fs.readdirSync(mediaPath);
        const foundFile = files.find(file => file.toLowerCase() === `${itemName}.jpg` || file.toLowerCase() === `${itemName}.png`);

        if (foundFile) {
            const mediaUrl = path.join(mediaPath, foundFile);
            await ctxFn.flowDynamic({
                text: `Aquí está la imagen del artículo: ${itemName}`,
                media: mediaUrl
            });
        } else {
            await ctxFn.flowDynamic('Lo siento, no encontré ninguna imagen para el artículo solicitado.');
        }
    });

const flowConsultas = addKeyword(EVENTS.ACTION)
    .addAnswer('Está en el apartado consultas')
    .addAnswer("Desde aquí puede hacer su consulta, puede usar tanto texto como voz. Escriba 'salir' para volver al menú principal.", 
    { capture: true }, 
    async (ctx, ctxFn) => {
        // Manejo de tiempo de inactividad
        let timer;
        const resetTimer = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(async () => {
                await ctxFn.flowDynamic('Han pasado 3 minutos sin recibir respuesta. Volviendo al menú principal.');
                await ctxFn.gotoFlow(menuFlow);
            }, 180000); // 3 minutos en milisegundos
        };
        
        // Inicializar el temporizador al inicio
        resetTimer();

        const handleConsulta = async (consultaCtx, consultaFn) => {
            if (consultaCtx.body.toLowerCase() === 'salir') {
                if (timer) clearTimeout(timer);
                await consultaFn.flowDynamic('Volviendo al menú principal. Puedes acceder a este menú nuevamente escribiendo "Inicio".');
                return await consultaFn.gotoFlow(menuFlow);
            }
            
            const prompt = promptConsultas;
            const consulta = consultaCtx.body;
            try {
                const answer = await chat(prompt, consulta);
                await consultaFn.flowDynamic(answer.content);
                // Reinvitar al usuario a hacer otra consulta
                await consultaFn.flowDynamic('¿Tienes alguna otra consulta? Puedes seguir preguntando o escribir "salir" para volver al menú principal.');
                // Reiniciar el temporizador después de cada respuesta
                resetTimer();
            } catch (error) {
                console.error('Error al procesar la consulta:', error);
                await consultaFn.flowDynamic('Lo siento, ha ocurrido un error al procesar su consulta. Por favor, inténtelo de nuevo más tarde.');
            }
        };

        // Manejar la consulta actual y las siguientes
        await handleConsulta(ctx, ctxFn);

        // Capturar más consultas del usuario
        ctxFn.keep((nextCtx, nextFn) => handleConsulta(nextCtx, nextFn));
    });

const faqPath = path.join(__dirname, "mensajes", "faq.txt");
const faq = fs.readFileSync(faqPath, "utf8");

const flowFAQ = addKeyword(['preguntas', 'faq']).addAnswer(faq);

const flowMenuInicio = addKeyword(['Inicio', 'Menu'])
    .addAnswer(menu, null, async (ctx, ctxFn) => {
        await ctxFn.flowDynamic('Para ver las opciones disponibles, responde con el número de la opción que deseas:');
    });

/* Definiciones del conector con la base de datos */
const main = async () => {
    const adapterDB = new MySQLAdapter({
        host: MYSQL_DB_HOST,
        user: MYSQL_DB_USER,
        database: MYSQL_DB_NAME,
        password: MYSQL_DB_PASSWORD,
        port: MYSQL_DB_PORT,
    })
    const adapterFlow = createFlow([
        flowBienvenida,
        flowMenuInicio,
        flowFAQ,
        flowCitaPrevia,
        flowCategorias,
        flowSoporteEnVivo,
        flowMostrarImagen,
        flowConsultas,
        flowVoice,
    ]);
    const adapterProvider = createProvider(BaileysProvider);
    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });
    QRPortalWeb();
    setupReminders();
};

main();
