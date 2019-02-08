'use strict';
const bcrypt = require('bcrypt');

const mongoose = require('mongoose');
const User = mongoose.model('User');
const jwt = require('jsonwebtoken');
const helper = require('../helper');
const recaptcha = require('recaptcha-promise');
const moment = require('moment');
recaptcha.init({
    secret_key: process.env.RECAPTCHA_SECRET
});

exports.createUser = (req, res) => {
    if (!req.body.username
        || !req.body.password
        || !req.body.passwordConfirm
        || !req.body.forumName
        || !req.body.captcha) {
        return res.status(400).json({message: "All fields are required"});
    }

    if (req.body.password !== req.body.passwordConfirm) {
        return res.status(400).json({message: "Passwords do not match"});
    }

    recaptcha(req.body.captcha)
        .then(success => {
            if (!success) {
                throw {
                    error: 400,
                    message: "Invalid captcha"
                }
            }
            return User.create({
                username: req.body.username,
                password: req.body.password,
                forumName: req.body.forumName,
                ipAddress: req.headers["cf-connecting-ip"] || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
                role: User.userRoles.MEMBER.name
            })
        })
        .then((user) => {
            if (!user) {
                throw {
                    message: "User not found",
                    status: 400
                }
            }

            const token = jwt.sign({id: user._id}, process.env.JWT_SECRET);
            user.password = undefined;
            return res.status(200).json({message: "Successfully Registered Account", user: user, token: token});
        }).catch(err => {
        if (err.code === 11000) {
            return res.status(500).json({message: "Username already taken!"});
        }
        return helper.handleError(res)(err);
    })
};

exports.authenticate = (req, res) => {
    if (!req.body.username
        || !req.body.password) {
        return res.status(400).json({message: "All fields are required"});
    }

    User.authenticate(req.body.username, req.body.password, {
        date: moment().utc().format("YYYY-MM-DD HH:mm"),
        ipAddress: req.headers["cf-connecting-ip"] || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
    })
        .then(data => {
            if (!data || !data.user || !data.token) {
                throw {
                    message: "Invalid username or password",
                    status: 401
                }
            }

            return res.status(200).json({
                message: "Successfully logged in",
                user: JSON.stringify(data.user),
                token: data.token
            });
        })
        .catch(helper.handleError(res));
};

exports.getUsers = (req, res) => {
    let options = {select: 'id username forumName role ipAddress scriptTokens'};
    let search = {
        "$or": [
            {"username": {$regex: '' + req.query.search + '', $options: 'i'}},
            {"forumName": {$regex: '' + req.query.search + '', $options: 'i'}},
            {"ipAddress": {$regex: '' + req.query.search + '', $options: 'i'}},
            {"role": {$regex: '' + req.query.search + '', $options: 'i'}}
        ]
    };
    if (req.query.limit && req.query.offset) {
        options.limit = parseInt(req.query.limit);
        options.offset = parseInt(req.query.offset);
    }

    return User.paginate(search, options)
        .then(obj => {
            let users = obj.docs;
            const total = obj.total;
            users.forEach((user) => {
                if (User.hasRole(user, User.userRoles.MODERATOR)) {
                    user.ipAddress = "STAFF MEMBER";
                }
            });
            return res.status(200).json({users, total});
        })
        .catch(helper.handleError(res));
};

exports.getUser = (req, res) => {
    let me;
    User.getCurrentUser(req.body.userId)
        .then((user) => {
            me = user;
            if (!User.hasRole(me, User.userRoles.MODERATOR) && !me._id.equals(req.params.userId)) {
                throw {
                    message: "You have no access to this user",
                    error: 401
                };
            }

            return User.findById(req.params.userId, 'username forumName role scriptTokens ipAddress loginAttempts');
        })
        .then(user => {
            if (!user) {
                throw {
                    message: "User not found",
                    status: 401
                }
            }

            if (!User.hasRole(me, User.userRoles.ADMIN) && User.hasRole(user, User.userRoles.ADMIN)) {
                throw {
                    message: "You have no access to this user",
                    error: 401
                }
            }

            return res.status(200).json(user);
        })
        .catch(helper.handleError(res));
};

exports.updateUser = (req, res) => {
    if (!req.body.username
        || !req.body.forumName) {
        return res.status(400).json({message: "All fields are required"});
    }

    if (req.body.password !== req.body.passwordConfirm) {
        return res.status(400).json({message: "Passwords do not match"});
    }

    let isModerator = false;
    let updatedFields = {
        scriptTokens: (typeof req.body.scriptTokens === "string") ? req.body.scriptTokens.split(',') : req.body.scriptTokens,
        forumName: req.body.forumName
    };

    User.getCurrentUser(req.body.userId)
        .then((user) => {
            isModerator = User.hasRole(user, User.userRoles.MODERATOR);
            if (!isModerator && !user._id.equals(req.params.userId)) {
                throw {
                    message: "You have no access to this user",
                    error: 401
                };
            }

            if (isModerator) {
                updatedFields.role = req.body.role || "member";
                updatedFields.username = req.body.username;
            }

            if (req.body.password) {
                return bcrypt.genSalt().then(salt => {
                    return bcrypt.hash(req.body.password, salt);
                })
            }
        })
        .then((hash) => {
            if (hash) {
                updatedFields.password = hash;
            }
            return User.findOneAndUpdate({_id: req.params.userId}, updatedFields);
        })
        .then(user => {
            if (!user) {
                throw {
                    message: "User not found",
                    status: 401
                }
            }
            return res.status(200).json(user);
        })
        .catch(helper.handleError(res));
};

exports.deleteUser = (req, res) => {
    User.getCurrentUser(req.body.userId)
        .then((user) => {
            if (!User.hasRole(user, User.userRoles.MODERATOR) && !user._id.equals(req.params.userId)) {
                throw {
                    message: "You have no access to this user",
                    error: 401
                };
            }

        })
        .catch(helper.handleError(res));
};
