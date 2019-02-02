'use strict';
const mongoose = require('mongoose');
const User = mongoose.model('User');
const jwt = require('jsonwebtoken');

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
    }, (err, user) => {
        if (err) {
            console.log(err);
            if (err.code === 11000) {
                return res.status(500).json({message: "Username is already taken!"});
            }
            return res.status(500).json({message: "An internal server error occurred"});
        }
        const token = jwt.sign({id: user._id}, process.env.JWT_SECRET);
        console.log(token);
        user.password = undefined;
        return res.status(200).json({message: "Successfully Registered Account", user: user, token: token});
    });
};

exports.authenticate = (req, res) => {
    if (!req.body.username
        || !req.body.password) {
        return res.status(400).json({message: "All fields are required"});
    }

    User.authenticate(req.body.username, req.body.password, (err, data) => {
        if (err || !data || !data.user || !data.token) {
            return res.status(401).json({message: "Invalid username or password."});
        }

        return res.status(200).json({message: "Successfully logged in", token: data.token});
    });
};

exports.logout = (res, req) => {
    if (req.session) {
        req.session.destroy(err => {
            if (err) return res.status(500).json({message: "Failed to log out"});
            return res.status(200).json({message: "Successfully logged out"});
        });
    }
};

exports.getUser = (req, res) => {
    User.getCurrentUser(req.body.userId).then((user) => {
        if (!User.hasRole(user, User.userRoles.MODERATOR) && user._id !== req.params.userId) {
            return res.status(401).json({message: "You have no access to this user"});
        }

        return User.findById(req.params.userId, 'username forumName role scriptTokens', (err, user) => {
            if (err) return res.status(500).json({message: "This user was not found"});
            return res.status(200).json(user);
        });
    });
};

exports.updateUser = (req, res) => {
    User.getCurrentUser(req.body.userId).then((user) => {
        if (!User.hasRole(user, User.userRoles.MODERATOR) && user._id !== req.params.userId) {
            return res.status(401).json({message: "You are not allowed to update this user"});
        }

        return User.findById(req.params.userId, (err, user) => {
            if (err) return res.status(500).json({message: "This user was not found"});
            return res.status(200).json(user);
        });
    });
};

exports.deleteUser = (req, res) => {
    User.getCurrentUser(req.body.userId).then((user) => {
        if (!User.hasRole(user, User.userRoles.MODERATOR) && user._id !== req.params.userId) {
            return res.status(401).json({message: "You are not allowed to delete this user"});
        }


    });
};
