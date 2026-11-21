// Client rendering of <PageView>: data, reactivity, normalization and keyed
// reordering.
import { render } from '@solidjs/testing-library';
import { createSignal, createStore, flush, For } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { defineBrick } from './brick.ts';
import { fields } from './fields.ts';
import type { PageEntry } from './entries.ts';
import { PageView } from './PageView.tsx';

const heading = defineBrick({
  name: 'heading',
  schema: { text: fields.text({ label: 'Text', default: 'Default heading' }) },
  component: (props) => <h2>{props.data.text}</h2>,
});

const tags = defineBrick({
  name: 'tags',
  schema: { items: fields.list({ label: 'Tags', of: fields.object({ label: 'Tag', fields: { name: fields.text({ label: 'Name' }) } }) }) },
  component: (props) => (
    <ul>
      <For each={props.data.items}>{(item) => <li>{item.name}</li>}</For>
    </ul>
  ),
});

const entries = (): PageEntry[] => [
  { brick: 'heading', id: 'a', data: { text: 'First' } },
  { brick: 'heading', id: 'b', data: { text: 'Second' } },
];
type Page = { entries: PageEntry[] };
const page = (): Page => ({ entries: entries() });

const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((el) => el.textContent);

describe('<PageView>', () => {
  it('renders each entry with its brick, in order', () => {
    const { container } = render(() => <PageView bricks={[heading]} entries={entries()} />);
    expect(texts(container, 'h2')).toEqual(['First', 'Second']);
  });

  it('renders nothing for an unknown brick', () => {
    const { container } = render(() => (
      <PageView bricks={[heading]} entries={[{ brick: 'missing', id: 'x', data: {} }, ...entries()]} />
    ));
    expect(container.querySelectorAll('h2')).toHaveLength(2);
  });

  it('renders the fallback for an unknown brick when one is given', () => {
    const { container } = render(() => (
      <PageView
        bricks={[heading]}
        entries={[{ brick: 'missing', id: 'x', data: {} }, ...entries()]}
        fallback={(entry) => <p class="missing">{entry.brick}</p>}
      />
    ));
    expect(texts(container, '.missing')).toEqual(['missing']);
    expect(texts(container, 'h2')).toEqual(['First', 'Second']);
  });

  it('fills missing and wrongly typed data with defaults', () => {
    const { container } = render(() => (
      <PageView
        bricks={[heading, tags]}
        entries={[
          { brick: 'heading', id: 'a', data: {} },
          { brick: 'tags', id: 'b', data: { items: 'not a list' } },
        ]}
      />
    ));
    expect(texts(container, 'h2')).toEqual(['Default heading']);
    expect(container.querySelector('ul')).toBeEmptyDOMElement();
  });

  it('updates in place when store data changes and moves DOM when reordered', () => {
    const [state, setState] = createStore({ page: page() });
    const { container } = render(() => <PageView bricks={[heading]} entries={state.page.entries} />);
    const [first, second] = container.querySelectorAll('h2');

    setState((s) => {
      s.page.entries[0]!.data.text = 'Edited';
    });
    flush();
    expect(first).toHaveTextContent('Edited');

    setState((s) => {
      s.page.entries.reverse();
    });
    flush();
    const after = container.querySelectorAll('h2');
    expect(after[0]).toBe(second);
    expect(after[1]).toBe(first);
  });

  it('keys by id, so a fresh array (e.g. a reload) reuses DOM', () => {
    const [p, setP] = createSignal<Page>(page());
    const { container } = render(() => <PageView bricks={[heading]} entries={p().entries} />);
    const [first, second] = container.querySelectorAll('h2');

    setP({
      entries: [
      { brick: 'heading', id: 'b', data: { text: 'Second!' } },
      { brick: 'heading', id: 'a', data: { text: 'First!' } },
      ],
    });
    flush();
    const after = container.querySelectorAll('h2');
    expect(texts(container, 'h2')).toEqual(['Second!', 'First!']);
    expect(after[0]).toBe(second);
    expect(after[1]).toBe(first);
  });

  it('keeps list items inside a brick when another item is edited', () => {
    const [state, setState] = createStore<{ page: Page }>({
      page: { entries: [{ brick: 'tags', id: 't', data: { items: [{ name: 'one' }, { name: 'two' }] } }] },
    });
    const { container } = render(() => <PageView bricks={[tags]} entries={state.page.entries} />);
    const [one, two] = container.querySelectorAll('li');

    setState((s) => {
      (s.page.entries[0]!.data.items as { name: string }[])[1]!.name = 'TWO';
    });
    flush();
    const after = container.querySelectorAll('li');
    expect(texts(container, 'li')).toEqual(['one', 'TWO']);
    expect(after[0]).toBe(one);
    expect(after[1]).toBe(two);
  });
});
