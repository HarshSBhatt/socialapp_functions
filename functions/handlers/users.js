const firebase = require("firebase");
const BusBoy = require("busboy");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { uuid } = require("uuidv4");

const { admin, db } = require("../utils/admin");
const firebaseConfig = require("../utils/config");
const {
  validateLoginData,
  validateSignupData,
  reduceUserDetails,
} = require("../utils/validators");
const { isEmail } = require("../utils/is-email");

firebase.initializeApp(firebaseConfig);

//! Sign up

exports.signUp = (req, res) => {
  const newUser = {
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    handle: req.body.handle, //! Basically this is a username
  };

  let token, userId;
  const { errors, valid } = validateSignupData(newUser);

  if (!valid) {
    return res.status(400).json(errors);
  }

  const noImg = "user.png";

  db.doc(`/users/${newUser.handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        return res.status(400).json({ handle: "This handle is already taken" });
      } else {
        return firebase
          .auth()
          .createUserWithEmailAndPassword(newUser.email, newUser.password);
      }
    })
    .then((data) => {
      userId = data.user.uid;
      return data.user.getIdToken();
    })
    .then((authToken) => {
      token = authToken;
      const userCredentials = {
        handle: newUser.handle,
        email: newUser.email,
        createdAt: new Date().toISOString(),
        imageUrl: `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/${noImg}?alt=media`,
        userId,
        isVerified: false,
      };
      db.doc(`/users/${newUser.handle}`).set(userCredentials);
    })
    .then(() => {
      const user = firebase.auth().currentUser;
      return user.sendEmailVerification();
    })
    .then(() => {
      return res.status(201).json({ token });
    })
    .catch((err) => {
      if (err.code === "auth/email-already-in-use") {
        return res.status(400).json({ email: "Email already in use" });
      }
      return res
        .status(500)
        .json({ general: "Something went wrong, please try again later!" });
    });
};

// //! Send verification mail again

exports.resendVerificationMail = (req, res) => {
  const user = firebase.auth().currentUser;
  user
    .sendEmailVerification()
    .then(() => {
      return res.json({ success: true, err: null });
    })
    .catch((error) => {
      return res.json({ success: false, err: error.message });
    });
};

//! Login

exports.login = (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password,
  };

  const { errors, valid } = validateLoginData(user);

  if (!valid) {
    return res.status(400).json(errors);
  }

  // const persistence = req.body.remember
  //   ? firebase.auth.Auth.Persistence.LOCAL
  //   : firebase.auth.Auth.Persistence.SESSION;
  // firebase
  // .auth()
  // .setPersistence(persistence)
  // .then(() => {
  //   return firebase
  //     .auth()
  //     .signInWithEmailAndPassword(user.email, user.password);
  // })
  firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then((data) => {
      return data.user.getIdToken();
    })
    .then((token) => {
      return res.json({ token });
    })
    .catch((err) => {
      console.error(err);
      return res.status(403).json({ general: "Wrong credentials" });
    });
};

//! Forgot password

exports.recoverPassword = (req, res) => {
  const { email } = req.body;
  if (!isEmail(email)) {
    return res.status(400).json({ error: "Must be an email" });
  }
  firebase
    .auth()
    .sendPasswordResetEmail(email)
    .then(() => {
      return res.json({ success: true, err: null });
    })
    .catch((error) => {
      return res.json({ success: false, err: error.message });
    });
};

//! Add user details

exports.addUserDetails = (req, res) => {
  let userDetails = reduceUserDetails(req.body);
  db.doc(`users/${req.user.handle}`)
    .update(userDetails)
    .then(() => {
      return res.json({ message: "Details added successfully" });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

//! Get other user detail

exports.getOtherUserDetail = (req, res) => {
  let userData = {};
  db.doc(`users/${req.params.handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        userData.user = doc.data();
        return db
          .collection("screams")
          .where("userHandle", "==", req.params.handle)
          .orderBy("createdAt", "desc")
          .get();
      } else {
        return res.status(404).json({ error: "User not found" });
      }
    })
    .then((data) => {
      userData.screams = [];
      data.forEach((doc) => {
        userData.screams.push({
          screamId: doc.id,
          ...doc.data(),
        });
      });
      return res.json(userData);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

//! Get own user detail

exports.getAuthenticatedUser = (req, res) => {
  let userData = {};
  db.doc(`users/${req.user.handle}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        userData.credentials = doc.data();
        return db
          .collection("likes")
          .where("userHandle", "==", req.user.handle)
          .get();
      }
    })
    .then((data) => {
      userData.likes = [];
      data.forEach((doc) => {
        userData.likes.push(doc.data());
      });
      return db
        .collection("notifications")
        .where("recipient", "==", req.user.handle)
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();
    })
    .then((data) => {
      userData.notifications = [];
      data.forEach((doc) => {
        userData.notifications.push({
          ...doc.data(),
          notificationId: doc.id,
        });
      });
      return res.json(userData);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

//! Upload a profile image for user

exports.uploadImage = (req, res) => {
  const busboy = new BusBoy({ headers: req.headers });

  let imageFileName;
  let imageToBeUploaded = {};
  let generatedToken = uuid();

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    const fileType = ["image/jpeg", "image/jpg", "image/png"];
    if (!fileType.includes(mimetype)) {
      return res.status(400).json({ error: "Wrong file type submitted" });
    }
    //! name.image.png
    const filenameArray = filename.split(".");
    const imageExtension = filenameArray[filenameArray.length - 1];

    //! 545615615.png
    imageFileName = `${Math.round(
      Math.random() * 1000000000000
    ).toString()}.${imageExtension}`;

    const filePath = path.join(os.tmpdir(), imageFileName);

    imageToBeUploaded = { filePath, mimetype };
    file.pipe(fs.createWriteStream(filePath));
  });
  busboy.on("finish", () => {
    admin
      .storage()
      .bucket()
      .upload(imageToBeUploaded.filePath, {
        resumable: false,
        metadata: {
          metadata: {
            contentType: imageToBeUploaded.mimetype,
            firebaseStorageDownloadTokens: generatedToken,
          },
        },
      })
      .then(() => {
        const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/${imageFileName}?alt=media`;
        return db.doc(`/users/${req.user.handle}`).update({ imageUrl });
      })
      .then(() => {
        return res.status(201).json({ message: "Image uploaded successfully" });
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).json({ error: "Something went wrong" });
      });
  });
  busboy.end(req.rawBody);
};

//! Mark notification read by user

exports.markNotificationRead = (req, res) => {
  let batch = db.batch();
  req.body.forEach((notificationId) => {
    const notification = db.doc(`/notifications/${notificationId}`);
    batch.update(notification, { read: true }); //! when user seen notification, change read to true
  });
  batch
    .commit()
    .then(() => {
      return res.json({ message: "Notification marked read" });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};
