require('dotenv').config();

const app = require('express')();
const server = app.listen(80);
const cors = require('cors');
const logger = require('morgan');
const jwt = require('jsonwebtoken');
const io = require('socket.io').listen(server, {
    origins: ["*:*"]
});
const mongoose = require('mongoose');
const User = require('./app/models/user');
const Script = require('./app/models/script');

const bodyParser = require('body-parser');
mongoose.Promise = global.Promise;
const options = {user: process.env.MONGODB_USER, pass: process.env.MONGODB_PASS, useNewUrlParser: true};
mongoose.connect(`mongodb://${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_NAME}?authSource=admin`, options);

app.use(logger('dev'));
app.use(cors());

app.use(bodyParser.json({limit: '20mb'}));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
});

require('./app/translate')(app);
require('./app/sharedesp')(app, io);
require('./app/awusers')(app, io);

app.use(function (req, res, next) {
    let token = req.headers['x-access-token'] || req.query.token;
    if (token && token !== '') {
        jwt.verify(token, process.env.JWT_SECRET, function (err, decoded) {
            if (err) {
                return res.json({message: "Your authentication key is invalid"});
            } else {
                req.body.userId = decoded.id;
                // Update the IP Address for the given user (We just ignore failures)
                User.findOneAndUpdate({_id: decoded.id}, {ipAddress: req.headers["CF-Connecting-IP"] || req.connection.remoteAddress}, () => {});
                next();
            }
        });
    } else {
        next();
    }
});
require('./app/user')(app);
require('./app/scriptstore')(app);

app.use((req, res) => {
    return res.status(404).send("Route not found");
});

process.on('unhandledRejection', error => {
    console.error('Uncaught Error', error);
});
