const DEFAULT_STRINGS: Record<string, string> = {
    SkinValue: '(R=0.749020,G=0.505882,B=0.321569,A=1.000000)',
    RightEye_Outer: '(R=0.030000,G=0.019575,B=0.004980,A=1.000000)',
    RightEye_Inner: '(R=0.172549,G=0.118074,B=0.017880,A=1.000000)',
    LeftEye_Outer: '(R=0.030000,G=0.019575,B=0.004980,A=1.000000)',
    LeftEye_Inner: '(R=0.172549,G=0.118074,B=0.017880,A=1.000000)',
    GenderId: 'Unspecified', BodyType: 'Masculine', Hair: 'Hair0',
    Helm_Hiding: 'Always Off', Hair_Color: '(R=0.281250,G=0.219727,B=0.127441,A=1.000000)',
    Makeup: 'None', SkinName: '0', Beard: '0', Facepaint: 'None',
};

function ObjectValue(value: unknown): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function Appearance(blob: Record<string, any>) {
    if (typeof blob.AppearanceData !== 'string') return undefined;
    try {
        const value: unknown = JSON.parse(blob.AppearanceData);
        return ObjectValue(value) ? value : undefined;
    } catch { return undefined; }
}

function Strings(value: Record<string, any>) {
    if (!Array.isArray(value.StringData)) return undefined;
    const result = new Map<string, string>();
    for (const entry of value.StringData) {
        if (!ObjectValue(entry) || typeof entry.Key !== 'string' || typeof entry.Data !== 'string' || result.has(entry.Key)) return undefined;
        result.set(entry.Key, entry.Data);
    }
    return result;
}

// The 1.4.4 server can save this uninitialized appearance over an existing face.
// Match the complete observed fingerprint; male characters and editor changes are valid.
// Containment only: this cannot repair native memory or identify subsequent valid editor saves.
export function PreserveInitializedAppearance(currentData: string, incomingData: string): {data: string, preserved: boolean} {
    try {
        const current: unknown = JSON.parse(currentData), incoming: unknown = JSON.parse(incomingData);
        if (!ObjectValue(current) || !ObjectValue(incoming)) return {data: incomingData, preserved: false};
        const before = Appearance(current), after = Appearance(incoming);
        if (!before || !Array.isArray(before.Data) || !Array.isArray(before.AssetReferences)) return {data: incomingData, preserved: false};
        const customizedNewCharacter = before.CreationState === 'EArchonCharacterCreationState::NewCharacter' &&
            before.Data.some((entry: unknown) => ObjectValue(entry) && Array.isArray(entry.MorphData) && entry.MorphData.length > 0);
        if (before.CreationState !== 'EArchonCharacterCreationState::FaceComplete' && !customizedNewCharacter) return {data: incomingData, preserved: false};
        const oldStrings = Strings(before);
        if (!oldStrings || (!['Feminine', 'Masculine'].includes(oldStrings.get('GenderId') ?? '') &&
            !(customizedNewCharacter && !oldStrings.has('GenderId'))) ||
            !['Feminine', 'Masculine'].includes(oldStrings.get('BodyType') ?? '')) return {data: incomingData, preserved: false};
        if (after && (after.CreationState !== 'EArchonCharacterCreationState::FaceComplete' ||
            Object.keys(after).sort().join(',') !== 'AssetReferences,CreationState,Data,StringData' ||
            !Array.isArray(after.Data) || after.Data.length !== 0 ||
            !Array.isArray(after.AssetReferences) || after.AssetReferences.length !== 0)) return {data: incomingData, preserved: false};
        if (after) {
            const newStrings = Strings(after);
            if (!newStrings || newStrings.size !== Object.keys(DEFAULT_STRINGS).length ||
                !Object.entries(DEFAULT_STRINGS).every(([key, value]) => newStrings.get(key) === value)) return {data: incomingData, preserved: false};
        }
        incoming.AppearanceData = current.AppearanceData;
        return {data: JSON.stringify(incoming), preserved: true};
    } catch {
        // Existing character validation owns malformed data; this helper never guesses.
        return {data: incomingData, preserved: false};
    }
}
