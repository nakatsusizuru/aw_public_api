'use strict';
const mongoose = require('mongoose');
const Script = mongoose.model('Script');
const User = mongoose.model('User');
const sortableFields = ["date", "title", "downloads"];

exports.listScripts = (req, res) => {
    let sort = null;
    if ((req.query.direction === '1' || req.query.direction === '0') && req.query.sort && sortableFields.indexOf(req.query.sort) > -1) {
        sort = {sort: {}};
        sort.sort[req.query.sort] = req.query.direction === '0' ? -1 : 1;
    }

    User.getCurrentUser(req.body.userId).then((user) => {
        let filter = {approved: true};

        if (user && req.query.justMine) {
            filter.user = user._id;
        }

        const isModerator = User.hasRole(user, User.userRoles.MODERATOR);

        if (isModerator) {
            filter.approved = undefined;
        }

        // TODO: Should probably make this an aggregated query, but I can't be arsed at this point, this will work just fine for now.
        return Script.find(filter, 'title date author user downloads description image guiObjects callbacks accessTokens', sort, (err, scripts) => {
            if (err) return res.status(500).json({message: "An internal server error occurred"});

            // Moderators should always have access
            if (!isModerator) {

                if (user) {
                    // Filter based on us being the owner, or us having access to it through a token
                    scripts = scripts.filter(obj => obj.accessTokens.some(token => user.scriptTokens.includes(token)) || obj.user === user._id);
                } else {
                    // We're not logged in, so only return the publicly available scripts
                    scripts = scripts.filter(obj => obj.accessTokens.length === 0);
                }

                // We don't want to give users access to the accessTokens property x)
                scripts = scripts.map((item) => {if (!user || item.user !== user._id) {item.accessTokens = undefined; item.user = undefined;} return item});
            }

            return res.status(200).json(scripts);
        });
    });
};

exports.createScript = (req, res) => {
    req.body.approved = false;
    req.body.version = 1;
    req.body.date = undefined;
    req.body.downloads = 0;
    User.getCurrentUser(req.body.userId).then((user) => {
        req.body.user = user._id;
        let newScript = new Script(req.body);
        newScript.save((err) => {
            console.log(err);
            if (err) return res.status(500).json({message: "An internal server error occurred"});
            return res.status(200).json({message: "Your script has been created"});
        });
    });
};

exports.getScript = (req, res) => {
    User.getCurrentUser(req.body.userId).then((user) => {
        if (!User.hasRole(user, User.userRoles.MODERATOR)) {
            return res.status(401).json({message: "You have no access to this script"});
        }

        return User.findById(req.params.userId, 'username forumName role scriptTokens', (err, user) => {
            if (err) return res.status(500).json({message: "This user was not found"});
            return res.status(200).json(user);
        });
    });
};

exports.updateScript = (req, res) => {
    Script.findOneAndUpdate({_id: req.params.scriptId}, req.body, {new: true}, (err, script) => {
        if (err) return res.status(500).json({message: "An internal server error occurred"});
        return res.json(script);
    })
};

exports.deleteScript = (req, res) => {
    Script.deleteOne({_id: req.params.scriptId}, (err) => {
        if (err) return res.status(500).json({message: "An internal server error occurred"});
        return res.json({ message: "Script removed"});
    });
};

exports.getScriptCode = (req, res) => {
    Script.findById(req.params.scriptId, (err, script) => {
        if (err) return res.status(500).json({message: "An internal server error occurred"});
        return res.json(script);
    });
};
