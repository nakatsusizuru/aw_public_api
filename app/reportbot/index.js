const fs = require("fs");
const SteamIDParser = require("./helpers/steamIDParser.js");
const Account = require("./helpers/account.js");
const config = require("./config.json");
config.accounts = require("./accounts.json");
const mongoose = require('mongoose');
const User = mongoose.model('User');
const helper = require('../helper');
const middleware = require('../auth/middleware');
const uuid = require('uuid');

let hitRateLimit = false;
module.exports = function (app, io) {
    io.on('connection', (socket) => {
        let name = uuid.v4();
        socket.join(name);
        socket.on('request', () => {
            socket.emit('name', name);
        });
    });

    app.post('/reportbot/:type/:socketId/:steamId/:numOfBots', middleware.isLoggedIn, (req, res) => {
        let steamID = decodeURI(req.params.steamId);
        let numOfCommends = parseInt(req.params.numOfBots) || 10;
        let chunkCompleteLimit = -1;
        let ioHandler = req.params.socketId;
        let type = req.params.type;

        if (type !== 'report' && type !== 'commend') {
            return res.status(400).json({message: "Invalid type"})
        }
        io.sockets.in(ioHandler).emit("data", "Starting " + (type === 'report' ? "ReportBot" : "CommendBot") + " on target " + steamID + " with " + numOfCommends + " " + (type === 'report' ? "reports" : 'commends'));

        User.getCurrentUser(req.body.userId)
            .then(async (user) => {
                if (!user) {
                    throw {
                        status: 401,
                        message: "Your user account could not be found"
                    }
                }

                if (!user.maxNumOfCommends) {
                    user.maxNumOfCommends = 0;
                }

                if (!user.maxNumOfReports) {
                    user.maxNumOfReports = 0;
                }

                // A moderator can commend unlimited times
                if (!User.hasRole(user, User.userRoles.MODERATOR) && type === 'commend') {
                    // Limit the number of commends per user
                    let commendsDone = 0;
                    if (user.commends) {
                        user.commends.forEach(commend => {
                            // Commend once per 12 hours
                            if (moment(commend.date).isBefore(moment().subtract(12, 'hours'))) {
                                commendsDone += commend.numberOfCommends;
                            }
                        });

                        if (user.maxNumOfCommends - commendsDone < 0) {
                            commendsDone = user.maxNumOfCommends;
                        }
                    }

                    numOfCommends = Math.min(numOfCommends, user.maxNumOfCommends - commendsDone);
                } else if (!User.hasRole(user, User.userRoles.MODERATOR) && type === 'report') {
                    // Limit the number of commends per user
                    let reportsDone = 0;
                    if (user.reports) {
                        user.reports.forEach(report => {
                            // Report once per 12 hours
                            if (moment(report.date).isBefore(moment().subtract(12, 'hours'))) {
                                reportsDone += report.numberOfReports;
                            }
                        });

                        if (user.numberOfReports - reportsDone < 0) {
                            reportsDone = user.maxNumOfCommends;
                        }
                    }

                    numOfCommends = Math.min(numOfCommends, user.numberOfReports - reportsDone);
                }

                if (numOfCommends === 0) {
                    throw {
                        status: 400,
                        message: "You do not have any commends/reports left"
                    }
                }

                const parsed = await SteamIDParser(steamID, process.env.STEAM_AUTH_KEY);
                if (!parsed || !parsed.accountid) {
                    throw {
                        status: 400,
                        message: "SteamID could not be parsed"
                    }
                }

                steamID = parsed.accountid;
                let available;
                if (type === 'commend') {
                    available = config.accounts.filter(a => a.operational === true && a.requiresSteamGuard === false && !a.commended.includes(config.AccountToCommend) && (new Date().getTime() - a.lastCommend) >= config.AccountCooldown);
                } else if (type === 'report') {
                    available = config.accounts.filter(a => a.operational === true && a.requiresSteamGuard === false && (new Date().getTime() - a.lastReport) >= config.AccountCooldown);
                }

                if (available.length < numOfCommends) {
                    throw {
                        status: 500,
                        message: "There are only " + available.length + " accounts remaining"
                    }
                }

                const accountsToUse = available.splice(0, numOfCommends);
                const chunks = chunkArray(accountsToUse, config.Chunks.CommendsPerChunk);

                for (let chunk of chunks) {
                    if (hitRateLimit === true) {
                        io.sockets.in(ioHandler).emit("data", "We have hit the ratelimit, waiting " + config.RateLimitedCooldown + "ms");
                        await new Promise(r => setTimeout(r, config.RateLimitedCooldown));
                    }

                    hitRatelimit = false;

                    chunkCompleteLimit = chunk.length;

                    let promises = [];

                    for (let account of chunk) {
                        if (type === 'commend') {
                            promises.push(accountHandler(io, ioHandler, type, {friendly: req.body.friendly, teacher: req.body.teacher, leader: req.body.leader}, steamID, account));
                        } else if (type === 'report') {
                            promises.push(accountHandler(io, ioHandler, type, {
                                aimbot: req.body.aimbot,
                                wallHack: req.body.wallHack,
                                speedHack: req.body.speedHack,
                                teamHarm: req.body.teamHarm,
                                textAbuse: req.body.textAbuse,
                                voiceAbuse: req.body.voiceAbuse,
                            }, steamID, account));
                        }
                    }

                    await Promise.all(promises);

                    fs.writeFileSync("./accounts.json", JSON.stringify(config.accounts, null, 4));

                    await new Promise(r => setTimeout(r, config.Chunks.BeautifyDelay));
                    io.sockets.in(req.params.steamId).emit("data", "Waiting " + parseInt(config.Chunks.TimeBetweenChunks / 1000) + " second" + (parseInt(config.Chunks.TimeBetweenChunks / 60) === 1 ? "" : "s"));
                    await new Promise(r => setTimeout(r, config.Chunks.TimeBetweenChunks));
                }

                await new Promise(r => setTimeout(r, config.Chunks.BeautifyDelay));
                io.sockets.in(ioHandler).emit("data", "Finished sending " + (type === 'report' ? "reports" : "commends") + " to " + steamID);
                return res.status(200).json({message: "Finished"});
            })
            .catch(helper.handleError(res));
    });
};

