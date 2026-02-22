const express = require('express');
const multer = require('multer');
const cors = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
let pdf = require('pdf-parse');
if (typeof pdf !== 'function' && pdf.default) pdf = pdf.default;
const { parseAndUpload } = require('./parse_and_upload');
const { generateChatResponse, parseSyllabus } = require('./chatbot');
const crypto = require('crypto');
const Assignment = require('./models/Assignment');
const Course = require('./models/Course');
require('dotenv').config();

const app = express();
app.use(require('cors')());
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

/* =========================
   DATABASE CONFIG (Mongoose)
 ========================= */

const MONGO_URI = process.env.MONGO_URI || 'mongodb://0.0.0.0:27017/hackuncp';

mongoose.connect(MONGO_URI)
    .then(() => console.log("Connected to MongoDB via Mongoose"))
    .catch(err => console.error("Mongoose connection error:", err));

// Schema for History (Completed Assignments) - "extra space"
const historySchema = new mongoose.Schema({
    originalId: mongoose.Schema.Types.ObjectId,
    uid: String,
    courseId: mongoose.Schema.Types.ObjectId,
    summary: String,
    start: Date,
    end: Date,
    description: String,
    location: String,
    grade: Number,
    difficulty: Number,
    confidence: Number,
    completedAt: { type: Date, default: Date.now },
    allDay: Boolean,
    category: String,
    estimatedWeight: Number
}, { timestamps: true });

const History = mongoose.model('History', historySchema, 'completed_assignments');

/* =========================
   ICS UPLOAD
 ========================= */

