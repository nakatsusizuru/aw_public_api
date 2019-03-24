const SteamID = require("steamid");
const SteamAPI = require("steamapi");
const steam = new SteamAPI(process.env.STEAM_AUTH_KEY, {enabled: true, disableWarnings: true});

module.exports = function (app) {
    app.get('/playerinfo/:steamid', (req, res) => {
        let steamid = req.params.steamid;
        steamid = new SteamID(steamid).getSteamID64();

        let promises = [
            steam.getUserSummary(steamid),
            steam.getUserStats(steamid, "730"),
            steam.getUserLevel(steamid),
            steam.getUserBans(steamid),
            steam.getUserFriends(steamid)
        ];

        promises = promises.map(p => p.catch(e => ""));

        Promise.all(promises).then(values => {
            return res.status(200).send({
                summary: values[0],
                stats: values[1],
                level: values[2],
                bans: values[3],
                friends: values[4]
            });
        });
    });
};
