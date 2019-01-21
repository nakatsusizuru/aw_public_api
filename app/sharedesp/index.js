

module.exports = function (app, wss) {
    const hri = require('human-readable-ids').hri;
    let clients = [];
    let currentGames = [];

    app.get('/sharedesp/update', (req, res) => {
        let queryParams = req.query;
        if (!currentGames[queryParams['ip']]) {
            currentGames[queryParams['ip']] = {
                name: hri.random(),
                mapName: queryParams['mapName'],
                rounds: parseInt(queryParams['rounds']),
                entities: []
            };
            clients[currentGames[queryParams['ip']].name] = [];
        }

        currentGames[queryParams['ip']].mapName = queryParams['mapName'];

        if (currentGames[queryParams['ip']].rounds < parseInt(queryParams['rounds'])) {
            currentGames[queryParams['ip']].rounds = parseInt(queryParams['rounds']);
            currentGames[queryParams['ip']].entities = [];
            return res.status(200).send(currentGames[queryParams['ip']].name);
        }

        let entityData = queryParams.data;
        entityData.forEach((entity) => {
            let parts = entity.split('\t');
            if (parts[0] === "round_start") {
                currentGames[queryParams['ip']].entities = [];
            }

            let entities = currentGames[queryParams['ip']].entities;
            let existingId = -1;
            let newEntity;

            if (parts[0] === "player") {
                existingId = entities.findIndex(o => o.index === parseInt(parts[1]));

                newEntity = {
                    type: parts[0],
                    index: parseInt(parts[1]),
                    team: parts[2],
                    name: parts[3],
                    isDead: parts[4] === "true",
                    position: {
                        x: parseFloat(parts[5]),
                        y: parseFloat(parts[6]),
                        z: parseFloat(parts[7]),
                        angle: parseFloat(parts[8])
                    },
                    hp: parseInt(parts[9]),
                    maxHp: parseInt(parts[10]),
                    ping: parseInt(parts[11]),
                    weapon: parts[12],
                    lastUpdate: Date.now()
                };
            }

            if (parts[0] === "active_smoke" || parts[0] === "active_molotov") {
                existingId = entities.findIndex(o => o.index === parseInt(parts[1]));

                newEntity = {
                    type: parts[0],
                    index: parseInt(parts[1]),
                    position: {
                        x: parseFloat(parts[2]),
                        y: parseFloat(parts[3]),
                        z: parseFloat(parts[4]),
                    },
                    time: parseFloat(parts[5]),
                    lastUpdate: Date.now()
                };
            }

            if (parts[0] === "c4") {
                existingId = entities.findIndex(o => o.type === parts[0]);

                newEntity = {
                    type: parts[0],
                    index: parseInt(parts[1]),
                    position: {
                        x: parseFloat(parts[2]),
                        y: parseFloat(parts[3]),
                        z: parseFloat(parts[4]),
                    },
                    time: parseFloat(parts[5]),
                    lastUpdate: Date.now()
                };
            }

            if (existingId !== -1 && newEntity) {
                let lastUpdate = entities[existingId].lastUpdate;
                if (lastUpdate < newEntity.lastUpdate) {
                    entities[existingId] = newEntity
                }
            } else if (newEntity) {
                entities.push(newEntity);
            }
        });

        wss.getWss().clients
            .forEach(client => {
                if (client !== wss && clients[currentGames[queryParams['ip']].name].findIndex(o => o == client) > -1) {
                    client.send(JSON.stringify(currentGames[queryParams['ip']]));
                }
            });

        return res.status(200).send(currentGames[queryParams['ip']].name);
    });

    app.ws('/sharedesp/:id', (ws, req) => {
        if (!clients[req.params.id]) {
            clients[req.params.id] = [];
        }

        if (clients[req.params.id].findIndex(o => o == ws) == -1) {
            clients[req.params.id].push(ws);
        }
     ws.on('connection', (c) => {
         c.isAlive = true;
         c.on('pong', () => {
            c.isAlive = true;
         });
     });
    });
};
