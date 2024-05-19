// reminder.js
const cron = require('node-cron');
const { google } = require('googleapis');
const { authorize } = require('./calendar');
const { WAConnection } = require('@adiwajshing/keyed-db');

async function sendMessage(number, message) {
    // Crear una nueva instancia de la conexión de Baileys
    const conn = new WAConnection();

    // Conectar al servidor de WhatsApp
    await conn.connect();

    // Enviar el mensaje
    await conn.sendMessage(number, message, MessageType.text);

    // Desconectar la conexión
    await conn.close();
}

function scheduleReminder(event) {
    const reminderTime = new Date(event.start.dateTime);
    reminderTime.setHours(reminderTime.getHours() - 1); // 1 hour before the event

    cron.schedule(`${reminderTime.getMinutes()} ${reminderTime.getHours()} ${reminderTime.getDate()} ${reminderTime.getMonth() + 1} *`, () => {
        const recipient = event.attendees[0].email; // Supongamos que el correo es el número de WhatsApp
        sendMessage(recipient, `Recordatorio: Tienes una cita a las ${new Date(event.start.dateTime).toLocaleTimeString()}`);
    });
}

async function setupReminders() {
    const auth = authorize();
    const calendar = google.calendar({ version: 'v3', auth });
    const now = new Date();
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(now.getDate() + 7);

    const events = await calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: oneWeekFromNow.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
    });

    events.data.items.forEach(event => {
        if (event.start.dateTime) {
            scheduleReminder(event);
        }
    });
}

module.exports = { setupReminders };
