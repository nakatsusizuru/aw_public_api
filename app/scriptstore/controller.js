'use strict';
const helper = require('../helper');
const mongoose = require('mongoose');
const Script = mongoose.model('Script');
const User = mongoose.model('User');
const sortableFields = ["date", "title", "downloads"];
const sharp = require('sharp');
const moment = require('moment');
const luaparse = require('luaparse');
const luamin = require('luamin');
const uuid = require('uuid');
const recaptcha = require('recaptcha-promise');
recaptcha.init({
    secret_key: process.env.RECAPTCHA_SECRET
});

exports.listScripts = (req, res) => {
    let filter = {approved: true};
    let options = {select: 'title date previousId approved author user downloads description callbacks accessTokens', sort: {}};
    let user;
    if ((req.query.direction === '1' || req.query.direction === '0') && req.query.sort && sortableFields.indexOf(req.query.sort) > -1) {
        options.sort[req.query.sort] = req.query.direction === '0' ? -1 : 1;
    }

    if (req.query.limit && req.query.offset) {
        options.limit = parseInt(req.query.limit);
        options.offset = parseInt(req.query.offset);
    }

    let isModerator;

    User.getCurrentUser(req.body.userId)
        .then((obj) => {
            user = obj;
            isModerator = User.hasRole(user, User.userRoles.MODERATOR);

            if (isModerator && req.query.approved === 'false') {
                filter.approved = false;
            }

            if (user && req.query.justmine) {
                filter.user = user._id;
                delete filter.approved;
            }

            if (req.query.search && req.query.search !== '') {
                let orFilter = {
                    "$or": [
                        {title: {$regex: '' + req.query.search + '', $options: 'i'}},
                        {author: {$regex: '' + req.query.search + '', $options: 'i'}},
                        {description: {$regex: '' + req.query.search + '', $options: 'i'}}
                    ]
                };

                if (Object.keys(filter).length > 0) {
                    filter = {
                        "$and": [
                            filter,
                            orFilter
                        ]
                    };
                } else {
                    filter = orFilter;
                }
            }
            return Script.paginate(filter, options);
        })
        .then((obj) => {
            let scripts = obj.docs;
            const total = obj.total;
            scripts = scripts.filter(obj => Script.userCanView(user, obj));

            // Moderators should always have access
            if (!isModerator) {
                // We don't want to give users access to the accessTokens property x)
                scripts = scripts.map((item) => {
                    if (!user || item.user !== user._id) {
                        item.accessTokens = undefined;
                        item.user = undefined;
                    }
                    return item
                });
            }

            let updatedScripts = [];
            scripts.forEach(script => {
                if (script.previousId) {
                    let index = scripts.findIndex(s => s._id.equals(script.previousId));
                    if (index >= 0) {
                        updatedScripts.push(index);
                    }
                }
            });

            updatedScripts.forEach(id => {
                delete scripts[id];
            });

            scripts = scripts.filter(e => e);
            return res.status(200).json({scripts, total});
        })
        .catch(helper.handleError(res));
};

exports.createScript = (req, res) => {
    req.body.approved = false;
    req.body.date = undefined;
    req.body.downloads = 0;
    req.body.user = req.body.userId;
    req.body.originalCode = req.body.code;
    if (!req.body.previousId && req.body._id) {
        req.body.previousId = req.body._id;
    }
    req.body.accessTokens = (typeof req.body.accessTokens === "string") ? req.body.accessTokens.split(',') : req.body.accessTokens;
    delete req.body._id;

    let createdScript;
    let foundUser;
    recaptcha(req.body.captcha)
        .then(success => {
            if (!success) {
                throw {
                    error: 400,
                    message: "Invalid captcha"
                }
            }
            return User.getCurrentUser(req.body.userId);
        })
        .then((user) => {
            foundUser = user;
            req.body.user = user._id;
            req.body.author = user.forumName;
            return sharp(new Buffer(req.body.image.replace(/^data:image\/png;base64,/, ""), 'base64'))
                .resize(200, 200)
                .toBuffer();
        })
        .then((buffer) => {
            req.body.image = `data:image/png;base64,${buffer.toString('base64')}`;
            let newScript = new Script(req.body);
            return newScript.save();
        })
        .then(script => {
            createdScript = script;
            if (script.previousId) {
                return Script.find({_id: {$ne: script._id}, previousId: script.previousId})
                    .then(docs => {
                        if (Array.isArray(docs)) {
                            docs.forEach(doc => {
                                // Make sure that we only remove our own x)
                                if (User.hasRole(foundUser, User.userRoles.MODERATOR) || doc.user.equals(foundUser._id)) {
                                    doc.remove();
                                }
                            })
                        }
                    });
            }
        })
        .then(() => {
            return res.status(200).json({message: "Your script has been created", script: createdScript});
        })
        .catch(helper.handleError(res))
};

