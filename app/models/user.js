'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const UserSchema = new Schema({
    username: {
        type: String,
        unique: true,
        required: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    forumName: {
        type: String,
        required: true
    },
    ipAddress: {
        type: String,
        required: true
    },
    role: {
        type: String,
        required: true
    },
    scriptTokens: [Object]
});

UserSchema.statics.authenticate = (username, password, callback) => {
    User.findOne({username: username}, (err, user) => {
        if (err) return callback(err);
        if (!user) return callback("User not found");
        bcrypt.compare(password, user.password, (err, result) => {
            if (result === true) {
                const token = jwt.sign({id: user._id}, process.env.JWT_SECRET);
                return callback(null, {user: user, token: token});
            }
            callback("Invalid username or password");
        });
    });
};

UserSchema.statics.userRoles = {
    MEMBER: {
        name: "member",
        inherits: []
    },
    MODERATOR: {
        name: "moderator",
        inherits: [
            "member"
        ]
    },
    ADMIN: {
        name: "admin",
        inherits: [
            "moderator",
            "member"
        ]
    }
};

UserSchema.statics.hasRole = (user, role) => {
    return user && (user.role === role.name || role.inherits.findIndex(r => r === user.role) >= -1);
};

UserSchema.statics.getCurrentUser = (userId) => {
    return new Promise((resolve, reject) => {
        if (!userId) {
            return resolve();
        }

        return User.findById(userId, (err, user) => {
            if (err) return reject(err);
            return resolve(user);
        });
    });
};

UserSchema.pre('save', function(next) {
    let user = this;
    bcrypt.hash(user.password, 10, (err, hash) => {
        if (err) return next(err);
        user.password = hash;
        next();
    })
});

const User = mongoose.model('User', UserSchema);
module.exports = User;
