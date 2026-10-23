import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PreserveInitializedAppearance} from '../src/controllers/characterappearance';

const defaultAppearance = {
    CreationState: 'EArchonCharacterCreationState::FaceComplete', Data: [], AssetReferences: [],
    StringData: Object.entries({
        SkinValue: '(R=0.749020,G=0.505882,B=0.321569,A=1.000000)',
        RightEye_Outer: '(R=0.030000,G=0.019575,B=0.004980,A=1.000000)',
        RightEye_Inner: '(R=0.172549,G=0.118074,B=0.017880,A=1.000000)',
        LeftEye_Outer: '(R=0.030000,G=0.019575,B=0.004980,A=1.000000)',
        LeftEye_Inner: '(R=0.172549,G=0.118074,B=0.017880,A=1.000000)',
        GenderId: 'Unspecified', BodyType: 'Masculine', Hair: 'Hair0', Helm_Hiding: 'Always Off',
        Hair_Color: '(R=0.281250,G=0.219727,B=0.127441,A=1.000000)', Makeup: 'None', SkinName: '0', Beard: '0', Facepaint: 'None',
    }).map(([Key, Data]) => ({Key, Data})),
};
const customized = {...defaultAppearance,
    Data: [{SkeletalMeshComponentName: 'Head Slot', MorphData: [{MorphName: 'NotKat', Value: 1}]}],
    StringData: defaultAppearance.StringData.map(row => row.Key === 'GenderId' || row.Key === 'BodyType' ? {...row, Data: 'Feminine'} : row),
};
const blob = (appearance: unknown, extra = {}) => JSON.stringify({AppearanceData: JSON.stringify(appearance), ...extra});

test('preserves the initialized face for the observed server-default reset while saving unrelated progress', () => {
    const current = blob(customized, {SERIE_example: 'old', LoginTime: 'old'});
    const incoming = blob(defaultAppearance, {SERIE_example: 'new', LoginTime: 'new'});
    const result = PreserveInitializedAppearance(current, incoming);
    assert.equal(result.preserved, true);
    assert.deepEqual(JSON.parse(result.data), JSON.parse(blob(customized, {SERIE_example: 'new', LoginTime: 'new'})));
    assert.deepEqual(PreserveInitializedAppearance(result.data, incoming), result, 'same-version retry normalizes identically');
});

test('accepts initial defaults, intentional masculine edits and new character customization', () => {
    for (const appearance of [
        {...defaultAppearance, StringData: defaultAppearance.StringData.map(row => row.Key === 'GenderId' ? {...row, Data: 'Masculine'} : row)},
        {...defaultAppearance, CreationState: 'EArchonCharacterCreationState::NewCharacter'},
        customized,
    ]) {
        const incoming = blob(appearance);
        assert.deepEqual(PreserveInitializedAppearance(blob(customized), incoming), {data: incoming, preserved: false});
    }
    const incoming = blob(defaultAppearance);
    assert.deepEqual(PreserveInitializedAppearance('{}', incoming), {data: incoming, preserved: false});
});

test('does not guess on partial, malformed or additional appearance data', () => {
    for (const appearance of [
        {...defaultAppearance, StringData: defaultAppearance.StringData.slice(1)},
        {...defaultAppearance, StringData: [...defaultAppearance.StringData, defaultAppearance.StringData[0]]},
        {...defaultAppearance, Extra: true}, {...defaultAppearance, Data: [{}]},
        {...defaultAppearance, AssetReferences: ['custom']}, {...defaultAppearance, StringData: null},
    ]) {
        const incoming = blob(appearance);
        assert.deepEqual(PreserveInitializedAppearance(blob(customized), incoming), {data: incoming, preserved: false});
    }
    for (const incoming of ['{', '[]']) {
        assert.deepEqual(PreserveInitializedAppearance(blob(customized), incoming), {data: incoming, preserved: false});
    }
    assert.equal(PreserveInitializedAppearance('{', blob(defaultAppearance)).preserved, false);
});

test('preserves missing or unreadable appearance only when a valid initialized face exists', () => {
    for (const extra of [{}, {AppearanceData: null}, {AppearanceData: '{'}, {AppearanceData: '[]'}]) {
        const incoming = JSON.stringify({LoginTime: 'new', ...extra});
        const result = PreserveInitializedAppearance(blob(customized), incoming);
        assert.equal(result.preserved, true);
        assert.deepEqual(JSON.parse(result.data), JSON.parse(blob(customized, {LoginTime: 'new'})));
        assert.deepEqual(PreserveInitializedAppearance('{}', incoming), {data: incoming, preserved: false});
    }
});

test('protects a customized NewCharacter face without GenderId, while allowing the next editor change', () => {
    const previous = {...customized, CreationState: 'EArchonCharacterCreationState::NewCharacter',
        StringData: customized.StringData.filter(row => row.Key !== 'GenderId')};
    const result = PreserveInitializedAppearance(blob(previous), blob(defaultAppearance));
    assert.equal(result.preserved, true);
    assert.equal(JSON.parse(result.data).AppearanceData, JSON.stringify(previous));
    const edited = blob({...previous, StringData: previous.StringData.map(row => row.Key === 'Hair' ? {...row, Data: 'Hair12'} : row)});
    assert.deepEqual(PreserveInitializedAppearance(blob(previous), edited), {data: edited, preserved: false});
    assert.equal(PreserveInitializedAppearance(blob({...previous, Data: []}), blob(defaultAppearance)).preserved, false);
});
