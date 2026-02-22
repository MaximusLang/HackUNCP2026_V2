const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const { parseAndUpload } = require('./parse_and_upload');
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
const DB_NAME = 'hackuncp';
const COLLECTION = 'events';

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
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        // Use the centralized parsing logic from parse_and_upload.js
        const result = await parseAndUpload(req.file.path, {
            mongoUrl: MONGO_URI,
            dbName: DB_NAME,
            collectionName: COLLECTION
        });

        // Clean up the uploaded file
        try {
            fs.unlinkSync(req.file.path);
        } catch (unlinkErr) {
            console.warn("Failed to delete temp file:", unlinkErr.message);
        }

        if (result.success) {
            res.json({ success: true, count: result.count });
        } else {
            res.status(500).json({ error: result.error });
        }

    } catch (err) {
        console.error("Upload handler error:", err);
        res.status(500).json({ error: err.message });
    }
});

/* =========================
   FETCH ALL
 ========================= */

app.get('/api/assignments', async (req, res) => {
    try {
        const collection = await getCollection();
        const data = await collection.find().toArray();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =========================
   UPDATE ASSIGNMENT
 ========================= */

app.put('/api/assignments/:id', async (req, res) => {
    try {
        const collection = await getCollection();
        
        // Ensure we don't try to update the _id field itself
        const { _id, ...updateData } = req.body;

        const result = await collection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Assignment not found" });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Update error:", err);
        res.status(500).json({ error: err.message });
    }
});

/* ========================= */

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