app.post('/api/upload-ics', upload.single('icsFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        const result = await parseAndUpload(req.file.path);
        
        try { fs.unlinkSync(req.file.path); } catch (e) {}

        if (result.success) res.json({ success: true, count: result.count });
        else res.status(500).json({ error: result.error });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =========================
   ASSIGNMENTS API
 ========================= */

app.get('/api/assignments', async (req, res) => {
    try {
        const current = await Assignment.find({ status: { $ne: 'history' } }).populate('courseId');
        const history = await History.find().populate('courseId');
        
        const merged = [
            ...current,
            ...history.map(h => ({ ...h.toObject(), status: 'history', _id: h.originalId || h._id }))
        ];
        res.json(merged);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/assignments/overdue', async (req, res) => {
    try {
        const overdue = await Assignment.find({
            end: { $lt: new Date() },
            status: 'current'
        }).populate('courseId');
        res.json(overdue);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/assignments/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const updateData = req.body;

        if (updateData.status === 'history') {
            const assignment = await Assignment.findById(id);
            if (assignment) {
                const historyEntry = new History({
                    originalId: assignment._id,
                    uid: assignment.uid,
                    courseId: assignment.courseId,
                    summary: assignment.summary,
                    start: assignment.start,
                    end: assignment.end,
                    description: assignment.description,
                    location: assignment.location,
                    grade: updateData.grade,
                    difficulty: updateData.difficulty || assignment.difficulty,
                    confidence: updateData.confidence || assignment.confidence,
                    category: assignment.category,
                    estimatedWeight: assignment.estimatedWeight,
                    allDay: assignment.allDay
                });
                await historyEntry.save();
                await Assignment.findByIdAndDelete(id);
                return res.json({ success: true, movedToHistory: true });
            }
        }

        await Assignment.findByIdAndUpdate(id, updateData);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =========================
   COURSES API
 ========================= */

app.get('/api/courses', async (req, res) => {
    try {
        const courses = await Course.find();
        res.json(courses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/courses', async (req, res) => {
    try {
        const course = new Course(req.body);
        await course.save();
        res.json(course);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =========================
   SYLLABUS & COURSES (Placeholders)
 ========================= */

app.post('/api/upload-syllabus', upload.single('syllabus'), async (req, res) => {
    try {
        const { courseId } = req.body;
        if (!req.file) return res.status(400).json({ error: "Missing file" });

        const dataBuffer = fs.readFileSync(req.file.path);
        let text = "";
        const ext = path.extname(req.file.originalname || '').toLowerCase();

        try {
            if (ext === '.pdf' || req.file.mimetype === 'application/pdf') {
                // Support multiple pdf-parse exports and input shapes. Prefer passing { data: Buffer }.
                try {
                    if (typeof pdf === 'function') {
                        // try object form first
                        try {
                            const pdfData = await pdf({ data: dataBuffer });
                            text = pdfData && pdfData.text ? pdfData.text : '';
                        } catch (tryObjErr) {
                            // fallback to passing raw buffer
                            const pdfData = await pdf(dataBuffer);
                            text = pdfData && pdfData.text ? pdfData.text : '';
                        }
                    } else if (pdf && typeof pdf.PDFParse === 'function') {
                        // Try constructor with options object
                        let parser;
                        try {
                            parser = new pdf.PDFParse({ data: dataBuffer });
                        } catch (ctorErr) {
                            parser = new pdf.PDFParse(dataBuffer);
                        }
                        if (parser) {
                            if (typeof parser.getText === 'function') {
                                text = await parser.getText();
                            } else if (typeof parser.getPageText === 'function') {
                                text = await parser.getPageText();
                            } else if (typeof parser.getPageTables === 'function') {
                                text = (await parser.getPageText()) || '';
                            } else {
                                text = dataBuffer.toString();
                            }
                        }
                    } else {
                        text = dataBuffer.toString();
                    }
                } catch (pErr) {
                    console.error('pdf-parse error:', pErr);
                    throw pErr;
                }
            } else if (ext === '.docx') {
                // Try to parse DOCX using mammoth if available
                try {
                    const mammoth = require('mammoth');
                    const m = await mammoth.extractRawText({ buffer: dataBuffer });
                    text = m.value || '';
                } catch (mErr) {
                    console.warn('mammoth not available or failed, falling back to binary->text');
                    text = dataBuffer.toString();
                }
            } else {
                text = dataBuffer.toString();
            }
        } catch (readErr) {
            console.error('Error reading uploaded syllabus file:', readErr);
            try { fs.unlinkSync(req.file.path); } catch (e) {}
            return res.status(400).json({ success: false, error: 'file_read_error', message: readErr.message });
        }

        // Normalize extracted text to a string
        if (typeof text !== 'string') {
            if (text && typeof text === 'object' && 'text' in text) text = text.text;
            else text = String(text);
        }

        // Use AI to parse the syllabus text
        const gradingData = await parseSyllabus(text);
        console.log(`Uploaded syllabus '${req.file.originalname}' ext='${ext}' textLen=${(text||'').length} inferredAssignments=${(gradingData.assignments||[]).length}`);
        if (gradingData.rawResponse) {
            // If parsing returned a rawResponse but no weights/assignments, log it for debugging
            const hasMeaningful = (gradingData.weights && Object.keys(gradingData.weights).length > 0) || (Array.isArray(gradingData.assignments) && gradingData.assignments.length>0) || gradingData.courseName;
            if (!hasMeaningful) {
                console.error('Syllabus AI raw response (likely malformed JSON):\n', gradingData.rawResponse.substring(0, 2000));
            }
        }

        // Determine course: prefer provided courseId, otherwise find/create by courseName
        let course = null;
        if (courseId) {
            course = await Course.findById(courseId);
        }
        if (!course) {
            const name = gradingData.courseName && gradingData.courseName.trim() ? gradingData.courseName.trim() : null;
            if (name) course = await Course.findOne({ courseName: name });
            if (!course) {
                course = new Course({ courseName: name || (`Unknown Course ${Date.now()}`) });
            }
        }

        // Update course with syllabus info
        course.gradingWeights = gradingData.weights || course.gradingWeights;
        course.syllabusRawText = text;
        course.syllabusFileName = req.file.originalname;
        await course.save();

        // Do NOT create assignments from syllabus parsing (per user request)

        try { fs.unlinkSync(req.file.path); } catch (e) {}
        
        res.json({ success: true, weights: gradingData.weights, course: course, inferredCount: (gradingData.assignments || []).length });
    } catch (err) {
        console.error("Syllabus error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/recalculate-priority', async (req, res) => {
    // Algorithm hook coming soon
    res.json({ success: true, message: "Priority recalculated (placeholder)" });
});

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        // Gather full context for AI
        const assignments = await Assignment.find({ status: { $ne: 'history' } });
        const courses = await Course.find();
        const history = await mongoose.model('History').find();

        const aiResponse = await generateChatResponse(message, {
            assignments,
            courses,
            history
        });

        res.json({ response: aiResponse });
    } catch (err) {
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
