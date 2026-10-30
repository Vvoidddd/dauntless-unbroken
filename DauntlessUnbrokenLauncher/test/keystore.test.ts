// The key store: a public server's key belongs to one certificate fingerprint.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { KeyStore, KeyStoreError, serverId, type Encryptor, type KeySlot } from "../src/main/keystore";

const enc: Encryptor = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from("enc:" + Buffer.from(plain).toString("base64")),
  decrypt: (data) => {
    const s = data.toString();
    if (!s.startsWith("enc:")) throw new Error("not ours");
    return Buffer.from(s.slice(4), "base64").toString();
  },
};
const dirs: string[] = [];
function store(): { ks: KeyStore; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "dr-keys-"));
  dirs.push(dir);
  return { ks: new KeyStore(dir, enc), dir };
}
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const KEY = "UUK_" + "ab".repeat(24);
const FP_A = "a1".repeat(32);
const FP_B = "b2".repeat(32);
const pub = (fp: string | null): KeySlot => ({ host: "203.0.113.10", port: 443, mode: "public", fp });

test('temporary keys work without a wallet, stay certificate-bound and never replace saved keys or recovery files', async () => {
  const {ks,dir}=store();
  await ks.save(pub(FP_A),KEY);
  const disk=await fs.readFile(path.join(dir,`${serverId('203.0.113.10',443,'public')}.key`));
  const recovery=path.join(dir,'recovery');
  const locked=new KeyStore(dir,{isAvailable:()=>false,encrypt:()=>{throw Error('locked');},decrypt:()=>{throw Error('locked');}},recovery);
  const temporary='UUK_'+'cd'.repeat(24);
  await locked.saveSession(pub(FP_A),temporary);
  assert.equal(await locked.load(pub(FP_A)),temporary);
  assert.equal(await locked.load(pub(FP_B)),null);
  assert.equal(locked.isSession(pub(FP_A)),true);
  assert.equal(await new KeyStore(dir,enc).load(pub(FP_A)),KEY);
  assert.equal(await locked.rebind(pub(FP_A),FP_B),true);
  assert.equal(await locked.load(pub(FP_A)),null);
  assert.equal(await locked.load(pub(FP_B)),temporary);
  assert.equal(locked.isSession(pub(FP_B)),true);
  await locked.endSession(pub(FP_A));
  assert.equal(await locked.load(pub(FP_A)),null,'logout must not silently reload the old disk account');
  assert.deepEqual(await fs.readFile(path.join(dir,`${serverId('203.0.113.10',443,'public')}.key`)),disk);
  await assert.rejects(fs.stat(recovery),{code:'ENOENT'});
  assert.equal(await new KeyStore(dir,enc).load(pub(FP_A)),KEY,'the saved account survives restarting the launcher');
  await assert.rejects(locked.saveSession(pub(null),temporary),KeyStoreError);
  await assert.rejects(locked.saveSession(pub(FP_A),'bad-key'),KeyStoreError);
});

test('saved account slots isolate identities, realms and certificates without falling back to the active key', async () => {
  const {ks} = store(), a = {...pub(FP_A), account: 'a'.repeat(64)}, b = {...pub(FP_A), account: 'b'.repeat(64)};
  const second = 'UUK_' + 'cd'.repeat(24);
  await ks.save(pub(FP_A), KEY);
  await ks.save(a, KEY); await ks.save(b, second);
  assert.equal(await ks.load(a), KEY); assert.equal(await ks.load(b), second);
  assert.equal(await ks.load({...a, fp: FP_B}), null);
  assert.equal(await ks.load({...a, port: 444}), null);
  assert.equal(await ks.load({...a, account: 'c'.repeat(64)}), null);
  await ks.remove(a);
  assert.equal(await ks.load(a), null);
  assert.equal(await ks.load(b), second);
  assert.equal(await ks.load(pub(FP_A)), KEY);
  await assert.rejects(ks.save({...a, account: '../outside'}, KEY), KeyStoreError);
});

async function waitRecovery(dir:string,key:string):Promise<void>{
  const file=path.join(dir,`${serverId('203.0.113.10',443,'public')}.txt`),until=Date.now()+3000;
  for(;;){try{if(readFileSync(file,'utf8').endsWith('\n'+key))return;}catch{}
    assert.ok(Date.now()<until,'recovery copy did not finish');await new Promise(r=>setTimeout(r,10));}
}

test("a public key loads only for the certificate it was saved with", async () => {
  const { ks } = store();
  await ks.save(pub(FP_A), KEY);
  assert.equal(await ks.load(pub(FP_A)), KEY);
  assert.equal(await ks.has(pub(FP_A)), true);
  assert.equal(await ks.load(pub(FP_B)), null, "another certificate never gets the key");
  assert.equal(await ks.has(pub(FP_B)), false);
  assert.equal(await ks.load(pub(null)), null);
  assert.deepEqual(await ks.certificateOf(pub(FP_B)), { fp: FP_A });
});

