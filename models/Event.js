const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    uid: { type: String, required: true, unique: true },
    summary: String,
    start: Date,
    end: Date,
    description: String,
    location: String,
    dtstamp: Date,
    url: String,
    allDay: Boolean,
    status: { type: String, default: "current" },
    difficulty: Number,
    confidence: Number,
    grade: String,
    extendedEnd: Date,
    priorityScore: Number,
    embedding: [Number]
}, { timestamps: true });

// Ensure we use the 'events' collection in 'hackuncp' database
module.exports = mongoose.model('Event', eventSchema, 'events');
