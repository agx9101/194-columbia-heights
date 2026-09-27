import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildProject } from '../server.mjs';

const P = '00000000-0000-0000-0000-000000000001';
const Q = '00000000-0000-0000-0000-000000000002';
const SCAN = 'https://poly.cam/capture/EXAMPLE-SCAN';
const prop = (type, value) => ({ type, [type]: type === 'title' ? [{ plain_text: value }] : type === 'select' ? { name: value } : value });
const bool = value => prop('checkbox', value);
const page = () => ({ id: P, properties: {
  Project: prop('title', 'Test Residence'), Polycam: prop('url', SCAN),
  'Client Visible': bool(true), 'Show FFE': bool(true), 'Show Financials': bool(true),
  'Procurement Status': prop('select', 'Not Authorized')
} });
const item = (party, overrides = {}) => ({ id: 'example-item', properties: {
  Project: prop('relation', [{ id: P }]), 'Client Visible': bool(true),
  'FFE Item': prop('title', 'Example chair'), 'Procured By': prop('select', party),
  'Unit Price': prop('number', 100), 'Show Pricing': bool(true), ...overrides
} });

test('Polycam uses the configured project URL, with HTTPS-only and missing-value handling', () => {
  const p = page();
  assert.equal(buildProject(p, {}, P).project.polycam, SCAN);
  assert.equal(buildProject(p, {}, P).project.cintoo, null);
  p.properties.Polycam = prop('url', 'javascript:alert(1)');
  assert.equal(buildProject(p, {}, P).project.polycam, null);
  delete p.properties.Polycam;
  assert.equal(buildProject(p, {}, P).project.polycam, null);
  assert.throws(() => buildProject(p, {}, Q));
});

test('all four procurement parties serialize without authorizing, approving, ordering, or adding fees', () => {
  for (const party of ['Owner', 'GC', 'Animate Lot', 'Others']) {
    const x = buildProject(page(), { ffe: [item(party)] }, P);
    assert.equal(x.ffe[0].procuredBy, party);
    assert.equal(x.ffe[0].approved, false);
    assert.equal(x.ffe[0].ordered, false);
    assert.equal(x.ffe[0].delivered, false);
    assert.equal(x.project.procurement, 'Not Authorized');
    assert.deepEqual(x.payments, []);
    assert.deepEqual(x.scopes, []);
  }
});

test('unassigned and private procurement data respect existing visibility controls', () => {
  const unset = item('Owner');
  delete unset.properties['Procured By'];
  assert.equal(buildProject(page(), { ffe: [unset] }, P).ffe[0].procuredBy, null);
  const hidden = item('GC', { 'Client Visible': bool(false) });
  const foreign = item('Others', { Project: prop('relation', [{ id: Q }]) });
  assert.equal(buildProject(page(), { ffe: [hidden, foreign] }, P).ffe.length, 0);
  const p = page();
  p.properties['Show Financials'] = bool(false);
  const x = buildProject(p, { ffe: [item('Animate Lot')] }, P);
  assert.equal(x.ffe[0].procuredBy, 'Animate Lot');
  assert.equal(x.ffe[0].price, null);
  p.properties['Show FFE'] = bool(false);
  assert.equal(buildProject(p, { ffe: [item('Owner')] }, P).ffe.length, 0);
});

function renderInTest(data) {
  const source = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
  const boundary = source.indexOf('async function refresh()');
  assert.ok(boundary > 0, 'rendering code boundary must exist');
  const nodes = new Map();
  const getNode = id => {
    if (!nodes.has(id)) nodes.set(id, {
      innerHTML: '', textContent: '', hidden: false,
      removeAttribute() {}, getAttribute() { return null; },
      replaceChildren() { this.innerHTML = ''; }
    });
    return nodes.get(id);
  };
  const document = { getElementById: getNode, querySelector: () => ({ classList: { toggle() {} } }) };
  const context = vm.createContext({ document, data, URL, Intl });
  vm.runInContext(source.slice(0, boundary) + '\nrender(data);', context);
  return { getNode, context };
}

test('the client shows the Polycam label and Procured By column, then clears both on logout', () => {
  const x = buildProject(page(), { ffe: [item('Owner')] }, P);
  const { getNode, context } = renderInTest(x);
  assert.match(getNode('access').innerHTML, /View 3D Scan · Polycam/);
  assert.match(getNode('access').innerHTML, /https:\/\/poly\.cam\/capture\/EXAMPLE-SCAN/);
  assert.doesNotMatch(getNode('access').innerHTML, /Cintoo/);
  assert.match(getNode('ffe').innerHTML, /<th scope="col">Procured By<\/th>/);
  assert.match(getNode('ffe').innerHTML, />Owner<\/span>/);
  assert.match(getNode('procurement').textContent, /does not authorize an order or a procurement fee/);
  vm.runInContext('lock();', context);
  assert.equal(getNode('access').innerHTML, '');
  assert.equal(getNode('ffe').innerHTML, '');
  assert.equal(getNode('dashboard').hidden, true);
});

test('the FF&E chart keeps its column headings before items are published', () => {
  const { getNode } = renderInTest(buildProject(page(), {}, P));
  assert.match(getNode('ffe').innerHTML, /Procured By/);
  assert.match(getNode('ffe').innerHTML, /Selections are being developed/);
});

test('unassigned parties are labeled without defaulting to Owner', () => {
  const r = item('Owner');
  delete r.properties['Procured By'];
  const { getNode } = renderInTest(buildProject(page(), { ffe: [r] }, P));
  assert.match(getNode('ffe').innerHTML, />Unassigned<\/span>/);
  assert.doesNotMatch(getNode('ffe').innerHTML, />Owner<\/span>/);
});
