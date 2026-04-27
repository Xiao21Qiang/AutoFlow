const net = require("net");
const { spawn } = require("child_process");
const path = require("path");

function parsePreferredPort() {
  const rawSources = [
    process.env.CLIENT_PORT,
    process.env.PORT,
    (() => {
      try {
        return new URL(String(process.env.CLIENT_APP_URL || "").trim()).port;
      } catch (_error) {
        return "";
      }
    })(),
  ];

  for (const rawValue of rawSources) {
    const port = Number(rawValue);
    if (Number.isInteger(port) && port > 0 && port < 65536) {
      return port;
    }
  }

  return 3000;
}

function canUsePort(port) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    function finish(result) {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(result);
    }

    socket.setTimeout(750);

    socket.once("connect", () => {
      finish(false);
    });

    socket.once("timeout", () => {
      finish(true);
    });

    socket.once("error", (error) => {
      if (error && ["ECONNREFUSED", "EHOSTUNREACH", "ETIMEDOUT"].includes(error.code)) {
        finish(true);
        return;
      }

      reject(error);
    });

    socket.connect(port, "127.0.0.1");
  });
}

async function findOpenPort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await canUsePort(port)) {
      return port;
    }
  }

  throw new Error(`Could not find an open port between ${startPort} and ${startPort + 19}.`);
}

async function main() {
  const preferredPort = parsePreferredPort();
  const selectedPort = await findOpenPort(preferredPort);

  if (selectedPort !== preferredPort) {
    console.log(
      `[customer] Port ${preferredPort} is busy. Starting the React app on http://localhost:${selectedPort} instead.`
    );
  }

  const child = spawn(
    process.execPath,
    [require.resolve("react-scripts/scripts/start")],
    {
      stdio: "inherit",
      shell: false,
      env: {
        ...process.env,
        PORT: String(selectedPort),
      },
      cwd: path.resolve(__dirname, ".."),
    }
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error("[customer] Failed to start react-scripts.", error);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error("[customer] " + (error && error.message ? error.message : error));
  process.exit(1);
});
