module.exports = function (app) {
	
	let aw_users = [];
	
	app.get("/awusers", (req, res) => {
        
		let queryParams = req.query;

		if (queryParams["steamid"]) {
			if (!aw_users.includes(queryParams["steamid"])) {
				aw_users.push(queryParams["steamid"]);
			}
		}
		
		if (queryParams["clear"]) {
			if (queryParams["clear"] == "true") {
				aw_users = [];
			}
		}
		
		return res.status(200).send(aw_users.join("\t"));
	});

};
