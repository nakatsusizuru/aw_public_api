module.exports = function (app) {
    
	let currentGames = [];
	
	app.get('/awusers', (req, res) => {
        
		let queryParams = req.query;
		
        if (!queryParams['ip'] || !queryParams['index']) {
            return res.status(500).send("Invalid parameters");
        }
		
		if (!currentGames[queryParams['ip']]) {
            currentGames[queryParams['ip']] = {
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
		
		currentGames[queryParams['ip']].aw_users = aw_users;
		
		return res.status(200).send(currentGames[queryParams["ip"]].aw_users.map(e => {return e.index}).join(","));

    });
};
