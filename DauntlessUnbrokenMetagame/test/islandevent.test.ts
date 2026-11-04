import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IslandEventEnabled, IslandEventModeNow, SetIslandEventMode } from '../src/controllers/islandevent';

test('island event control overrides the environment switch and persists its mode', async () => {
    const oldFile = process.env.ISLAND_EVENT_CONTROL_FILE;
    const oldSchedule = process.env.TRIALS_SCHEDULE;
    const dir = await mkdtemp(join(tmpdir(), 'unbroken-island-event-'));
    const file = join(dir, 'event-control.json');
    try {
        process.env.ISLAND_EVENT_CONTROL_FILE = file;
        process.env.TRIALS_SCHEDULE = '0';
        assert.equal(IslandEventModeNow(), 'default');
        assert.equal(IslandEventEnabled(), false);
        assert.equal(SetIslandEventMode('trials'), 'trials');
        assert.equal(await readFile(file, 'utf8'), '{"mode":"trials"}\n');
        assert.equal(IslandEventEnabled(), true);
        SetIslandEventMode('off');
        assert.equal(IslandEventEnabled(), false);
        SetIslandEventMode('default');
        process.env.TRIALS_SCHEDULE = '1';
        assert.equal(IslandEventEnabled(), true);
    } finally {
        if(oldFile === undefined) delete process.env.ISLAND_EVENT_CONTROL_FILE; else process.env.ISLAND_EVENT_CONTROL_FILE = oldFile;
        if(oldSchedule === undefined) delete process.env.TRIALS_SCHEDULE; else process.env.TRIALS_SCHEDULE = oldSchedule;
        await rm(dir, {recursive:true, force:true});
    }
});

test('island event control refuses relative configuration paths', () => {
    const oldFile = process.env.ISLAND_EVENT_CONTROL_FILE;
    try {
        process.env.ISLAND_EVENT_CONTROL_FILE = 'event-control.json';
        assert.throws(() => IslandEventModeNow(), /absolute path/);
    } finally {
        if(oldFile === undefined) delete process.env.ISLAND_EVENT_CONTROL_FILE; else process.env.ISLAND_EVENT_CONTROL_FILE = oldFile;
    }
});
