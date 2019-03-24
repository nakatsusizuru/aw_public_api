'use strict';
const middleware = require('../auth/middleware');
const mongoose = require('mongoose');
const User = mongoose.model('User');

module.exports = function(app) {
    let controller = require('./controller');

    // GET /scripts is open for anyone, no account or role required
    // POST /scripts requires an account
    // TODO: Perhaps add a 'developer' role and manually assign it as a moderator
    app.route('/scripts')
        .get(controller.listScripts)
        .post(middleware.isLoggedIn, controller.createScript);

    // GET /scripts/:id - Any member can retrieve a script's detail page (if they are the owner or have an access token / are a moderator+)
    // PUT /scripts/:id - Any member can update their own script's information (If they are the owner), Moderator+ can also edit scripts
    // TODO: DELETE /scripts/:id - Any member can delete their own script (If they are the owner), Moderator+ can also remove any script
    app.route('/scripts/:scriptId')
        .get(middleware.isLoggedIn, middleware.hasRole(User.userRoles.MEMBER), controller.getScript)
        .put(middleware.isLoggedIn, middleware.hasRole(User.userRoles.MODERATOR), controller.updateScript)
        .delete(middleware.isLoggedIn, middleware.hasRole(User.userRoles.MODERATOR),  controller.deleteScript);

    app.route('/scripts/image/:scriptId')
        .get(controller.getImage);

    // GET /scripts/code/:id - Anyone can retrieve a script's code (If they are the owner / have an access token), or are a moderator+
    app.route('/scripts/code/:scriptId')
        .get(controller.getScriptCode)
};
