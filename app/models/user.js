'use strict';
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');
const Schema = mongoose.Schema;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const UserSchema = new Schema({
    username: {
        type: String,
        unique: true,
        required: true,
        trim: true,
        lowercase: true
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
    scriptTokens: [Object],
    loginAttempts: [Object],
    maxNumOfCommends: {type: Number},
    maxNumOfReports: {type: Number},
    commends: [Object],
    reports: [Object]
});

UserSchema.statics.authenticate = (username, password, loginAttemptRecord) => {
    return new Promise((resolve, reject) => {
        User.findOne({username: username}, (err, user) => {
            if (err) return reject(err);
            if (!user) return resolve("User not found");
            User.update({username: username}, {$push: {loginAttempts: loginAttemptRecord}}).then().catch();
            bcrypt.compare(password, user.password, (err, result) => {
                if (result === true) {
                    const token = jwt.sign({id: user._id}, process.env.JWT_SECRET);
                    return resolve({user: user, token: token});
                }
                reject({status: 401, message:"Invalid username or password"});
            });
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

UserSchema.statics.getRoleByName = (name) => {
    return UserSchema.statics.userRoles[Object.keys(UserSchema.statics.userRoles).find((key) => UserSchema.statics.userRoles[key].name === name)];
};

UserSchema.statics.hasRole = (user, role) => {
    return user && (user.role === role.name || (UserSchema.statics.getRoleByName(user.role).inherits.findIndex(r => r === role.name) !== -1));
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
    bcrypt.genSalt()
        .then(salt => {
            return bcrypt.hash(user.password, salt);
        })
        .then(hash => {
            user.password = hash;
            next();
        })
        .catch(err => next(err));
});

UserSchema.plugin(mongoosePaginate);

const User = mongoose.model('User', UserSchema);
module.exports = User;
