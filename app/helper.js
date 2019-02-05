module.exports = {
    handleError(res) {
        return (error) => {
            if (process.env.DEBUG) {
                console.log(error);
            }

            if (error && error.status) {
                if (!error.send) {
                    return res.status(error.status).json({message: error.message});
                } else {
                    return res.status(error.status).send(error.message)
                }
            }
            return res.status(500).json({message: "An unexpected error occurred"});
        }
    }
};
