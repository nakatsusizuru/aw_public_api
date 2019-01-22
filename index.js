const app = require('express')();
const server = app.listen(80);
const io = require('socket.io').listen(server, {
    origins: ["localhost:63343"]
});

const bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({ extended: true }));

app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept-Type');
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
})

require('./app/translate')(app, io);
require('./app/sharedesp')(app, io);

app.get('/', (req, res) => {
    res.send('Fuck you');
});