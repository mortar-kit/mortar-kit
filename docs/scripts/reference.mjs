// Generates the API reference the docs site renders at /reference: runs
// TypeDoc over the packages' public entries and writes a compact JSON file
// (src/reference/api.json) of every export with its signature, comment,
// parameters and members. Run it after changing an exported API:
// `pnpm --filter mortar-docs reference`. TypeDoc needs TypeScript 5–6, so
// this package has its own (the workspace builds with TypeScript 7).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Application, Comment, ReflectionKind } from 'typedoc';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = fileURLToPath(new URL('../src/reference/api.json', import.meta.url));

/** Each documented entry: its import path and source file. */
const modules = [
  { module: '@mortar-kit/core', file: 'packages/core/src/index.ts' },
  { module: '@mortar-kit/core/server', file: 'packages/core/src/server.ts' },
  { module: '@mortar-kit/admin', file: 'packages/admin/src/index.ts' },
  { module: '@mortar-kit/admin/preview', file: 'packages/admin/src/preview.tsx' },
  { module: '@mortar-kit/admin/vite', file: 'packages/admin/src/vite.ts' },
];

const app = await Application.bootstrap({
  entryPoints: modules.map((m) => root + m.file),
  tsconfig: root + 'tsconfig.json',
  excludePrivate: true,
  excludeInternal: true,
  skipErrorChecking: true,
  sort: ['source-order'],
  logLevel: 'Warn',
});
const project = await app.convert();
if (!project) throw new Error('TypeDoc could not convert the project');

const text = (parts) => (parts ? Comment.combineDisplayParts(parts).trim() : '');
const summary = (reflection) => text(reflection?.comment?.summary);
const blockTag = (reflection, tag) => {
  const found = reflection?.comment?.blockTags.filter((t) => t.tag === tag) ?? [];
  return found.map((t) => text(t.content));
};
const type = (t) => (t ? t.toString() : 'unknown');

function typeParams(list) {
  if (!list?.length) return '';
  return `<${list.map((p) => p.name + (p.type ? ` extends ${type(p.type)}` : '') + (p.default ? ` = ${type(p.default)}` : '')).join(', ')}>`;
}

function signatureText(name, sig) {
  const params = (sig.parameters ?? []).map((p) => `${p.flags.isRest ? '...' : ''}${p.name}${p.flags.isOptional || p.defaultValue ? '?' : ''}: ${type(p.type)}`);
  return `function ${name}${typeParams(sig.typeParameters)}(${params.join(', ')}): ${type(sig.type)}`;
}

function member(child) {
  const sig = child.signatures?.[0];
  const isMethod = child.kind === ReflectionKind.Method || (sig && !child.type);
  return {
    name: child.name,
    optional: child.flags.isOptional,
    readonly: child.flags.isReadonly,
    type: isMethod && sig ? `(${(sig.parameters ?? []).map((p) => `${p.name}${p.flags.isOptional ? '?' : ''}: ${type(p.type)}`).join(', ')}) => ${type(sig.type)}` : type(child.type),
    doc: summary(sig ?? child) || summary(child),
  };
}

function entry(reflection, module) {
  const base = { name: reflection.name, module, deprecated: blockTag(reflection, '@deprecated').length > 0 };
  switch (reflection.kind) {
    case ReflectionKind.Function: {
      const sigs = reflection.signatures ?? [];
      const first = sigs[0];
      return {
        ...base,
        kind: 'function',
        summary: summary(first) || summary(reflection),
        signature: sigs.map((s) => signatureText(reflection.name, s)).join('\n'),
        params: (first?.parameters ?? []).map((p) => ({ name: p.name, type: type(p.type), optional: p.flags.isOptional || !!p.defaultValue, doc: summary(p) })),
        returns: first ? type(first.type) : undefined,
        examples: blockTag(first, '@example'),
      };
    }
    case ReflectionKind.Interface:
    case ReflectionKind.Class: {
      const kind = reflection.kind === ReflectionKind.Class ? 'class' : 'interface';
      const heritage = reflection.extendedTypes?.length ? ` extends ${reflection.extendedTypes.map(type).join(', ')}` : '';
      return {
        ...base,
        kind,
        summary: summary(reflection),
        signature: `${kind} ${reflection.name}${typeParams(reflection.typeParameters)}${heritage}`,
        members: (reflection.children ?? []).filter((c) => !c.flags.isPrivate).map(member),
      };
    }
    case ReflectionKind.TypeAlias:
      return {
        ...base,
        kind: 'type',
        summary: summary(reflection),
        signature: `type ${reflection.name}${typeParams(reflection.typeParameters)} = ${type(reflection.type)}`,
        members: reflection.children?.map(member),
      };
    case ReflectionKind.Variable: {
      // An object of helpers (like `fields`) lists each one as a member.
      const children = reflection.type?.type === 'reflection' ? reflection.type.declaration.children : undefined;
      return {
        ...base,
        kind: 'variable',
        summary: summary(reflection),
        signature: children?.length ? `const ${reflection.name}: { ${children.map((c) => c.name).join(', ')} }` : `const ${reflection.name}: ${type(reflection.type)}`,
        members: children?.map(member),
      };
    }
    default:
      return undefined;
  }
}

const entries = [];
for (const [index, child] of (project.children ?? []).entries()) {
  // With several entry points TypeDoc makes one module per entry, in order.
  const module = modules.find((m) => child.sources?.[0]?.fullFileName?.endsWith(m.file))?.module ?? modules[index]?.module;
  for (const exported of child.children ?? []) {
    const e = entry(exported, module);
    if (e) entries.push(e);
  }
}
entries.sort((a, b) => a.module.localeCompare(b.module) || a.name.localeCompare(b.name));
writeFileSync(out, `${JSON.stringify({ modules: modules.map((m) => m.module), entries }, null, 2)}\n`);
console.log(`Wrote ${entries.length} entries to ${out}`);
