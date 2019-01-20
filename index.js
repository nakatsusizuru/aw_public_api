const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 80;

app.use(bodyParser.urlencoded({ extended: true }));
require('./app/translate')(app, {});

app.get('/', (req, res) => {
    res.send('Fuck you');
});

app.listen(port, () => {
    console.log('We are live on ' + port);
});
