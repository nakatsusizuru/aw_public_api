'use strict';
const helper = require('../helper');
const mongoose = require('mongoose');
const Script = mongoose.model('Script');
const User = mongoose.model('User');
const sortableFields = ["date", "title", "downloads"];
const sharp = require('sharp');
const moment = require('moment');
const luaparse = require('luaparse');
const uuid = require('uuid');

exports.listScripts = (req, res) => {
    let sort = null;
    let user;
    if ((req.query.direction === '1' || req.query.direction === '0') && req.query.sort && sortableFields.indexOf(req.query.sort) > -1) {
        sort = {sort: {}};
        sort.sort[req.query.sort] = req.query.direction === '0' ? -1 : 1;
    }

    let isModerator;

    User.getCurrentUser(req.body.userId)
        .then((obj) => {
            user = obj;
            let filter = {approved: true};
            isModerator = User.hasRole(user, User.userRoles.MODERATOR);

            if (isModerator && !req.query.approved) {
                delete filter.approved;
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

            // TODO: Should probably make this an aggregated query, but I can't be arsed at this point, this will work just fine for now.
            return Script.find(filter, 'title date previousId approved author user downloads description image guiObjects callbacks accessTokens', sort);
        })
        .then((scripts) => {
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

            return res.status(200).json(scripts);
        })
        .catch(helper.handleError(res));
};

exports.createScript = (req, res) => {
    req.body.approved = false;
    req.body.date = undefined;
    req.body.downloads = 0;
    req.body.user = req.body.userId;
    req.body.accessTokens = (typeof req.body.accessTokens === "string") ? req.body.accessTokens.split(',') : req.body.accessTokens;
    delete req.body._id;

    let createdScript;

    User.getCurrentUser(req.body.userId)
        .then((user) => {
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
                return Script.find({_id: {$ne: script._id}, previousId: script.previousId}).remove();
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
                    message: "No access to the given resource",
                    status: 401
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
    let guiObjects = [];
    let callbacks = [];

    const parsedCode = luaparse.parse(code);

    // Remove comments
    parsedCode.comments.forEach((comment) => {
        code = code.replace(comment.raw, '');
    });

    const scope = "S" + uuid.v4().replace(/-/g, '').substr(0, 10);
    code = "script_scopes." + scope + " = {};\n" + code;

    parsedCode.body.forEach((element) => {
        // Replace all global 'local' variable names with something unique
        if (element.type === 'LocalStatement') {
            element.variables.forEach((variable) => {
                if (variable.type === 'Identifier') {
                    let exp = new RegExp('local ' + variable.name);
                    code = code.replace(exp, variable.name);
                    code = code.replace(new RegExp(variable.name, "g"), "script_scopes." + scope + "." + variable.name)
                }
            });

            element.init.forEach((init, index) => {
                // For each GUI element, add it to the list
                if (init.type === 'CallExpression'
                    && init.base.base.name === 'gui'
                    && !(init.base.identifier.name in ['SetValue', 'GetValue', 'Reference', 'Command'])
                ) {
                    guiObjects.push({scope: scope, guiObject: element.variables[index].name});
                }
            });
        } else if (element.type === 'FunctionDeclaration') {
            let exp = new RegExp(element.identifier.name, 'g');
            code = code.replace(exp, "script_scopes." + scope + "." + element.identifier.name);
        } else if (element.type === 'CallStatement' && element.expression.type === 'CallExpression') {
            let expression = element.expression;

            // Handle callbacks.Register
            if (expression.base.base.name === 'callbacks' && expression.base.identifier.name === 'Register') {
                let uniqueId = "C" + uuid.v4().replace(/-/g, '').substr(0, 10);
                // If we already have a unique callback ID, replace it, otherwise add it
                if (expression.arguments[1].type === 'StringLiteral') {
                    code.replace(new RegExp(expression.arguments[1].value, 'g'), uniqueId)
                } else {
                    // Add unique Id
                    code.replace(new RegExp(expression.arguments[0].raw, 'g'), expression.arguments[0].raw + ',"' + uniqueId + '"');
                }

                callbacks.push({id: expression.arguments[0].value, uniqueId: uniqueId});
            }
        }
    });

    code = code.replace(/\t/g, ' ');
    code = code.replace(/\n\n/g, ' ');
    code = code.replace(/\n/g, ' ');

    return {
        code, guiObjects, callbacks
    }
}

exports.updateScript = (req, res) => {
    req.body.date = moment().utc().format("YYYY-MM-DD HH:mm");
    req.body.accessTokens = (typeof req.body.accessTokens === "string") ? req.body.accessTokens.split(',') : req.body.accessTokens;
    delete req.body.user;
    delete req.body.downloads;
    delete req.body.image;

    const transformed = getTransformedCode(req.body.code);
    req.body.code = transformed.code;
    req.body.guiObjects = transformed.guiObjects;
    req.body.callbacks = transformed.callbacks;

    let script;

    Script.findOneAndUpdate({_id: req.body.previousId || req.body._id}, req.body)
        .then(obj => {
            script = obj;
            if (req.body.previousId) {
                return Script.deleteOne({_id: req.body._id});
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
                    message: "No access to the given resource",
                    status: 401
                }
            }

            Script.findOneAndUpdate({_id: req.params._id}, {$inc: {downloads: 1}});

            return res.status(200).send(script.code);
        })
        .catch(helper.handleError(res));
};
