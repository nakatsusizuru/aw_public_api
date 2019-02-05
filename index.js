require('dotenv').config();

const fs = require('fs');

const app = require('express')();
const http = require('http');
const https = require('https');

// HTTP & HTTPS Support
const privKey = fs.readFileSync('cert/server.key', 'utf8');
const cert = fs.readFileSync('cert/server.crt', 'utf8');
const creds = {key: privKey, cert: cert};
const httpServer = http.createServer(app);
const httpsServer = https.createServer(creds, app);
httpServer.listen(process.env.HTTP_PORT);
httpsServer.listen(process.env.HTTPS_PORT);

const cors = require('cors');
const logger = require('morgan');
const jwt = require('jsonwebtoken');
const io = require('socket.io').listen(httpServer, {
    origins: ["*:*"]
});
const mongoose = require('mongoose');
const User = require('./app/models/user');
const Script = require('./app/models/script');

const bodyParser = require('body-parser');
mongoose.Promise = global.Promise;
const options = {user: process.env.MONGODB_USER, pass: process.env.MONGODB_PASS, useNewUrlParser: true};
mongoose.connect(`mongodb://${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_NAME}?authSource=admin`, options);

app.use(logger('dev', {
    skip: function (req, res) {
        if (req.url === '/sharedesp') {
            return true;
        } else {
            return false;
        }
    }
}));
app.use(cors());

app.use(bodyParser.json({limit: '20mb'}));
app.use(bodyParser.urlencoded({ extended: true }));

// Public API
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
                User.findOneAndUpdate({_id: decoded.id}, {ipAddress: req.headers["cf-connecting-ip"] || req.headers['x-forwarded-for'] || req.connection.remoteAddress}, () => {});
                next();
            }
        });
    } else {
        next();
    }
});

// Required login
require('./app/user')(app);
require('./app/scriptstore')(app);

app.use((req, res) => {
    return res.status(404).send("Route not found");
});

process.on('unhandledRejection', error => {
    console.error('Uncaught Error', error);
});
