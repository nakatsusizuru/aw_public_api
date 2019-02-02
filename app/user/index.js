'use strict';

const middleware = require('../auth/middleware');
const mongoose = require('mongoose');
const User = mongoose.model('User');

module.exports = function(app) {
    let controller = require('./controller');

    // POST /users - Anyone can make an account
    app.route('/users')
        .post(controller.createUser);

    // GET /users/:id - Anyone can retrieve their own profile, moderator or above can retrieve other users
    // PUT /users/:id - Anyone can update their own profile, moderator or above can update other users
    // DELETE /users/:id - Anyone can delete their own profile, moderators or above can update other users
    app.route('/users/:userId')
        .get(middleware.isLoggedIn, middleware.hasRole(User.userRoles.MEMBER), controller.getUser)
        .put(middleware.isLoggedIn, middleware.hasRole(User.userRoles.MEMBER), controller.updateUser)
        .delete(middleware.isLoggedIn, middleware.hasRole(User.userRoles.MODERATOR), controller.deleteUser);

    // POST /users/login - Anyone can log in
    app.post('/users/authenticate', controller.authenticate);

    // GET /users/logout - Anyone can log out
    app.get('/users/logout', middleware.isLoggedIn, controller.logout);
};
