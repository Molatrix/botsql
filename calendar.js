const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

function authorize() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
        oAuth2Client.setCredentials(token);
    } else {
        throw new Error('No token found. Please authenticate with Google Calendar.');
    }

    return oAuth2Client;
}

function getAccessToken(oAuth2Client) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error retrieving access token', err);
            oAuth2Client.setCredentials(token);
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
            console.log('Token stored to', TOKEN_PATH);
        });
    });
}

async function listAvailableTimes(auth, date) {
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = 'primary'; // Replace with your specific calendar ID
    const startOfDay = new Date(date.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(date.setHours(23, 59, 59, 999)).toISOString();

    const events = await calendar.events.list({
        calendarId,
        timeMin: startOfDay,
        timeMax: endOfDay,
        singleEvents: true,
        orderBy: 'startTime',
    });

    const busyTimes = events.data.items.map(event => ({
        start: new Date(event.start.dateTime).getTime(),
        end: new Date(event.end.dateTime).getTime(),
    }));

    const availableTimes = getAvailableSlots(busyTimes, date);

    return availableTimes;
}

function getAvailableSlots(busyTimes, date) {
    const slots = [];
    const businessHours = [
        { start: new Date(date).setHours(9, 0, 0, 0), end: new Date(date).setHours(14, 0, 0, 0) },
        { start: new Date(date).setHours(16, 0, 0, 0), end: new Date(date).setHours(21, 0, 0, 0) },
    ];

    businessHours.forEach(hours => {
        let start = hours.start;
        while (start + 2 * 60 * 60 * 1000 <= hours.end) { // 2 hours slots
            if (!busyTimes.some(busy => start < busy.end && start + 2 * 60 * 60 * 1000 > busy.start)) {
                slots.push(new Date(start));
            }
            start += 2 * 60 * 60 * 1000; // Increment by 2 hours
        }
    });

    return slots;
}

module.exports = {
    authorize,
    listAvailableTimes,
};
