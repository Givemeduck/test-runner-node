const express = require("express");
const path = require("path");
const runPlaywrightTest = require("./playwright-test");
const runCustomTest = require("./playwright-custom");
const { saveRun, readRuns } = require("./history-store");
const { error } = require("console");

const app = express();
app.use(express.json());
app.use("/screenshots", express.static(path.join(__dirname, "screenshots")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Regression tests

let regressionRunning = false;

app.post("/run-test", async (req, res) => {
  if (regressionRunning) {
    return res.status(409).json({
      success: false,
      error: "A regression run is already in progress.",
    });
  }

  regressionRunning = true;
  const startedAt = new Date().toISOString();

  try {
    const results = await runPlaywrightTest({
      accessibilityUrl: req.body?.accessibilityUrl,
    });

    // Save history BEFORE sending the response.
    try {
      await saveRun(results, startedAt);
    } catch (err) {
      console.error("Could not save run history:", err);

      res.setHeader(
        "X-History-Warning",
        "Tests completed, but this run could not be saved.",
      );
    }

    // Send the response once, then exit the handler.
    return res.json(results);
  } catch (err) {
    console.error("Regression run failed:", err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  } finally {
    regressionRunning = false;
  }
});

app.get("/history", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  try {
    res.json(await readRuns());
  } catch (err) {
    console.error("Could not read run history:", err);

    res.status(500).json({
      error: "Could not read run history. Check the server terminal.",
    });
  }
});

// Dynamic user-created test
app.post("/run-custom-test", async (req, res) => {
  try {
    const results = await runCustomTest(req.body);
    res.json(results);
  } catch (err) {
    res.json({ success: false, details: err.message });
  }
});

const defaultPort = Number(process.env.PORT) || 3000;

function startServer(portToUse) {
  const server = app.listen(portToUse, () => {
    console.log(`Server is running at http://localhost:${portToUse}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      const nextPort = portToUse + 1;
      console.error(
        `Port ${portToUse} is already in use. Trying ${nextPort} instead...`,
      );
      startServer(nextPort);
      return;
    }

    throw err;
  });
}

startServer(defaultPort);
