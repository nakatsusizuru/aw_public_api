module.exports = function (app) {
    app.get('/routing/servers', (req, res) => {
        let servers = [
            "http://eu1.shadyretard.io",
            "http://na1.shadyretard.io"
        ];
        return res.status(200).send(servers.join(','));
    });

    app.get('/routing/latency', (req, res) => {
        let queryParams = req.query;

        if (!queryParams['time']) {
            return res.status(500).send("Invalid parameters");
        }

        return res.status(200).send(queryParams['time']);
    });
};
