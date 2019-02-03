module.exports = function (app) {
	
	let currentGames = [];
	
	app.get("/awusers", (req, res) => {
        
		let queryParams = req.query;

		if (!queryParams["ip"] || !queryParams["index"]) {
			return res.status(500).send("Invalid parameters");
		}

		if (!currentGames[queryParams["ip"]]) {
			currentGames[queryParams["ip"]] = {
				aw_users: []
			};
		}

		let aw_users = currentGames[queryParams['ip']].aw_users;	

		let foundUserIndex = currentGames[queryParams["ip"]].aw_users.findIndex(o => o.index === queryParams['index']);
		let foundUser = currentGames[queryParams["ip"]].aw_users[foundUserIndex]

		if (foundUser) // Update lastUpdate of user
		{
			currentGames[queryParams["ip"]].aw_users[foundUserIndex].lastUpdate = Date.now();
		} 
		else // Push new user
		{
			currentGames[queryParams["ip"]].aw_users.push({
				index: queryParams['index'],
				lastUpdate: Date.now()
			});
		}

		aw_users.forEach(function(user, i) // Remove users that are over half a minute old
		{
			if (Date.now() - user.lastUpdate > 30000)
			{
				aw_users.splice(i, 1);
			}
		});

		currentGames[queryParams["ip"]].aw_users = aw_users;
		return res.status(200).send(currentGames[queryParams["ip"]].aw_users.map(e => {return e.index}).join("\t"));
		
	});
		
	app.get("/awusers/list", (req, res) => {
		let queryParams = req.query;
		let listedServers = [];

		if (queryParams["refresh"] == "true") {

			for (const key of Object.keys(currentGames))
			{
				let game = currentGames[key];
				
				game.aw_users.forEach(function(user, j)
				{
					if (Date.now() - user.lastUpdate > 30000)
					{
						game.aw_users.splice(j, 1);
					}
				});
				
				if (game.aw_users.length <= 0)
				{
					delete currentGames[key];
				}
				
				listedServers.push("( ip: " + key + " [ usercount: " + game.aw_users.length + " ] )");
			}
			
		}
		else
		{
			for (const key of Object.keys(currentGames)) 
			{
				let game = currentGames[key];
				listedServers.push("( ip: " + key + " [ usercount: " + game.aw_users.length + " ] )");
			}
		}

		return res.status(200).send(listedServers.join("\t"));
	});


};
