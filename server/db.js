const mongoose = require("mongoose");

let connectionPromise;

function connectToDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI. Add it to your server environment before starting the API.");
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB_NAME || undefined,
    });
  }

  return connectionPromise;
}

module.exports = { connectToDatabase };
