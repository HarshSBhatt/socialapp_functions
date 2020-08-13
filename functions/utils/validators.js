const { isEmpty } = require("./is-empty");

const isEmail = (email) => {
  const emailRegEx = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

  if (emailRegEx.test(email)) {
    return true;
  }
  return false;
};

//! Signin validation

exports.validateSignupData = (user) => {
  const errors = {};

  if (isEmpty(user.email)) {
    errors.email = "Must not be empty";
  } else if (!isEmail(user.email)) {
    errors.email = "Must be a valid email address";
  }
  if (isEmpty(user.password)) {
    errors.password = "Must not be empty";
  }
  if (user.password !== user.confirmPassword) {
    errors.confirmPassword = "Passwords must match";
  }
  if (isEmpty(user.handle)) {
    errors.handle = "Must not be empty";
  }

  return { errors, valid: Object.keys(errors).length === 0 ? true : false };
};

//! Login validation

exports.validateLoginData = (user) => {
  const errors = {};

  if (isEmpty(user.email)) {
    errors.email = "Must not be empty";
  } else if (!isEmail(user.email)) {
    errors.email = "Must be a valid email address";
  }
  if (isEmpty(user.password)) {
    errors.password = "Must not be empty";
  }

  return { errors, valid: Object.keys(errors).length === 0 ? true : false };
};

//! User data

exports.reduceUserDetails = (data) => {
  let userDetails = {};

  if (!isEmpty(data.bio)) {
    userDetails.bio = data.bio;
  }
  if (!isEmpty(data.website)) {
    if (data.website.substring(0, 4) !== "http") {
      userDetails.website = `http://${data.website}`;
    } else {
      userDetails.website = data.website;
    }
  }
  if (!isEmpty(data.location)) {
    userDetails.location = data.location;
  }

  return userDetails;
};
