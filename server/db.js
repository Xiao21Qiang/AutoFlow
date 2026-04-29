const mongoose = require("mongoose");

let connectionPromise;
let selectedMongoEnvName = "";

function connectToDatabase() {
  const mongoCandidates = [
    ["MONGO_URI", process.env.MONGO_URI],
    ["MONGODB_URI", process.env.MONGODB_URI],
    ["MONGO_URL", process.env.MONGO_URL],
  ];
  const selected = mongoCandidates.find(([, value]) => String(value || "").trim());
  const mongoUri = String(selected?.[1] || "").trim();
  selectedMongoEnvName = selected?.[0] || "";

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

function getMongoEnvName() {
  return selectedMongoEnvName || "";
}

function getDatabaseName() {
  return mongoose.connection.name || process.env.MONGODB_DB_NAME || "";
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

module.exports = { connectToDatabase, getDatabaseName, getDatabaseState, getMongoEnvName };
