const express = require('express');
const path = require('path');
const runPlaywrightTest = require('./playwright-test');
const runCustomTest = require('./playwright-custom');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Regression tests
app.post('/run-test', async (req, res) => {
    try {
        const results = await runPlaywrightTest();
        res.json(results);
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Dynamic user-created test
app.post('/run-custom-test', async (req, res) => {
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

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            const nextPort = portToUse + 1;
            console.error(`Port ${portToUse} is already in use. Trying ${nextPort} instead...`);
            startServer(nextPort);
            return;
        }

        throw err;
    });
}

startServer(defaultPort);