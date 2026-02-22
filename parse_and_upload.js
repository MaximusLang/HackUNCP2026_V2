const ical = require('node-ical');
const { MongoClient } = require('mongodb');

const mongoUrl = 'mongodb://localhost:27017';
const dbName = 'hackuncp';
const collectionName = 'events';

/**
 * Parses an ICS file and uploads events to MongoDB.
 * If an event with the same summary, description, location, and UID exists, it replaces it.
 * @param {string} icsFile Path to the .ics file.
 */
async function parseAndUpload(icsFile) {
    const client = new MongoClient(mongoUrl);
    try {
        // Parse the ICS file
        console.log(`Parsing file: ${icsFile}`);
        const events = await ical.parseFile(icsFile);
        const eventArray = [];

        for (const k in events) {
            if (events.hasOwnProperty(k)) {
                const ev = events[k];
                if (ev.type === 'VEVENT') {
                    eventArray.push({
                        summary: ev.summary || '',
                        start: ev.start,
                        end: ev.end,
                        description: ev.description || '',
                        location: ev.location || '',
                        uid: ev.uid || '',
                        dtstamp: ev.dtstamp,
                        url: ev.url || '',
                        allDay: ev.allDay
                    });
                }
            }
        }

        console.log(`Parsed ${eventArray.length} events.`);

        if (eventArray.length === 0) {
            console.log('No events found to upload.');
            return { success: true, count: 0 };
        }

        // Connect to MongoDB
        await client.connect();
        console.log('Connected successfully to MongoDB server');

        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Upsert events
        console.log('Upserting events into database...');
        let processedCount = 0;
        for (const event of eventArray) {
            // Filter based on "all metrics except dates"
            // We use summary, description, location, and uid as the unique identifier
            const filter = {
                summary: event.summary,
                description: event.description,
                location: event.location,
                uid: event.uid
            };

            // Use replaceOne with upsert: true to replace existing or insert new
            const result = await collection.updateOne(
    { uid: event.uid },
    {
        $set: {
            summary: event.summary,
            start: event.start,
            end: event.end,
            description: event.description,
            location: event.location,
            dtstamp: event.dtstamp,
            url: event.url,
            allDay: event.allDay
        },
        $setOnInsert: {
            status: "current",
            difficulty: null,
            confidence: null,
            grade: null,
            extendedEnd: null,
            priorityScore: null,
            embedding: null
        }
    },
    { upsert: true }
);
            processedCount++;
        }

        console.log(`${processedCount} events were processed (inserted or replaced).`);
        return { success: true, count: processedCount };

    } catch (err) {
        console.error('Error:', err);
        return { success: false, error: err.message };
    } finally {
        await client.close();
        console.log('Connection closed.');
    }
}

// Allow calling from command line for testing
if (require.main === module) {
    const filePath = process.argv[2] || 'user_cQJ4L08MGocCzZ2qhM046qsGdv9Y6HZVmK0EVobJ (1).ics';
    parseAndUpload(filePath).catch(console.error);
}

module.exports = { parseAndUpload };
