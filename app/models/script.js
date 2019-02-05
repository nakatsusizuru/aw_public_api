'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const moment = require('moment');
const User = mongoose.model('User');

const ScriptSchema = new Schema({
    title: {
        type: String,
        required: "A title is required"
    },
    previousId: {type: mongoose.ObjectId},
    date: {
        type: Date,
        get: (val) => {
            return moment(val).utc().format("YYYY-MM-DD HH:mm")
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
        required: "An image is required"
    },
    originalCode: {
        type: String,
        required: "Original code is required"
    },
    code: {
        type: String,
        required: "Code is required"
    },
    approved: {
        type: Boolean
    },
    callbacks: [Object],
    accessTokens: [String]
});

ScriptSchema.statics.userCanView = (user, script) => {
    // Moderators can always access scripts
    if (User.hasRole(user, User.userRoles.MODERATOR)) {
        return true;
    }

    // User can view publicly accessible scripts
    if (!user) {
        return script.accessTokens.length === 0;
    }

    // User can access his own scripts
    if (script.user.equals(user._id)) {
        return true;
    }

    // User can be assigned access tokens for scripts
    return script.accessTokens.length === 0 || script.accessTokens.some(token => user.scriptTokens.includes(token));
};

ScriptSchema.set('toObject', { getters: true });
ScriptSchema.set('toJSON', { getters: true });
module.exports = mongoose.model('Script', ScriptSchema);
