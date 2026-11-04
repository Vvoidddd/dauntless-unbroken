import './setup';
import './authenv';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EvaluateNsfwPredictions} from '../src/controllers/profilepictures';

test('local image moderation rejects pornographic and hentai scores', () => {
    assert.equal(EvaluateNsfwPredictions([{className: 'Porn', probability: 0.2}]).status, 'rejected');
    assert.equal(EvaluateNsfwPredictions([{className: 'Hentai', probability: 0.2}]).status, 'rejected');
    assert.equal(EvaluateNsfwPredictions([{className: 'Neutral', probability: 0.99}]).status, 'approved');
});
