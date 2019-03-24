'use strict';

const middleware = require('../auth/middleware');
const mongoose = require('mongoose');
const User = mongoose.model('User');

module.exports = function(app) {
    let controller = require('./controller');

    // POST /users - Anyone can make an account
    app.route('/users')
        .get(middleware.isLoggedIn, middleware.hasRole(User.userRoles.MODERATOR), controller.getUsers)
        .post(controller.createUser);

    // GET /users/:id - Anyone can retrieve their own profile, moderator or above can retrieve other users
    // PUT /users/:id - Anyone can update their own profile, moderator or above can update other users
    // TODO: DELETE /users/:id - Moderators or above can delete users
    app.route('/users/:userId')
        .get(middleware.isLoggedIn, middleware.hasRole(User.userRoles.MEMBER), controller.getUser)
        .put(middleware.isLoggedIn, middleware.hasRole(User.userRoles.MEMBER), controller.updateUser)
        // .delete(middleware.isLoggedIn, middleware.hasRole(User.userRoles.MODERATOR), controller.deleteUser);

    // POST /users/login - Anyone can log in
    app.post('/users/authenticate', controller.authenticate);
};
