

module.exports = function (app, io) {
    const hri = require('human-readable-ids').hri;
    let currentGames = [];

    io.on('connection', (socket) => {
        let name = socket.handshake.query.name;
        if (name) {
            socket.join(name);
        }
    });

    app.get('/sharedesp', (req, res) => {
        let queryParams = req.query;
        if (!currentGames[queryParams['ip']]) {
            return res.status(200).send("ok");
        }

        let entities = currentGames[queryParams['ip']].entities;
        let data = [];

        entities.forEach((entity) => {
            if (entity.type === "player" && !entity.isDead && Date.now() - entity.lastUpdate < 3000) {
                let playerData = [
                    entity.type,
                    entity.index,
                    entity.team,
                    entity.name,
                    entity.isDead,
                    entity.position.x,
                    entity.position.y,
                    entity.position.z,
                    entity.hp,
                    entity.maxHp,
                    entity.ping,
                    entity.weapon
                ];

                data.push(playerData.join("\t"));
            }
        });

        return res.status(200).send(data.join("\n"));
    });

    app.get('/sharedesp/update', (req, res) => {
        let queryParams = req.query;
        if (!currentGames[queryParams['ip']]) {
            currentGames[queryParams['ip']] = {
                name: hri.random(),
                mapName: queryParams['mapName'],
                rounds: parseInt(queryParams['rounds']),
                entities: []
            };
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
                    team: parseInt(parts[2]),
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
                    gameTime: parseFloat(parts[13]),
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
                    gameTime: parseFloat(parts[6]),
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
                    gameTime: parseFloat(parts[6]),
                    lastUpdate: Date.now()
                };
            }

            if (existingId !== -1 && newEntity) {
                let lastUpdate = entities[existingId].gameTime;
                if (lastUpdate < newEntity.gameTime) {
                    entities[existingId] = newEntity
                }
            } else if (newEntity) {
                entities.push(newEntity);
            }
        });

        io.sockets.in(currentGames[queryParams['ip']].name).emit("data", currentGames[queryParams['ip']]);

        return res.status(200).send(currentGames[queryParams['ip']].name);
    });
};
