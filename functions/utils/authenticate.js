const { admin, db } = require("./admin");

module.exports = (req, res, next) => {
  let authToken;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    authToken = req.headers.authorization.split(" ")[1];
  } else {
    console.error("No token found");
    return res.status(403).json({ error: "Unauthorized" });
  }

  admin
    .auth()
    .verifyIdToken(authToken)
    .then((decoded) => {
      req.user = decoded;
      return db
        .collection("users")
        .where("userId", "==", req.user.uid)
        .limit(1)
        .get();
    })
    .then((data) => {
      req.user.handle = data.docs[0].data().handle;
      req.user.imageUrl = data.docs[0].data().imageUrl;
      req.user.isVerified = data.docs[0].data().isVerified;
      return next();
    })
    .catch((err) => {
      console.error("Error while verifying token: ", err);
      return res.json(403).json(err);
    });
};