exports.getImage = (req, res) => {
    let user;
    User.getCurrentUser(req.body.userId)
        .then((result) => {
            user = result;
            return Script.findById(req.params.scriptId, 'accessTokens user image');
        })
        .then((script) => {
            if (!script) {
                throw {
                    message: "Script not found",
                    status: 400
                }
            }

            if (!Script.userCanView(user, script)) {
                throw {
                    message: "access_denied",
                    status: 401,
                    send: true
                }
            }

            let data = script.image.replace(/^data:image\/png;base64,/, "");
            return res.header('Content-Type', 'image/png').send(new Buffer(data, 'base64'));
        })
        .catch(helper.handleError(res))
};

exports.getScript = (req, res) => {
    let script;

    Script.findById(req.params.scriptId)
        .then((obj) => {
            script = obj;
            return User.getCurrentUser(req.body.userId);
        })
        .then((user) => {
            // Only moderators and the owners may view this script
            if (!User.hasRole(user, User.userRoles.MODERATOR) && !script.user.equals(user._id)) {
                throw {
                    message: "You don't have access to this script",
                    status: 401
                }
            }

            return res.status(200).json(script);
        })
        .catch(helper.handleError(res));
};

function getTransformedCode(code) {
    let callbacks = [];


    const parsedCode = luaparse.parse(code);

    parsedCode.body.forEach((element) => {
        code = parseElement(element, callbacks, code);
    });

    code = luamin.minify(code);

    return {
        code, callbacks
    }
}

function parseElement(element, callbacks, code) {
    // Replace all global 'local' variable names with something unique
    if (element.type === 'FunctionDeclaration') {
        // Rewrite functions to be local
        if (element.isLocal === false) {
            code = code.replace(new RegExp("function.*" + element.identifier.name), "local function " + element.identifier.name);
        }
    } else if (element.type === 'CallStatement' && element.expression.type === 'CallExpression') {
        let expression = element.expression;

        // Handle callbacks.Register
        if (expression.base.base.name === 'callbacks' && expression.base.identifier.name === 'Register') {
            let uniqueId = "C" + uuid.v4().replace(/-/g, '').substr(0, 10);
            // If we already have a unique callback ID, replace it, otherwise add it
            if (expression.arguments[1].type === 'StringLiteral') {
                code = code.replace(new RegExp(expression.arguments[1].value, 'g'), uniqueId)
            } else {
                code = code.replace(new RegExp(expression.arguments[0].raw, 'g'), expression.arguments[0].raw + ',"' + uniqueId + '"');
            }

            callbacks.push({id: expression.arguments[0].value, uniqueId: uniqueId});
        }
    }
    return code;
}

exports.updateScript = (req, res) => {
    req.body.date = moment().utc().format("YYYY-MM-DD HH:mm");
    req.body.accessTokens = (typeof req.body.accessTokens === "string") ? req.body.accessTokens.split(',') : req.body.accessTokens;
    delete req.body.user;
    delete req.body.downloads;
    delete req.body.image;
    req.body.originalCode = req.body.code;

    const transformed = getTransformedCode(req.body.code);

    req.body.code = transformed.code;
    req.body.callbacks = transformed.callbacks;

    let prevId = req.body.previousId;
    let id = req.body._id;
    delete req.body._id;
    delete req.body.previousId;

    let script;

    Script.findOneAndUpdate({_id: prevId || id}, req.body)
        .then(obj => {
            script = obj;
            if (prevId && prevId !== id) {
                return Script.find({_id: id}).remove();
            }
        })
        .then(() => {
            return res.status(200).json(script);
        })
        .catch(helper.handleError(res));
};

exports.deleteScript = (req, res) => {
    Script.deleteOne({_id: req.params.scriptId}, (err) => {
        if (err) return res.status(500).json({message: "An internal server error occurred"});
        return res.json({message: "Script removed"});
    });
};

exports.getScriptCode = (req, res) => {
    let user;
    User.getCurrentUser(req.body.userId)
        .then((result) => {
            user = result;
            return Script.findById(req.params.scriptId, 'accessTokens user code');
        })
        .then(script => {
            if (!Script.userCanView(user, script)) {
                throw {
                    message: "access_denied",
                    status: 401,
                    send: true
                }
            }

            Script.findOneAndUpdate({_id: req.params.scriptId}, {$inc: {downloads: 1}}).then().catch();

            return res.status(200).send(script.code);
        })
        .catch(helper.handleError(res));
};
