const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

const requests = {};

const steps = [
    "REQUEST_RECEIVED",
    "VALIDATING",
    "PROCESSING",
    "FINAL_RESULT: APPROVED"
];

function simulateProgress(id) {
    let i = 0;

    const interval = setInterval(() => {
        if (i < steps.length) {
            requests[id].status = steps[i];
            requests[id].timestamp = Date.now();
            requests[id].updated = true;
            i++;
        } else {
            requests[id].complete = true;
            requests[id].updated = true;
            clearInterval(interval);
        }
    }, 3000);
}

// start request
app.post("/start", (req, res) => {
    const id = Date.now().toString();

    requests[id] = {
        status: "REQUEST_RECEIVED",
        complete: false,
        timestamp: Date.now(),
        updated: true
    };

    simulateProgress(id);

    res.json({ requestId: id });
});

// check status
app.get("/status/:id", (req, res) => {
    const data = requests[req.params.id];
    if (!data) return res.status(404).send("Not found");

    res.json(data);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

app.get("/long-status/:id", async (req, res) => {
    const request = requests[req.params.id];
    if (!request) return res.status(404).send("Not found");

    const MAX_WAIT = 30000; // 30 seconds max wait

    const waitForUpdate = () =>
        new Promise(resolve => {
            const start = Date.now();

            const interval = setInterval(() => {

                // if update occurred → respond immediately
                if (request.updated) {
                    request.updated = false;
                    clearInterval(interval);
                    resolve("updated");
                }

                // if timeout reached → respond anyway
                if (Date.now() - start > MAX_WAIT) {
                    clearInterval(interval);
                    resolve("timeout");
                }

            }, 250);
        });

    const reason = await waitForUpdate();

    res.json({
        status: request.status,
        complete: request.complete,
        reason: reason,
        timestamp: request.timestamp
    });
});

app.get("/events/:id", (req, res) => {
    const request = requests[req.params.id];
    if (!request) return res.status(404).send("Not found");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.flushHeaders();

    const sendUpdate = () => {
        const data = JSON.stringify({
            status: request.status,
            complete: request.complete,
            timestamp: request.timestamp
        });

        res.write(`data: ${data}\n\n`);
    };

    // send initial state
    sendUpdate();

    const interval = setInterval(() => {

        if (request.updated) {
            request.updated = false;
            sendUpdate();
        }

        if (request.complete) {
            sendUpdate(); // send final state
            clearInterval(interval);
            res.end();    // close stream only AFTER final send
        }

    }, 300);

    req.on("close", () => {
        clearInterval(interval);
        console.log("SSE client disconnected");
    });
});
