'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const moment = require('moment');

const ScriptSchema = new Schema({
    title: {
        type: String,
        required: "A title is required"
    },
    previousId: {type: mongoose.ObjectId},
    date: {
        type: Date,
        get: (val) => {
            return moment(val).format("YYYY-MM-DD HH:mm")
        },
        default: new Date()
    },
    user: {
        type: mongoose.ObjectId,
        required: "The creator is required"
    },
    author: {
        type: String,
        required: "The author name is required"
    },
    downloads: {
        type: Number,
        required: "Number of downloads is required"
    },
    description: {
        type: String,
        required: "A basic description is required"
    },
    image: {
        type: String,
        required: "An image URL is required"
    },
    code: {
        type: String,
        required: "Code is required"
    },
    approved: {
        type: Boolean
    },
    guiObjects: [Object],
    callbacks: [Object],
    accessTokens: [String]
});

ScriptSchema.set('toObject', { getters: true });
ScriptSchema.set('toJSON', { getters: true });
module.exports = mongoose.model('Script', ScriptSchema);