test("rebind moves the key to a new certificate", async () => {
  const { ks } = store();
  await ks.save(pub(FP_A), KEY);
  assert.equal(await ks.rebind(pub(FP_A), FP_B), true);
  assert.equal(await ks.load(pub(FP_B)), KEY);
  assert.equal(await ks.load(pub(FP_A)), null);
  assert.equal(await store().ks.rebind(pub(FP_A), FP_B), false, "nothing to move");
  await assert.rejects(ks.rebind(pub(FP_B), "not-a-fingerprint"), KeyStoreError);
});

test("a public key cannot be saved without a fingerprint", async () => {
  const { ks } = store();
  await assert.rejects(ks.save(pub(null), KEY), KeyStoreError);
  await assert.rejects(ks.save(pub("ABC"), KEY), KeyStoreError);
});

test("private keys are not tied to a certificate; old key files still load for private servers only", async () => {
  const { ks, dir } = store();
  const priv: KeySlot = { host: "100.64.0.1", port: 61000, mode: "private", fp: null };
  await ks.save(priv, KEY);
  assert.equal(await ks.load(priv), KEY);
  // The first file format: the key alone.
  writeFileSync(path.join(dir, `${serverId("100.64.0.2", 61000, "private")}.key`), enc.encrypt(KEY));
  assert.equal(await ks.load({ host: "100.64.0.2", port: 61000, mode: "private", fp: null }), KEY);
  writeFileSync(path.join(dir, `${serverId("203.0.113.10", 443, "public")}.key`), enc.encrypt(KEY));
  assert.equal(await ks.load(pub(FP_A)), null, "an untied public key goes nowhere");
  assert.deepEqual(await ks.certificateOf(pub(FP_A)), { fp: null });
});

test("remove deletes the key whatever certificate it belongs to", async () => {
  const { ks } = store();
  await ks.save(pub(FP_A), KEY);
  await ks.remove(pub(FP_B));
  assert.equal(await ks.certificateOf(pub(FP_A)), null);
});

test("Documents recovery survives lost local key storage and keeps certificate binding", async () => {
  const { dir } = store();
  const recovery = path.join(dir, "Documents");
  const primary = path.join(dir, "local");
  const ks = new KeyStore(primary, enc, recovery);
  await ks.save(pub(FP_A), KEY);
  await waitRecovery(recovery,KEY);
  rmSync(primary, {recursive:true, force:true});
  const restored = new KeyStore(primary, enc, recovery);
  assert.equal(await restored.load(pub(FP_B)), null);
  assert.equal(await restored.load(pub(FP_A)), KEY);
  await restored.remove(pub(FP_A));
  assert.equal(await restored.load(pub(FP_A)), null);
});

test("concurrent key saves finish in order and keep recovery consistent", async () => {
  const {dir} = store();
  const ks = new KeyStore(path.join(dir, 'local'), enc, path.join(dir, 'Documents'));
  const replacement = 'UUK_' + 'cd'.repeat(24);
  await Promise.all([ks.save(pub(FP_A), KEY), ks.save(pub(FP_A), replacement)]);
  assert.equal(await ks.load(pub(FP_A)), replacement);
  await waitRecovery(path.join(dir,'Documents'),replacement);
  rmSync(path.join(dir, 'local'), {recursive:true, force:true});
  assert.equal(await ks.load(pub(FP_A)), replacement);
});

test("removing a key during a pending save cannot resurrect it", async () => {
  const {ks} = store();
  await Promise.all([ks.save(pub(FP_A), KEY), ks.remove(pub(FP_A))]);
  assert.equal(await ks.load(pub(FP_A)), null);
});

test('a stalled Documents backup does not block the saved local key and removal waits for the copy',async t=>{
  const {dir}=store(),recovery=path.join(dir,'Documents'),ks=new KeyStore(path.join(dir,'local'),enc,recovery);
  const mkdir=fs.mkdir;let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  t.mock.method(fs,'mkdir',async(...args:Parameters<typeof fs.mkdir>)=>{if(String(args[0])===recovery)await gate;return mkdir(...args);});
  const save=ks.save(pub(FP_A),KEY);
  try{
    assert.equal(await Promise.race([save.then(()=>true),new Promise<boolean>(r=>setTimeout(()=>r(false),300))]),true,'local save must not wait for Documents');
    assert.equal(await ks.load(pub(FP_A)),KEY);
    const remove=ks.remove(pub(FP_A));release();await remove;
    assert.equal(await ks.load(pub(FP_A)),null,'a late backup must not resurrect the removed key');
  }finally{release();await save;}
});

test("a rejected save does not block later valid key changes", async () => {
  const {ks} = store();
  await assert.rejects(ks.save(pub(null), KEY), KeyStoreError);
  await ks.save(pub(FP_A), KEY);
  assert.equal(await ks.load(pub(FP_A)), KEY);
});
