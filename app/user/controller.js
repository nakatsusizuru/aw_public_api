'use strict';
const bcrypt = require('bcrypt');

const mongoose = require('mongoose');
const User = mongoose.model('User');
const jwt = require('jsonwebtoken');
const helper = require('../helper');

exports.createUser = (req, res) => {
    if (!req.body.username
        || !req.body.password
        || !req.body.passwordConfirm
        || !req.body.forumName) {
        return res.status(400).json({message: "All fields are required"});
    }

    if (req.body.password !== req.body.passwordConfirm) {
        return res.status(400).json({message: "Passwords do not match"});
    }

    User.create({
        username: req.body.username,
        password: req.body.password,
        forumName: req.body.forumName,
        ipAddress: req.headers["CF-Connecting-IP"] || req.connection.remoteAddress,
        role: User.userRoles.MEMBER.name
    }).then((user) => {
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

    User.authenticate(req.body.username, req.body.password)
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
    return User.find({}, 'id username forumName role ipAddress scriptTokens')
        .then(users => {
            users.forEach((user) => {
                if (User.hasRole(user, User.userRoles.MODERATOR)) {
                    user.ipAddress = "STAFF MEMBER";
                }
            });
            return res.status(200).json(users);
        })
        .catch(helper.handleError(res));
};

exports.getUser = (req, res) => {
    User.getCurrentUser(req.body.userId)
        .then((user) => {
            if (!User.hasRole(user, User.userRoles.MODERATOR) && !user._id.equals(req.params.userId)) {
                throw {
                    message: "You have no access to this user",
                    error: 401
                };
            }

            return User.findById(req.params.userId, 'username forumName role scriptTokens');
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

exports.updateUser = (req, res) => {
    if (!req.body.username
        || !req.body.forumName
        || !req.body.forumName
        || !req.body.scriptTokens) {
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
                return bcrypt.genSalt().then(salt => {return bcrypt.hash(req.body.password, salt);})
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
