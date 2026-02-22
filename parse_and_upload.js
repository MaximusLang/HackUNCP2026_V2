const ical = require('node-ical');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const DEFAULT_MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const DEFAULT_DB_NAME = 'hackuncp';
const DEFAULT_COLLECTION_NAME = 'events';

/**
 * Parses an ICS file and uploads events to MongoDB.
 * If an event with the same UID exists, it updates it.
 * @param {string} icsFile Path to the .ics file.
 * @param {object} options Configuration options (mongoUrl, dbName, collectionName).
 */
async function parseAndUpload(icsFile, options = {}) {
    const mongoUrl = options.mongoUrl || DEFAULT_MONGO_URI;
    const dbName = options.dbName || DEFAULT_DB_NAME;
    const collectionName = options.collectionName || DEFAULT_COLLECTION_NAME;

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
                        allDay: ev.datetype === 'date'
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
        console.log(`Connected to MongoDB for upserting into ${dbName}.${collectionName}`);

        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Upsert events
        console.log('Upserting events into database...');
        let processedCount = 0;
        for (const event of eventArray) {
            // Filter based on UID as the unique identifier
            const filter = { uid: event.uid };

            // Use updateOne with upsert: true to replace existing or insert new
            await collection.updateOne(
                filter,
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
        console.error('Error during parseAndUpload:', err);
        return { success: false, error: err.message };
    } finally {
        await client.close();
    }
}

// Allow calling from command line for testing
if (require.main === module) {
    const filePath = process.argv[2] || 'user_cQJ4L08MGocCzZ2qhM046qsGdv9Y6HZVmK0EVobJ (1).ics';
    parseAndUpload(filePath).catch(console.error);
}

module.exports = { parseAndUpload };
