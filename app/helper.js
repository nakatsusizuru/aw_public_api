module.exports = {
    handleError(res) {
        return (error) => {
            if (process.env.DEBUG) {
                console.log(error);
            }

            if (error && error.status) {
                return res.status(500).json({message: error.message});
            }
            return res.status(500).json({message: "An unexpected error occurred"});
        }
    }
};
