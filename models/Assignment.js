const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
    uid: { type: String, required: true, unique: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    
    summary: String,
    start: Date,
    end: Date,
    description: String,
    location: String,
    url: String,
    allDay: Boolean,

    status: { type: String, default: "current" }, // "current" | "toBeGraded" | "history"

    difficulty: { type: Number, min: 1, max: 5 },
    confidence: { type: Number, min: 1, max: 5 },
    grade: Number,
    completedAt: Date,

    estimatedWeight: Number,
    category: String, // Exam | Homework | Quiz | Project
    priorityScore: Number
}, { timestamps: true });

module.exports = mongoose.model('Assignment', assignmentSchema, 'assignments');
