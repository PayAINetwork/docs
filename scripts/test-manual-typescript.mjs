// Execute only isolated documentation snippets. No HTTP, signing or payment calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const blocks = text => [...text.matchAll(/```ts\n([\s\S]*?)\n```/g)].map(m => m[1]);
const server = blocks(read('x402/servers/typescript/manual-flow.mdx'));
const clientText = read('x402/clients/typescript/manual-flow.mdx');
const client = blocks(clientText);
const strip = text => stripTypeScriptTypes(text.replace(/^import \{ randomBytes \} from "node:crypto";\n/m, ''));
const context = extra => vm.createContext({ Buffer, ...extra });
const run = (code, ctx) => vm.runInContext(strip(code), ctx, { timeout: 1000 });
const env = { EVM_ADDRESS: '0x' + '1'.repeat(40), SVM_ADDRESS: '1'.repeat(32), SVM_FEE_PAYER: '2'.repeat(32) };
const approved = { scheme: 'exact', network: 'eip155:84532', asset: '0x' + '3'.repeat(40), payTo: env.EVM_ADDRESS, amount: '10000', maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' } };
const requirement = { x402Version: 2, resource: { url: 'https://example.invalid/weather' }, accepts: [approved], extensions: { fixture: { info: { example: true } } } };

test('expected snippet coverage and TypeScript syntax (not full signing implementation)', () => {
  assert.equal(server.length, 3);
  assert.equal(client.length, 7);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (const code of [...server, ...client]) new AsyncFunction(strip(code));
  assert.match(clientText, /not a complete copy-and-run client/);
});

test('server requires explicit configuration and keeps both asset/network pairs testnet', () => {
  for (const name of Object.keys(env)) {
    for (const value of [undefined, '', 'invalid']) {
      assert.throws(() => run(server[0], context({ process: { env: { ...env, [name]: value } } })), new RegExp(name));
    }
  }
  const ctx = context({ process: { env } });
  run(server[0], ctx);
  const result = JSON.parse(run('JSON.stringify(paymentRequired)', ctx));
  assert.deepEqual(result.accepts.map(a => [a.network, a.asset]), [
    ['eip155:84532', '0x036CbD53842c5426634e7929541eC2318f3dCF7e'],
    ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'],
  ]);
  assert.equal(result.accepts[0].payTo, env.EVM_ADDRESS);
  assert.equal(result.accepts[1].payTo, env.SVM_ADDRESS);
  assert.equal(result.accepts[1].extra.feePayer, env.SVM_FEE_PAYER);
  assert.deepEqual(JSON.parse(Buffer.from(run('paymentRequiredB64', ctx), 'base64')), result);
});

test('demonstration handler never delivers a protected resource', () => {
  const ctx = context({ process: { env } });
  for (const code of server) run(code, ctx);
  for (const headers of [{}, { 'payment-signature': '' }, { 'payment-signature': 'fixture-only-not-a-payment' }]) {
    let status, responseHeaders, body;
    ctx.req = { headers };
    ctx.res = { writeHead: (s,h) => { status=s; responseHeaders=h; }, end: b => { body=JSON.parse(b); } };
    run('handleGetWeather(req, res)', ctx);
    assert.equal(status, 'payment-signature' in headers ? 501 : 402);
    assert.equal(typeof body.error, 'string');
    assert.equal(body.weather, undefined);
    assert.equal('PAYMENT-REQUIRED' in responseHeaders, status === 402);
  }
});

test('non-402 responses stop before reading requirements; malformed JSON is rejected', () => {
  for (const status of [200, 204, 302, 400, 500]) {
    const ctx = context({ response: { status, headers: { get: () => assert.fail('must not inspect challenge') } } });
    assert.throws(() => run(client[1], ctx), /Not a payment challenge/);
  }
  assert.throws(() => run(client[1], context({ response: { status: 402, headers: { get: () => null } } })), /without PAYMENT-REQUIRED/);
  assert.throws(() => run(client[1], context({ response: { status: 402, headers: { get: () => Buffer.from('{').toString('base64') } } })), /JSON/);
});

test('selection obeys the stated prevalidated local policy', () => {
  const setup = accepts => context({ paymentRequired: { ...requirement, accepts }, approvedNetwork: approved.network, approvedAsset: approved.asset, approvedRecipient: approved.payTo, maxAmountAtomic: 10000n });
  for (const changed of [{ scheme: 'upto' }, { network: 'eip155:8453' }, { asset: 'other' }, { payTo: 'other' }, { amount: '10001' }, { amount: '0' }, { amount: '-1' }, { amount: '1.5' }]) {
    assert.throws(() => run(client[2], setup([{ ...approved, ...changed }])), /No payment option approved/);
  }
  const ctx = setup([approved]);
  run(client[2], ctx);
  assert.deepEqual(JSON.parse(run('JSON.stringify(accepted)', ctx)), approved);
});

test('both illustrative payment envelopes preserve v2 requirements, resource and extensions', () => {
  for (const [index, selected] of [[3, approved], [4, { ...approved, network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' }]]) {
    const ctx = context({ paymentRequired: requirement, accepted: selected, payerAddress: env.EVM_ADDRESS, transactionBuffer: Buffer.from('fixture-only-not-a-transaction'), randomBytes: n => Buffer.alloc(n, 1) });
    run(client[index], ctx);
    const payload = JSON.parse(run('JSON.stringify(payload)', ctx));
    assert.deepEqual(Object.keys(payload).sort(), ['accepted', 'extensions', 'payload', 'resource', 'x402Version']);
    assert.deepEqual(payload.accepted, selected);
    assert.deepEqual(payload.resource, requirement.resource);
    assert.deepEqual(payload.extensions, requirement.extensions);
    assert.deepEqual(JSON.parse(Buffer.from(run('paymentSignatureB64', ctx), 'base64')), payload);
    if (index === 3) assert.match(payload.payload.authorization.nonce, /^0x[0-9a-f]{64}$/);
  }
});

test('all settlement JSON is parseable and distinguishes receipts from requirements', () => {
  const examples = [...clientText.matchAll(/```json\n([\s\S]*?)\n```/g)].map(m => JSON.parse(m[1]));
  assert.equal(examples.length, 3);
  assert.equal(examples[1].network, 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
  for (const x of examples) {
    assert.equal(typeof x.success, 'boolean');
    assert.equal(typeof x.transaction, 'string');
    assert.equal(typeof x.network, 'string');
    assert.equal(x.accepts, undefined);
  }
  assert.deepEqual(examples[2], { success: false, errorReason: 'insufficient_funds', transaction: '', network: 'eip155:84532' });
  assert.match(examples[0].transaction, /^0x[0-9a-f]{64}$/);
});

test('response inspection retains errors and distinguishes unavailable settlement', async () => {
  const execute = async (status, settlement) => {
    const messages = [];
    const ctx = context({
      console: { log: (...args) => messages.push(args) },
      retryResponse: { status, ok: status >= 200 && status < 300, headers: { get: () => settlement === null ? null : Buffer.from(JSON.stringify(settlement)).toString('base64') }, json: async () => ({ resource: 'fixture' }) },
    });
    let error;
    try { await run('(async () => {\n' + client[6] + '\n})()', ctx); } catch (e) { error = e; }
    return { messages, error };
  };
  for (const status of [200, 402, 503]) {
    const settlement = { success: false, errorReason: 'settlement_pending', transaction: 'fixture', network: approved.network };
    const result = await execute(status, settlement);
    assert.match(result.error.message, /Settlement not confirmed/);
    assert.deepEqual(JSON.parse(JSON.stringify(result.messages[0][1])), settlement);
    assert.equal(result.messages.length, 1);
  }
  const missing = await execute(200, null);
  assert.equal(missing.error, undefined);
  assert.match(missing.messages[0][0], /unavailable/);
  assert.match((await execute(503, null)).error.message, /reconcile/);
  assert.equal((await execute(200, { success: true, transaction: 'fixture', network: approved.network })).error, undefined);
});
