/// <reference types="node" />
// A test that reads the API document from disk: Node's types for this file
// alone, so the application's own code still cannot reach for them.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// The browser's types are written by hand from simlab-api's API; this holds
// them to it. Every field a type here declares must be one the API document
// has for it, so a renamed or invented field fails here rather than as an
// undefined on a page. The document is the copy in api/, refreshed with
// scripts/refresh-api-spec.sh and stamped with the version it came from.

interface Schema {
  $ref?: string
  type?: string
  properties?: Record<string, Schema>
  items?: Schema
}

const spec = JSON.parse(readFileSync(resolve(__dirname, '../../api/simlab-api.openapi.json'), 'utf8')) as {
  'x-vendored-from': string
  components: { schemas: Record<string, Schema> }
  paths: Record<string, Record<string, { responses?: Record<string, { content?: Record<string, { schema: Schema }> }> }>>
}

function resolveRef(schema: Schema): Schema {
  if (!schema.$ref) return schema
  const name = schema.$ref.replace('#/components/schemas/', '')
  const target = spec.components.schemas[name]
  if (!target) throw new Error(`the API document has no schema ${name}`)
  return resolveRef(target)
}

function response(path: string, method = 'get'): Schema {
  const schema = spec.paths[path]?.[method]?.responses?.['200']?.content?.['application/json']?.schema
  if (!schema) throw new Error(`the API document has no 200 JSON response for ${method.toUpperCase()} ${path}`)
  return resolveRef(schema)
}

function property(schema: Schema, name: string): Schema {
  const found = resolveRef(schema).properties?.[name]
  if (!found) throw new Error(`no property ${name}`)
  return resolveRef(found)
}

// Which schema each type in types.ts is held to.
const checked: Record<string, () => Schema> = {
  // The same name in the document.
  ...Object.fromEntries(
    ['Point', 'Tunnel', 'Layout', 'Entity', 'Exposure', 'Mine', 'Burst', 'Scenario', 'Run', 'QueueSnapshot', 'Cycle',
      'IntentSettings', 'IntentStep', 'IntentChange', 'IntentTransition', 'CycleIntent', 'Location', 'SeismicEvent',
      'Metrics', 'Build', 'Provenance'].map((name) => [name, () => resolveRef({ $ref: `#/components/schemas/${name}` })]),
  ),
  // Written inline in the document.
  Sensor: () => resolveRef(property(spec.components.schemas.Layout!, 'sensors').items!),
  Workforce: () => property(spec.components.schemas.Scenario!, 'workforce'),
  RunDetail: () => response('/api/runs/{id}'),
  RunIntent: () => response('/api/runs/{id}/intent'),
  Versions: () => response('/api/version'),
  Ground: () => response('/api/runs/{id}/ground'),
}

// Types held to something other than this document, and why.
const unchecked: Record<string, string> = {
  PlatformField: "the autoscaler's, passed through as it sends it",
  PlatformSchema: "the autoscaler's, passed through as it sends it",
  Target: "the autoscaler's, passed through as it sends it",
  TargetSnapshot: "the autoscaler's, passed through as it sends it",
  SettingsSnapshot: "the autoscaler's, passed through as it sends it",
  Decision: "the autoscaler's, passed through as it sends it",
  TargetStatus: "the autoscaler's, passed through as it sends it",
  RunEvent: 'an event on the stream, which the document does not describe',
  RunListing: 'a view the page builds from a run, not a response',
  BuiltWith: 'a view the page builds from a run, not a response',
}

// Every interface in types.ts, with the fields it declares.
function declared(): Map<string, string[]> {
  const path = resolve(__dirname, 'types.ts')
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const out = new Map<string, string[]>()
  source.forEachChild((node) => {
    if (!ts.isInterfaceDeclaration(node)) return
    const fields = node.members
      .filter(ts.isPropertySignature)
      .map((member) => member.name.getText(source).replace(/^['"]|['"]$/g, ''))
    out.set(node.name.text, fields)
  })
  return out
}

describe(`the browser's types against ${spec['x-vendored-from']}`, () => {
  const types = declared()

  it('finds the types it checks', () => {
    expect(types.size).toBeGreaterThan(30)
  })

  it('checks every type or says why it does not', () => {
    const unclassified = [...types.keys()].filter((name) => !(name in checked) && !(name in unchecked))
    expect(unclassified, 'add each to `checked` with its schema, or to `unchecked` with the reason').toEqual([])
  })

  for (const [name, schema] of Object.entries(checked)) {
    it(`declares only fields the API has for ${name}`, () => {
      const fields = types.get(name)
      expect(fields, `types.ts has no interface ${name}`).toBeDefined()
      const properties = Object.keys(resolveRef(schema()).properties ?? {})
      const invented = (fields ?? []).filter((field) => !properties.includes(field))
      expect(invented, `${name} declares fields the API document does not have`).toEqual([])
    })
  }
})
