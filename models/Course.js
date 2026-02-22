const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    courseName: { type: String, required: true },
    instructor: String,

    gradingWeights: {
        type: Map,
        of: Number,
        default: {
            Homework: 20,
            Exams: 50,
            Quizzes: 10,
            Projects: 20
        }
    },

    totalWeight: { type: Number, default: 100 },

    syllabusRawText: String,
    syllabusFileName: String
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema, 'courses');
