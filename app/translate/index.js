const translate = require('@vitalets/google-translate-api');

module.exports = function (app) {
    app.get('/translate', (req, res) => {
        let queryParams = req.query;

        if (!queryParams['from']) {
            queryParams['from'] = "auto";
        }

        if (!queryParams['team']) {
            queryParams['team'] = false;
        }

        if (!queryParams['name'] || !queryParams['msg'] || !queryParams['to']) {
            return res.status(500).send("Invalid parameters");
        }

        translate(queryParams['msg'], {from: queryParams['from'], to: queryParams['to']})
            .then(reply => {
                return res.status(200).send("" + reply.from.language.iso + " -> " + queryParams['to'] + "" + ((queryParams['team'] == 1) ? ' (team) ' : ' ') + queryParams['name'] + ": " + reply.text);
            }).catch(err => {
            return res.status(500).send(err)
        });
    });
};