const mongoose = require('mongoose');
const User = mongoose.model('User');

module.exports = {
    isLoggedIn: (req, res, next) => {
        if (req.body.userId) {
            return next();
        } else {
            return res.status(401).json({message: "You need to be logged in to use this call"});
        }
    },
    hasRole: (role) => {
        return (req, res, next) => {
            User.findById(req.body.userId, (err, user) => {
                if (err) return res.status(500).json({message: "An error occurred while retrieving your user"});
                if (!User.hasRole(user, role)) return res.status(401).json({message: "You do not have access to this call"});
                return next();
            });
        };
    }
};
