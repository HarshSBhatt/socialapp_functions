// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions

const functions = require("firebase-functions");
const express = require("express");

const authenticate = require("./utils/authenticate");
const { db } = require("./utils/admin");
const {
  getAllScream,
  postScream,
  getScream,
  deleteScream,
  commentOnScream,
  likeScream,
  unlikeScream,
} = require("./handlers/screams");
const {
  signUp,
  resendVerificationMail,
  login,
  uploadImage,
  addUserDetails,
  getAuthenticatedUser,
  getOtherUserDetail,
  markNotificationRead,
} = require("./handlers/users");

const app = express();

//! Screams Route

app.route("/screams").get(getAllScream);
app.route("/scream").post(authenticate, postScream);
app
  .route("/scream/:screamId")
  .get(getScream)
  .delete(authenticate, deleteScream);
app.route("/scream/:screamId/comment").post(authenticate, commentOnScream);
app.route("/scream/:screamId/like").get(authenticate, likeScream);
app.route("/scream/:screamId/unlike").get(authenticate, unlikeScream);

//* Delete Scream

//! Users route

app.route("/signup").post(signUp);
app.route("/login").post(login);
app.route("/user/image").post(authenticate, uploadImage);
app
  .route("/user")
  .get(authenticate, getAuthenticatedUser)
  .post(authenticate, addUserDetails);

app.route("/resendVerificationMail").post(authenticate, resendVerificationMail);
app.route("/user/:handle").get(getOtherUserDetail);
app.route("/notifications").post(authenticate, markNotificationRead);

exports.api = functions.https.onRequest(app);

//! Triggers on particular event

exports.createNotificationOnLike = functions.firestore
  .document("likes/{id}")
  .onCreate((snapshot) => {
    return db
      .doc(`/screams/${snapshot.data().screamId}`)
      .get()
      .then((doc) => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: "like",
            read: false,
            screamId: doc.id,
          });
        }
      })
      .catch((err) => {
        console.error(err);
      });
  });

exports.deleteNotificationOnUnlike = functions.firestore
  .document("likes/{id}")
  .onDelete((snapshot) => {
    return db
      .doc(`/notifications/${snapshot.id}`)
      .delete()
      .catch((err) => {
        console.error(err);
      });
  });

exports.createNotificationOnComment = functions.firestore
  .document("comments/{id}")
  .onCreate((snapshot) => {
    return db
      .doc(`/screams/${snapshot.data().screamId}`)
      .get()
      .then((doc) => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: "comment",
            read: false,
            screamId: doc.id,
          });
        }
      })
      .catch((err) => {
        console.error(err);
      });
  });

exports.onUserImageChange = functions.firestore
  .document("/users/{userId}")
  .onUpdate((change) => {
    if (change.before.data().imageUrl !== change.after.data().imageUrl) {
      console.log("Image change");
      let batch = db.batch();
      return db
        .collection("screams")
        .where("userHandle", "==", change.before.data().handle)
        .get()
        .then((data) => {
          data.forEach((doc) => {
            const scream = db.doc(`/screams/${doc.id}`);
            batch.update(scream, { userImage: change.after.data().imageUrl });
          });
          return batch.commit();
        });
    } else {
      return true;
    }
  });

exports.onScreamDeleted = functions.firestore
  .document("/screams/{screamId}")
  .onDelete((snapshot, context) => {
    const screamId = context.params.screamId;
    const batch = db.batch();
    return db
      .collection("comments")
      .where("screamId", "==", screamId)
      .get()
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/comments/${doc.id}`));
        });
        return db.collection("likes").where("screamId", "==", screamId).get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/likes/${doc.id}`));
        });
        return db
          .collection("notifications")
          .where("screamId", "==", screamId)
          .get();
      })
      .then((data) => {
        data.forEach((doc) => {
          batch.delete(db.doc(`/notifications/${doc.id}`));
        });
        return batch.commit();
      })
      .catch((err) => {
        console.error(err);
      });
  });
