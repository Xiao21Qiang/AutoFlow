const mongoose = require("mongoose");

let connectionPromise;
let selectedMongoEnvName = "";
let configuredDatabaseName = "";

function inferDatabaseNameFromUri(uri) {
  try {
    const parsed = new URL(uri);
    return decodeURIComponent(parsed.pathname || "").replace(/^\/+/, "").trim();
  } catch (_error) {
    return "";
  }
}

function connectToDatabase() {
  const mongoCandidates = [
    ["MONGO_URI", process.env.MONGO_URI],
    ["MONGODB_URI", process.env.MONGODB_URI],
    ["MONGO_URL", process.env.MONGO_URL],
  ];
  const selected = mongoCandidates.find(([, value]) => String(value || "").trim());
  const mongoUri = String(selected?.[1] || "").trim();
  selectedMongoEnvName = selected?.[0] || "";
  configuredDatabaseName = String(process.env.MONGODB_DB_NAME || "").trim() || inferDatabaseNameFromUri(mongoUri);

  if (!mongoUri) {
    throw new Error("Missing MONGO_URI, MONGODB_URI, or MONGO_URL. Add a MongoDB connection string to the server environment before starting AutoFlow.");
  }

  if (!connectionPromise) {
    console.log("[startup] MongoDB connecting", {
      env: selectedMongoEnvName,
      database: configuredDatabaseName || "default-from-uri",
    });
    connectionPromise = mongoose.connect(mongoUri, {
      dbName: process.env.MONGODB_DB_NAME || undefined,
    }).catch((error) => {
      connectionPromise = null;
      console.error("[startup] MongoDB connection failed", {
        env: selectedMongoEnvName,
        database: configuredDatabaseName || "default-from-uri",
        message: error.message || "Unknown MongoDB connection error",
      });
      throw error;
    });
  }

  return connectionPromise;
}

function getMongoEnvName() {
  return selectedMongoEnvName || "";
}

function getDatabaseName() {
  return mongoose.connection.name || configuredDatabaseName || process.env.MONGODB_DB_NAME || "";
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
