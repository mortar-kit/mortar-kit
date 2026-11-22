// One export of the API reference: its declaration, comment, parameters,
// members and examples. Type names of other exports link to their pages.
import { createMemo, For, Show } from 'solid-js';

import { renderMarkdown } from '../markdown.ts';
import { referenceHref, type ApiEntry } from './api.ts';
import styles from './Entry.module.css';

/** TypeScript text with each known export name linked. */
function Code(props: { text: string; names: ReadonlySet<string>; self: string }) {
  const parts = createMemo(() => props.text.split(/([A-Za-z_$][\w$]*)/));
  return (
    <For each={parts()}>
      {(part) => (
        <Show when={part !== props.self && props.names.has(part)} fallback={part}>
          <a href={referenceHref(part)}>{part}</a>
        </Show>
      )}
    </For>
  );
}

function Prose(props: { markdown: string }) {
  const html = createMemo(() => renderMarkdown(props.markdown));
  // oxlint-disable-next-line solid/no-innerhtml -- Comments from the packages' own sources, rendered by markdown.ts.
  return <div class={styles.prose} innerHTML={html()} />;
}

export interface EntryProps {
  entry: ApiEntry;
  /** Every export's name, for links. */
  names: readonly string[];
  /** Heading level of the entry's name: 1 on its own page, 2 or 3 inside a guide. */
  level?: 1 | 2 | 3;
  /** Link the name to the entry's own page (inside a guide). */
  linked?: boolean;
}

/** Renders one reference entry. */
export function Entry(props: EntryProps) {
  const names = createMemo(() => new Set(props.names));
  const heading = () => (
    <>
      <code>{props.entry.name}</code>
      <span class={styles.kind}>{props.entry.kind}</span>
    </>
  );
  return (
    <article class={styles.entry} id={props.entry.name}>
      <header class={styles.header}>
        <Show when={(props.level ?? 1) === 1} fallback={<h2 class={styles.name}>{props.linked ? <a href={referenceHref(props.entry.name)}>{heading()}</a> : heading()}</h2>}>
          <h1 class={styles.name}>{heading()}</h1>
        </Show>
        <p class={styles.module}>
          import {'{ '}
          {props.entry.name}
          {' }'} from '{props.entry.module}'
        </p>
      </header>
      <Show when={props.entry.deprecated}>
        <p class={styles.deprecated}>Deprecated.</p>
      </Show>
      <pre class={styles.signature}>
        <code>
          <Code text={props.entry.signature} names={names()} self={props.entry.name} />
        </code>
      </pre>
      <Show when={props.entry.summary}>
        <Prose markdown={props.entry.summary} />
      </Show>
      <Show when={props.entry.params?.length}>
        <h3 class={styles.section}>Parameters</h3>
        <dl class={styles.list}>
          <For each={props.entry.params}>
            {(param) => (
              <div class={styles.item}>
                <dt>
                  <code>
                    {param.name}
                    {param.optional ? '?' : ''}: <Code text={param.type} names={names()} self={props.entry.name} />
                  </code>
                </dt>
                <Show when={param.doc}>
                  <dd>
                    <Prose markdown={param.doc} />
                  </dd>
                </Show>
              </div>
            )}
          </For>
        </dl>
      </Show>
      <Show when={props.entry.returns && props.entry.returns !== 'void'}>
        <h3 class={styles.section}>Returns</h3>
        <p>
          <code>
            <Code text={props.entry.returns!} names={names()} self={props.entry.name} />
          </code>
        </p>
      </Show>
      <Show when={props.entry.members?.length}>
        <h3 class={styles.section}>{props.entry.kind === 'variable' ? 'Members' : 'Properties'}</h3>
        <dl class={styles.list}>
          <For each={props.entry.members}>
            {(member) => (
              <div class={styles.item}>
                <dt>
                  <code>
                    {member.readonly ? 'readonly ' : ''}
                    {member.name}
                    {member.optional ? '?' : ''}: <Code text={member.type} names={names()} self={props.entry.name} />
                  </code>
                </dt>
                <Show when={member.doc}>
                  <dd>
                    <Prose markdown={member.doc} />
                  </dd>
                </Show>
              </div>
            )}
          </For>
        </dl>
      </Show>
      <Show when={props.entry.examples?.length}>
        <h3 class={styles.section}>Example</h3>
        <For each={props.entry.examples}>{(example) => <Prose markdown={example} />}</For>
      </Show>
    </article>
  );
}
