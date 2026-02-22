const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const ical = require('node-ical');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

/* =========================
   DATABASE CONFIG
========================= */

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = 'academicPlanner';
const COLLECTION = 'assignments';

let cachedClient = null;

async function getCollection() {
    if (!cachedClient) {
        cachedClient = new MongoClient(MONGO_URI);
        await cachedClient.connect();
        console.log("Connected to MongoDB");
    }
    const db = cachedClient.db(DB_NAME);
    return db.collection(COLLECTION);
}

/* =========================
   ICS UPLOAD
========================= */

app.post('/api/upload-ics', upload.single('icsFile'), async (req, res) => {
    try {
        const events = await ical.parseFile(req.file.path);
        const collection = await getCollection();

        for (const key in events) {
            const ev = events[key];

            if (ev.type === 'VEVENT') {
                await collection.updateOne(
                    { uid: ev.uid },
                    {
                        $set: {
                            summary: ev.summary || '',
                            start: ev.start || null,
                            end: ev.end || null,
                            description: ev.description || '',
                            location: ev.location || '',
                            url: ev.url || '',
                            allDay: ev.datetype === 'date'
                        },
                        $setOnInsert: {
                            status: "current",
                            difficulty: null,
                            confidence: null,
                            grade: null,
                            completedAt: null
                        }
                    },
                    { upsert: true }
                );
            }
        }

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =========================
   FETCH ALL
========================= */

app.get('/api/assignments', async (req, res) => {
    const collection = await getCollection();
    const data = await collection.find().toArray();
    res.json(data);
});

/* =========================
   UPDATE ASSIGNMENT
========================= */

app.put('/api/assignments/:id', async (req, res) => {
    const collection = await getCollection();

    await collection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: req.body }
    );

    res.json({ success: true });
});

/* ========================= */

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});