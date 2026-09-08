const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const historyFolder = path.join(__dirname, 'run-history');

async function saveRun(results, startedAt) {
    const run = {
        id: randomUUID(),
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - Date.parse(startedAt),
        results
    };

    await fs.mkdir(historyFolder, { recursive: true });

    const finalPath = path.join(historyFolder, `${run.id}.json`);
    const temporaryPath = `${finalPath}.tmp`;

    // Finish writing before making this run available to readers.
    await fs.writeFile(
        temporaryPath,
        JSON.stringify(run, null, 2),
        'utf8'
    );

    await fs.rename(temporaryPath, finalPath);

    return run;
}

async function readRuns() {
    await fs.mkdir(historyFolder, { recursive: true });

    const filenames = await fs.readdir(historyFolder);

    const runs = await Promise.all(
        filenames
            .filter(filename => filename.endsWith('.json'))
            .map(async filename => {
                const contents = await fs.readFile(
                    path.join(historyFolder, filename),
                    'utf8'
                );

                return JSON.parse(contents);
            })
    );

    // Most recently completed runs first.
    return runs.sort(
        (a, b) =>
            Date.parse(b.completedAt) - Date.parse(a.completedAt)
    );
}

module.exports = { saveRun, readRuns };