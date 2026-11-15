#!/usr/bin/env node
// Generates docs/swarm/prompts/<id>.md and .tracker/plan.json from docs/swarm/SWARM.md.
//   node tools/swarm-plan.mjs [--phase p1=active,p0=done]   (phase status overrides)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'docs/swarm/SWARM.md'), 'utf8');
const sections = src.split(/^## /m).slice(1).map((s) => { const nl = s.indexOf('\n'); return [s.slice(0, nl).trim(), s.slice(nl + 1).trim()]; });
const special = Object.fromEntries(sections.filter(([h]) => h.startsWith('@')).map(([h, b]) => [h.slice(1), b]));
const agents = sections.filter(([h]) => !h.startsWith('@')).map(([h, body]) => {
  const [id, model, phase, role, name] = h.split('|').map((x) => x.trim());
  const m = body.match(/^owns:\s*(.*)\n?/);
  if (!m || !name) throw new Error('bad agent section: ' + h);
  return { id, model, phase, role, name, owns: m[1].split(',').map((x) => x.trim()).filter(Boolean), task: body.slice(m[0].length).trim() };
});
const ids = new Set(); for (const a of agents) { if (ids.has(a.id)) throw new Error('duplicate id ' + a.id); ids.add(a.id); }

mkdirSync(join(root, 'docs/swarm/prompts'), { recursive: true });
for (const a of agents) {
  const fill = (t) => t.replaceAll('{{id}}', a.id).replaceAll('{{name}}', a.name).replaceAll('{{model}}', a.model).replaceAll('{{owns}}', a.owns.map((o) => '`' + o + '`').join(', '));
  const extra = special['role:' + a.role] ? '\n\n' + fill(special['role:' + a.role]) : '';
  writeFileSync(join(root, 'docs/swarm/prompts', a.id + '.md'), `# ${a.id} — ${a.name}\n\n${fill(special.preamble)}\n\n${fill(a.task)}${extra}\n`);
}

const planPath = join(root, '.tracker/plan.json');
const old = existsSync(planPath) ? JSON.parse(readFileSync(planPath, 'utf8')) : {};
const over = Object.fromEntries((process.argv.find((x, i, arr) => arr[i - 1] === '--phase') || '').split(',').filter(Boolean).map((kv) => kv.split('=')));
const phases = (old.phases || []).map((p) => ({ ...p, status: over[p.id] || p.status }));
const keep = (old.agents || []).filter((a) => !ids.has(a.id));          // orchestrator, tracker, earlier one-offs
const plan = { ...old, phases, agents: [...keep, ...agents.map(({ task, ...a }) => ({ ...a, desc: task.split('\n').slice(0, 2).join(' ').slice(0, 220) }))] };
mkdirSync(dirname(planPath), { recursive: true });
writeFileSync(planPath, JSON.stringify(plan, null, 1) + '\n');
const byModel = {}; for (const a of agents) byModel[a.model] = (byModel[a.model] || 0) + 1;
console.log(`${agents.length} agents → docs/swarm/prompts/, plan.json updated`, JSON.stringify(byModel));
console.log(agents.map((a) => `${a.id}:${a.model}`).join(' '));
