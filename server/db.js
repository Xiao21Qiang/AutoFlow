const mongoose = require("mongoose");

let connectionPromise;

function connectToDatabase() {
  const mongoUri = String(process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URL || "").trim();

  if (!mongoUri) {
    throw new Error("Missing MONGO_URI, MONGODB_URI, or MONGO_URL. Add a MongoDB connection string to the server environment before starting AutoFlow.");
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(mongoUri, {
      dbName: process.env.MONGODB_DB_NAME || undefined,
    });
  }

  return connectionPromise;
}

function getDatabaseState() {
  const stateByCode = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  return stateByCode[mongoose.connection.readyState] || "unknown";
}

module.exports = { connectToDatabase, getDatabaseState };
