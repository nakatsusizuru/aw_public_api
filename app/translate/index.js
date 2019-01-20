const translate = require('@k3rn31p4nic/google-translate-api');

module.exports = function (app) {
    app.get('/translate', (req, res) => {
        let queryParams = req.query;

        if (!queryParams['from']) {
            queryParams['from'] = "auto";
        }

        if (!queryParams['type'] || !queryParams['name'] || !queryParams['msg'] || !queryParams['to']) {
            return res.status(500).send("Invalid parameters");
        }

        translate(queryParams['msg'], {from: queryParams['from'], to: queryParams['to']})
            .then(reply => {
                let message = reply.from.language.iso + " -> " + queryParams['to'] + "" + ((queryParams['team'] == 1) ? ' (team) ' : ' ') + queryParams['name'] + ": " + reply.text;
                if (queryParams['type'] == "ME_ALL" || queryParams['type'] == "ME_TEAM") {
                    message = reply.text;
                }
                return res.status(200).send(message);
            }).catch(err => {
            return res.status(500).send(err)
        });
    });
};
