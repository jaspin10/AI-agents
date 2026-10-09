import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAFF_REQUEST_REASON, classifyRepair } from './classify.js';

const plain = { feature: 'dashboard', operation: 'load_profile_card', route: '/dashboard', severity: 'low' };

test('tiny display fix outside sensitive areas is small', () => {
  const out = classifyRepair([{ path: 'src/components/ProfileCard.jsx', oldStr: 'const x = data.name;', newStr: "const x = data ? data.name : '';" }], plain, false);
  assert.equal(out.size, 'small');
});

test('WhatsApp bot and its people/permissions table are a hard wall', () => {
  assert.equal(classifyRepair([{ path: 'supabase/functions/whatsapp-bot/index.ts', oldStr: 'a', newStr: 'b' }], plain, false).size, 'blocked');
  assert.equal(classifyRepair([{ path: 'src/pages/Staff.jsx', oldStr: "from('x')", newStr: "from('whatsapp_people')" }], plain, false).size, 'blocked');
});

test('build files and env files are a hard wall', () => {
  assert.equal(classifyRepair([{ path: 'package.json', oldStr: 'a', newStr: 'b' }], plain, false).size, 'blocked');
  assert.equal(classifyRepair([{ path: '.env.local', oldStr: 'a', newStr: 'b' }], plain, false).size, 'blocked');
});

test('login, access, payments, migrations, student data are big', () => {
  const cases = [
    { path: 'src/pages/Login.jsx', oldStr: 'a', newStr: 'b' },
    { path: 'src/components/Nav.jsx', oldStr: "if (role === 'teacher')", newStr: "if (role === 'teacher' || role === 'owner')" },
    { path: 'api/checkout.js', oldStr: 'a', newStr: 'b' },
    { path: 'supabase/migrations/20261009_x.sql', oldStr: 'a', newStr: 'b' },
    { path: 'src/pages/Notes.jsx', oldStr: 'await q;', newStr: "await supabase.from('notes').update({ a: 1 });" },
  ];
  for (const edit of cases) assert.equal(classifyRepair([edit], plain, false).size, 'big', edit.path);
});

test('anti-fraud: anything touching licence/access dates/discounts is big', () => {
  const cases = [
    { path: 'src/components/Card.jsx', oldStr: 'const end = p.plan_end;', newStr: 'const end = addDays(p.plan_end, 30);' },
    { path: 'src/pages/Offers.jsx', oldStr: 'a', newStr: 'b' },
    { path: 'src/lib/x.js', oldStr: 'return 0;', newStr: 'return discount;' },
  ];
  for (const edit of cases) assert.equal(classifyRepair([edit], plain, false).size, 'big', edit.path);
});

test('an error that blocks homework or a class is big', () => {
  const edit = [{ path: 'src/components/Thing.jsx', oldStr: 'a', newStr: 'b' }];
  assert.equal(classifyRepair(edit, { feature: 'homework', operation: 'submit_homework', route: '/homework', severity: 'low' }, false).size, 'big');
  assert.equal(classifyRepair(edit, plain, true).size, 'big');
});

test('critical incidents and large changes are big', () => {
  const edit = [{ path: 'src/components/Thing.jsx', oldStr: 'a', newStr: 'b' }];
  assert.equal(classifyRepair(edit, { ...plain, severity: 'critical' }, false).size, 'big');
  const many = ['a', 'b', 'c', 'd'].map((n) => ({ path: `src/components/${n}.jsx`, oldStr: 'x', newStr: 'y' }));
  assert.equal(classifyRepair(many, plain, false).size, 'big');
});

test('a staff change request from WhatsApp is always big, even a tiny safe edit', () => {
  const edit = [{ path: 'src/components/ProfileCard.jsx', oldStr: 'const x = data.name;', newStr: "const x = data ? data.name : '';" }];
  for (const feature of ['level15', 'portal']) {
    const out = classifyRepair(edit, { feature, operation: 'change_request', route: 'whatsapp', severity: 'medium' }, false);
    assert.equal(out.size, 'big', feature);
    assert.ok(out.reasons.includes(STAFF_REQUEST_REASON), feature);
  }
});

test('a staff change request still hits the hard wall', () => {
  const req = { feature: 'level15', operation: 'change_request', route: 'whatsapp', severity: 'medium' };
  assert.equal(classifyRepair([{ path: 'supabase/functions/whatsapp-bot/index.ts', oldStr: 'a', newStr: 'b' }], req, false).size, 'blocked');
  assert.equal(classifyRepair([{ path: 'src/lib/guardianReport.js', oldStr: 'a', newStr: 'b' }], req, false).size, 'blocked');
});

test('empty repair is refused', () => {
  assert.equal(classifyRepair([], plain, false).size, 'blocked');
});
