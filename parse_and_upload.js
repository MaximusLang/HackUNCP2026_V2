const ical = require('node-ical');
const mongoose = require('mongoose');
const Assignment = require('./models/Assignment');
require('dotenv').config();

/**
 * Parses an ICS file and uploads events to MongoDB using Mongoose.
 * @param {string} icsFile Path to the .ics file.
 */
async function parseAndUpload(icsFile) {
    try {
        console.log(`Parsing file: ${icsFile}`);
        const events = await ical.parseFile(icsFile);
        const eventArray = [];

        for (const k in events) {
            if (events.hasOwnProperty(k)) {
                const ev = events[k];
                if (ev.type === 'VEVENT') {
                    const getVal = (field) => {
                        if (!field) return '';
                        return typeof field === 'object' ? field.val : field;
                    };

                    eventArray.push({
                        summary: getVal(ev.summary),
                        start: ev.start,
                        end: ev.end,
                        description: getVal(ev.description),
                        location: getVal(ev.location),
                        uid: getVal(ev.uid),
                        dtstamp: ev.dtstamp,
                        url: getVal(ev.url),
                        allDay: ev.datetype === 'date'
                    });
                }
            }
        }

        console.log(`Parsed ${eventArray.length} events.`);

        if (eventArray.length === 0) return { success: true, count: 0 };

        let processedCount = 0;
        for (const data of eventArray) {
            if (!data.uid) continue;

            await Assignment.updateOne(
                { uid: data.uid },
                {
                    $set: {
                        summary: data.summary,
                        start: data.start,
                        end: data.end,
                        description: data.description,
                        location: data.location,
                        dtstamp: data.dtstamp,
                        url: data.url,
                        allDay: data.allDay
                    },
                    $setOnInsert: {
                        status: "current",
                        difficulty: null,
                        confidence: null,
                        grade: null,
                        priorityScore: null
                    }
                },
                { upsert: true }
            );
            processedCount++;
        }

        return { success: true, count: processedCount };
    } catch (err) {
        console.error('Error during parseAndUpload:', err);
        return { success: false, error: err.message };
    }
}

if (require.main === module) {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://0.0.0.0:27017/hackuncp';
    mongoose.connect(MONGO_URI).then(async () => {
        const filePath = process.argv[2] || 'user_cQJ4L08MGocCzZ2qhM046qsGdv9Y6HZVmK0EVobJ (1).ics';
        await parseAndUpload(filePath);
        mongoose.disconnect();
    }).catch(console.error);
}

module.exports = { parseAndUpload };
