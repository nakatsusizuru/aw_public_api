const Events = require("events");
const SteamUser = require("steam-user");
const SteamTotp = require("steam-totp");
const Steam = require("steam-client");

const GameCoordinator = require("./GameCoordinator.js");

module.exports = class Account extends Events {
	constructor(username, password, sharedSecret = undefined, proxy = undefined, timeout = 60000) {
		super();

		// Self reference
		const self = this;

		this.steamClient = new Steam.CMClient();

		if (proxy) {
			this.steamClient.setHttpProxy(proxy);
		}
		this.steamUser = new SteamUser(this.steamClient, {
			promptSteamGuardCode: false
		});
		this.csgoUser = new GameCoordinator(this.steamUser);

		var logonSettings = {
			accountName: username,
			password: password
		};

		if (sharedSecret && sharedSecret.length > 5) {
			logonSettings.twoFactorCode = SteamTotp.getAuthCode(sharedSecret);
		}

		this.steamUser.logOn(logonSettings);

		this.steamUser.once("steamGuard", (domain, callback, lastCodeWrong) => {
			this.emit("steamGuard");
		});

		this.steamUser.once("loggedOn", async () => {
			var success = await new Promise((resolve, reject) => {
				// Check license for CSGO
				if (this.steamUser.licenses !== null) {
					var filter = this.steamUser.licenses.filter(l => l.package_id === 303386 || l.package_id === 54029);
					if (filter.length <= 0) {
						// Request CSGO license
						this.steamUser.requestFreeLicense(730, (err, grantedPackages, grantedAppIDs) => {
							if (err) {
								reject(err);
								return;
							}

							resolve(true);
						});
					}
				}

				// Request CSGO license
				this.steamUser.requestFreeLicense(730, (err, grantedPackages, grantedAppIDs) => {
					if (err) {
						reject(err);
						return;
					}

					resolve(true);
				});
			}).catch((err) => {
				this.emit("error", err);
			});

			if (success !== true) {
				return;
			}

			this.emit("loggedOn");

			this.steamUser.setPersona(SteamUser.Steam.EPersonaState.Online);
			this.steamUser.gamesPlayed([ 730 ]);
			this.csgoUser.start();

			this._timeout = setTimeout(() => {
				if (self.csgoUser._GCHelloInterval) {
					clearInterval(self.csgoUser._GCHelloInterval);
				}

				self.block = true;
				self.emit("error", new Error("Failed to connect to GC: Timeout"));
			}, timeout);
		});

		this.steamUser.once("error", (err) => {
			if (this.csgoUser._GCHelloInterval) {
				clearInterval(this.csgoUser._GCHelloInterval);
			}

			this.emit("error", err);
		});

		this.csgoUser.on("debug", GC2ClientWelcome);
		function GC2ClientWelcome(event) {
			// We connected despite timing out, lets just ignore that
			if (self.block === true) {
				self.csgoUser.removeListener("debug", GC2ClientWelcome);
				return;
			}

			// Continue as normal if we connected in time
			if (self._timeout) {
				clearTimeout(self._timeout);
			}

			if (event.header.msg === self.csgoUser.Protos.EGCBaseClientMsg.k_EMsgGCClientWelcome) {
				var response = self.csgoUser.Protos.CMsgClientWelcome.decode(event.buffer);

				self.csgoUser.removeListener("debug", GC2ClientWelcome);
				self.emit("ready", response);

				return;
			}
		}
	};

	commend(accountID, timeout = (30 * 1000), friendly = true, teaching = true, leader = true) {
		// Self reference
		const self = this;

		return new Promise((resolve, reject) => {
			if (self.block) {
				reject("previously_timed_out");
				return;
			}

			// Set timeout
			var _timeout = setTimeout(() => {
				this.csgoUser.removeListener("debug", CommendResponse);
				reject(new Error("Failed to send commend: Timeout"));
			}, timeout);

			// Listen to commend
			this.csgoUser.on("debug", CommendResponse);
			function CommendResponse(event) {
				if (event.header.msg === self.csgoUser.Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientReportResponse) {
					var response = self.csgoUser.Protos.CMsgGCCStrike15_v2_ClientReportResponse.decode(event.buffer);

					clearTimeout(_timeout);
					self.csgoUser.removeListener("debug", CommendResponse);

					resolve(response);
					return;
				}
			}

			// Send commend
			this.csgoUser._GC.send({
				msg: this.csgoUser.Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientCommendPlayer,
				proto: {}
			}, new this.csgoUser.Protos.CMsgGCCStrike15_v2_ClientCommendPlayer({
				account_id: accountID,
				commendation: {
					cmd_friendly: friendly ? 1 : 0,
					cmd_teaching: teaching ? 1 : 0,
					cmd_leader: leader ? 1 : 0
				}
			}).toBuffer());
		});
	};

	report(accountID, matchid = undefined, timeout = (30 * 1000), aimbot = true, wallhack = true, speedhack = true, teamharm = true, textabuse = true, voiceabuse = true) {
		// Self reference
		const self = this;

		return new Promise((resolve, reject) => {
			if (self.block) {
				reject("previously_timed_out");
				return;
			}

			// Set timeout
			var _timeout = setTimeout(() => {
				this.csgoUser.removeListener("debug", ReportResponse);
				reject(new Error("Failed to send report: Timeout"));
			}, timeout);

			// Listen to report
			this.csgoUser.on("debug", ReportResponse);
			function ReportResponse(event) {
				if (event.header.msg === self.csgoUser.Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientReportResponse) {
					var response = self.csgoUser.Protos.CMsgGCCStrike15_v2_ClientReportResponse.decode(event.buffer);

					clearTimeout(_timeout);
					self.csgoUser.removeListener("debug", ReportResponse);

					resolve(response);
					return;
				}
			}

			var obj = {
				account_id: accountID,
				rpt_aimbot: aimbot ? 1 : 0,
				rpt_wallhack: wallhack ? 1 : 0,
				rpt_speedhack: speedhack ? 1 : 0,
				rpt_teamharm: teamharm ? 1 : 0,
				rpt_textabuse: textabuse ? 1 : 0,
				rpt_voiceabuse: voiceabuse ? 1 : 0
			}

			if (matchid) {
				obj.match_id = matchid;
			}

			// Send report
			this.csgoUser._GC.send({
				msg: this.csgoUser.Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientReportPlayer,
				proto: {}
			}, new this.csgoUser.Protos.CMsgGCCStrike15_v2_ClientReportPlayer(obj).toBuffer());
		});
	};

	reportServer(matchid, timeout = (30 * 1000), poorPerf = true, models = true, motd = true, listing = true, inventory = true) {
		// Self reference
		const self = this;

		return new Promise((resolve, reject) => {
			if (self.block) {
				reject("previously_timed_out");
				return;
			}

			// Set timeout
			var _timeout = setTimeout(() => {
				this.csgoUser.removeListener("debug", ReportResponse);
				reject(new Error("Failed to send report: Timeout"));
			}, timeout);

			// Listen to report
			this.csgoUser.on("debug", ReportResponse);
			function ReportResponse(event) {
				if (event.header.msg === self.csgoUser.Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientReportResponse) {
					var response = self.csgoUser.Protos.CMsgGCCStrike15_v2_ClientReportResponse.decode(event.buffer);

					clearTimeout(_timeout);
					self.csgoUser.removeListener("debug", ReportResponse);

					resolve(response);
					return;
				}
			}

			// Send report
			this.csgoUser._GC.send({
				msg: this.csgoUser.Protos.ECsgoGCMsg.k_EMsgGCCStrike15_v2_ClientReportServer,
				proto: {}
			}, new this.csgoUser.Protos.CMsgGCCStrike15_v2_ClientReportServer({
				rpt_poorperf: poorPerf ? 1 : 0,
				rpt_abusivemodels: models ? 1 : 0,
				rpt_badmotd: motd ? 1 : 0,
				rpt_listingabuse: listing ? 1 : 0,
				rpt_inventoryabuse: inventory ? 1 : 0,
				match_id: matchid
			}).toBuffer());
		});
	};

	logout() {
		this.steamUser.logOff();
	};
}
