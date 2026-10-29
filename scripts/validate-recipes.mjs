#!/usr/bin/env node
// Validates js/recipes.js. Run with `npm run validate` (also runs in CI).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'js', 'recipes.js');

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(file, 'utf8') + '\n;globalThis.__R = RECIPES;', ctx, { filename: file });
const recipes = ctx.__R;

const PROTEIN = new Set(['chicken', 'meat', 'veg']);
const TYPE = new Set(['rice', 'saalan', 'sides', 'snacks']);
const EFFORT = new Set(['quick', 'medium', 'elaborate']);
const TIME_RE = /^(?:\d+(?:\.\d+)?\+?\s*hrs?)?\s*(?:\d+\s*min)?$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STRING_FIELDS = ['id', 'name', 'urdu', 'protein', 'type', 'effort', 'time', 'desc', 'urduDesc', 'notes'];
const OPTIONAL_STRING_FIELDS = ['emoji'];
const ALLOWED = new Set([...STRING_FIELDS, ...OPTIONAL_STRING_FIELDS, 'ingredients']);

const errors = [];
const err = (r, msg) => errors.push(`${r && r.name ? r.name : '(unnamed)'}: ${msg}`);

if (!Array.isArray(recipes) || recipes.length === 0) {
  console.error('RECIPES is empty or not an array');
  process.exit(1);
}

const ids = new Map(), names = new Map();
recipes.forEach((r, i) => {
  for (const f of STRING_FIELDS) {
    if (typeof r[f] !== 'string' || !r[f].trim()) err(r, `missing or empty "${f}"`);
  }
  for (const f of OPTIONAL_STRING_FIELDS) {
    if (r[f] !== undefined && (typeof r[f] !== 'string' || !r[f].trim())) err(r, `"${f}" must be a non-empty string when present`);
  }
  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) err(r, 'ingredients must be a non-empty array');
  else r.ingredients.forEach((ing, j) => { if (typeof ing !== 'string' || !ing.trim()) err(r, `ingredient #${j + 1} is empty`); });
  for (const k of Object.keys(r)) if (!ALLOWED.has(k)) err(r, `unknown field "${k}"`);

  if (typeof r.id === 'string') {
    if (!SLUG_RE.test(r.id)) err(r, `id "${r.id}" is not a lowercase-hyphen slug`);
    if (ids.has(r.id)) err(r, `duplicate id "${r.id}" (also #${ids.get(r.id) + 1})`); else ids.set(r.id, i);
  }
  if (typeof r.name === 'string') {
    if (names.has(r.name)) err(r, `duplicate name (also #${names.get(r.name) + 1})`); else names.set(r.name, i);
  }
  if (!PROTEIN.has(r.protein)) err(r, `protein "${r.protein}" not one of ${[...PROTEIN].join('|')}`);
  if (!TYPE.has(r.type)) err(r, `type "${r.type}" not one of ${[...TYPE].join('|')}`);
  if (!EFFORT.has(r.effort)) err(r, `effort "${r.effort}" not one of ${[...EFFORT].join('|')}`);
  if (typeof r.time === 'string' && !TIME_RE.test(r.time.trim())) err(r, `time "${r.time}" not in a recognised format ("45 min", "1 hr 30 min", "4+ hrs")`);
  if (typeof r.urdu === 'string' && !/[؀-ۿ]/.test(r.urdu)) err(r, 'urdu name contains no Arabic-script characters');
  if (typeof r.urduDesc === 'string' && !/[؀-ۿ]/.test(r.urduDesc)) err(r, 'urduDesc contains no Arabic-script characters');
});

const byType = {}, byProtein = {}, byEffort = {};
for (const r of recipes) {
  byType[r.type] = (byType[r.type] || 0) + 1;
  byProtein[r.protein] = (byProtein[r.protein] || 0) + 1;
  byEffort[r.effort] = (byEffort[r.effort] || 0) + 1;
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s) in js/recipes.js:\n` + errors.map(e => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log(`✓ ${recipes.length} recipes valid`);
console.log(`  protein: ${JSON.stringify(byProtein)}\n  type:    ${JSON.stringify(byType)}\n  effort:  ${JSON.stringify(byEffort)}`);