function accountHandler(io, ioHandler, type, data, steamId, account) {
    return new Promise(resolve => {
        io.sockets.in(ioHandler).emit("data", "[" + account.username + "] Logging into account");
        const acc = new Account(account.username, account.password);

        acc.on("loggedOn", () => {
            io.sockets.in(ioHandler).emit("data", "[" + account.username + "] Successfully logged into account");
        });

        acc.on("ready", async (hello) => {
            io.sockets.in(ioHandler).emit("data", "[" + account.username + "] Connected to CSGO GameCoordinator");
            await new Promise(r => setTimeout(r, config.Chunks.TimeBetweenConnectionAndSending));

            if (type === 'commend') {
                acc.commend(steamId, (30 * 1000), data.friendly, data.teacher, data.leader).then((response) => {
                    io.sockets.in(ioHandler).emit("data", "[" + account.username + "] Successfully sent a commend");
                    acc.logout();

                    let index = config.accounts.map(a => a.username).indexOf(account.username);
                    if (index >= 0) {
                        config.accounts[index].lastCommend = new Date().getTime();
                        config.accounts[index].commended.push(steamId);
                    }

                    delete acc;
                    resolve();
                }).catch((err) => {
                    // Commending while not even being connected to the GC... Makes sense
                    if (typeof err === "string" && err === "previously_timed_out") {
                        return;
                    }

                    io.sockets.in(ioHandler).emit("error", "[" + account.username + "] Has encountered an error");
                    if (process.env.DEBUG) {
                        console.error(err);
                    }

                    acc.logout();

                    let index = config.accounts.map(a => a.username).indexOf(account.username);
                    if (index >= 0) {
                        config.accounts[index].lastCommend = new Date().getTime();
                        config.accounts[index].commended.push(steamId);
                    }

                    delete acc;
                    resolve();
                });
            } else if (type === 'report') {
                acc.report(steamId, "", (30 * 1000), data.aimbot, data.wallHack, data.speedHack, data.teamHarm, data.textAbuse, data.voiceAbuse).then((response) => {
                    io.sockets.in(ioHandler).emit("data", "[" + account.username + "] Successfully sent a report");

                    acc.logout();

                    let index = config.accounts.map(a => a.username).indexOf(account.username);
                    if (index >= 0) {
                        config.accounts[index].lastReport = new Date().getTime();
                    }

                    delete acc;
                    resolve();
                }).catch((err) => {
                    // Reporting while not even being connected to the GC... Makes sense
                    if (typeof err === "string" && err === "previously_timed_out") {
                        return;
                    }

                    io.sockets.in(ioHandler).emit("error", "[" + account.username + "] Has encountered an error");
                    if (process.env.DEBUG) {
                        console.error(err);
                    }

                    acc.logout();

                    let index = config.accounts.map(a => a.username).indexOf(account.username);
                    if (index >= 0) {
                        config.accounts[index].lastReport = new Date().getTime();
                    }

                    delete acc;
                    resolve();
                });
            }
        });

        acc.on("steamGuard", () => {
            io.sockets.in(ioHandler).emit("error", "[" + account.username + "] Requires a SteamGuard code");

            let index = config.accounts.map(a => a.username).indexOf(account.username);
            if (index >= 0) {
                config.accounts[index].requiresSteamGuard = true;
            }

            acc.logout();

            delete acc;
            resolve();
        });

        acc.on("error", (err) => {
            io.sockets.in(ioHandler).emit("error", "[" + account.username + "] Has encountered an error");
            if (process.env.DEBUG) {
                console.error(err);
            }

            if (err.eresult === 84) {
                // we have hit the ratelimit set "hitRatelimit" to true
                hitRatelimit = true;
            }

            let index = config.accounts.map(a => a.username).indexOf(account.username);
            if (index >= 0) {
                // If the error is "RateLimitExceeded" just ignore it, we can still use the account just fine after the ratelimit is over
                config.accounts[index].operational = isNaN(err.eresult) ? false : (err.eresult === 84 ? true : err.eresult);
            }

            acc.logout();

            delete acc;
            resolve();
        });
    }).catch(err => {
        if (account) {
            io.sockets.in(ioHandler).emit("error", "[" + account.username + "] Has encountered an error");

            if (process.env.DEBUG) {
                console.error(err);
            }

            var index = config.accounts.map(a => a.username).indexOf(account.username);
            if (index >= 0) {
                config.accounts[index].operational = isNaN(err.eresult) ? false : err.eresult;
            }
        }

        if (typeof acc !== "undefined") {
            acc.logout();
        }

        delete acc;
    });
}

function chunkArray(myArray, chunk_size) {
    let tempArray = [];

    for (let index = 0; index < myArray.length; index += chunk_size) {
        const myChunk = myArray.slice(index, index + chunk_size);
        tempArray.push(myChunk);
    }

    return tempArray;
}
