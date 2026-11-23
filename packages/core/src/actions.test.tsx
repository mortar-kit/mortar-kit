// Brick forms on the client: <ActionForm> posts where the app's BrickActions
// says, and a submission reaches only its own entry's component. On an
// island, islandActions sends the form in the background and keeps each
// entry's latest submission.
import { render } from '@solidjs/testing-library';
import { createSignal, flush } from 'solid-js';
import { describe, expect, it } from 'vitest';

import { BrickActionsContext, ActionForm, islandActions, sameEntry, type BrickActions, type EntryRef } from './actions.tsx';
import { defineBrick, type Submission } from './brick.ts';
import { fields } from './fields.ts';
import { PageView } from './PageView.tsx';

let renders = 0;
const contact = defineBrick({
  name: 'contact',
  schema: { label: fields.text({ label: 'Label', default: 'Send' }) },
  action: async () => ({ sent: true }),
  component: (props) => {
    renders += 1;
    return (
      <section>
        <p class="status">{props.submission?.pending ? 'sending' : props.submission?.result?.sent ? 'sent' : 'idle'}</p>
        <ActionForm class="form">
          <button type="submit">{props.data.label}</button>
        </ActionForm>
      </section>
    );
  },
});

const plain = defineBrick({ name: 'plain', schema: {}, component: () => <ActionForm>x</ActionForm> });

const entries = [
  { brick: 'contact', id: 'one', data: {} },
  { brick: 'contact', id: 'two', data: {} },
];

/** Fake actions: posts to /post/<entry>; submissions come from a signal keyed by entry id. */
function fakeActions() {
  const [subs, setSubs] = createSignal<Record<string, Submission<unknown>>>({});
  const asked: EntryRef[] = [];
  const actions: BrickActions = {
    action: (ref) => `/post/${ref.collection}/${ref.doc}/${ref.entry}`,
    useSubmission: (ref) => {
      asked.push(ref());
      return () => subs()[ref().entry];
    },
  };
  return { actions, setSubs, asked };
}

describe('brick forms', () => {
  it("post to the entry's action, named by collection, document and entry", () => {
    const { actions } = fakeActions();
    const { container } = render(() => (
      <BrickActionsContext value={actions}>
        <PageView bricks={[contact]} entries={entries} doc={{ collection: 'pages', id: 'home' }} />
      </BrickActionsContext>
    ));
    const forms = [...container.querySelectorAll('form')];
    expect(forms.map((f) => [f.getAttribute('method'), f.getAttribute('action'), f.className])).toEqual([
      ['post', '/post/pages/home/one', 'form'],
      ['post', '/post/pages/home/two', 'form'],
    ]);
  });

  it('give each entry only its own submission, without re-creating the brick', () => {
    const { actions, setSubs } = fakeActions();
    const { container } = render(() => (
      <BrickActionsContext value={actions}>
        <PageView bricks={[contact]} entries={entries} doc={{ collection: 'pages', id: 'home' }} />
      </BrickActionsContext>
    ));
    const status = () => [...container.querySelectorAll('.status')].map((p) => p.textContent);
    expect(status()).toEqual(['idle', 'idle']);
    const before = renders;
    setSubs({ two: { pending: true } });
    flush();
    expect(status()).toEqual(['idle', 'sending']);
    setSubs({ two: { pending: false, result: { sent: true } } });
    flush();
    expect(status()).toEqual(['idle', 'sent']);
    expect(renders).toBe(before);
  });

  it("don't post anywhere without the document or the app's actions", () => {
    const { actions } = fakeActions();
    const noDoc = render(() => (
      <BrickActionsContext value={actions}>
        <PageView bricks={[contact]} entries={entries} />
      </BrickActionsContext>
    ));
    expect(noDoc.container.querySelector('form')?.hasAttribute('action')).toBe(false);
    const noActions = render(() => <PageView bricks={[contact]} entries={entries} doc={{ collection: 'pages', id: 'home' }} />);
    expect(noActions.container.querySelector('form')?.hasAttribute('action')).toBe(false);
  });

  it('give no submission to a brick without an action', () => {
    const { actions, setSubs } = fakeActions();
    const spy = defineBrick({
      name: 'spy',
      schema: {},
      component: (props) => <p class="spy">{props.submission === undefined ? 'none' : 'some'}</p>,
    });
    setSubs({ s: { pending: false, result: 1 } });
    const { container } = render(() => (
      <BrickActionsContext value={actions}>
        <PageView bricks={[spy, plain]} entries={[{ brick: 'spy', id: 's', data: {} }]} doc={{ collection: 'pages', id: 'home' }} />
      </BrickActionsContext>
    ));
    expect(container.querySelector('.spy')?.textContent).toBe('none');
  });
});

describe('sameEntry', () => {
  it('matches a reference by collection, document and entry', () => {
    const ref = { collection: 'pages', doc: 'home', entry: 'one' };
    expect(sameEntry({ ...ref }, ref)).toBe(true);
    expect(sameEntry({ ...ref, entry: 'two' }, ref)).toBe(false);
    expect(sameEntry(null, ref)).toBe(false);
    expect(sameEntry(ref, undefined)).toBe(false);
  });
});

describe('islandActions', () => {
  const page = (actions: BrickActions) =>
    render(() => (
      <BrickActionsContext value={actions}>
        <PageView bricks={[contact]} entries={entries} doc={{ collection: 'pages', id: 'home' }} />
      </BrickActionsContext>
    ));

  it("sends an entry's form in the background, pending until the result is back", async () => {
    const posts: [EntryRef, string | null][] = [];
    let answer!: (value: unknown) => void;
    const actions = islandActions({
      action: (ref) => `/post/${ref.entry}`,
      run: (ref, form) => {
        posts.push([ref, form.get('note') as string | null]);
        return new Promise((resolve) => (answer = resolve));
      },
    });
    const { container } = page(actions);
    const status = () => [...container.querySelectorAll('.status')].map((p) => p.textContent);
    const form = container.querySelectorAll('form')[1]!;
    expect(form.getAttribute('action')).toBe('/post/two');
    const note = document.createElement('input');
    note.name = 'note';
    note.value = 'hi';
    form.append(note);
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    expect(posts).toEqual([[{ collection: 'pages', doc: 'home', entry: 'two' }, 'hi']]);
    flush();
    expect(status()).toEqual(['idle', 'sending']);
    answer({ sent: true });
    await Promise.resolve();
    await Promise.resolve();
    flush();
    expect(status()).toEqual(['idle', 'sent']);
  });

  it('unwraps a whole response from a server function that sets headers', async () => {
    const actions = islandActions({ action: () => '/post', run: async () => new Response(null, { status: 200 }) });
    const ref = { collection: 'pages', doc: 'home', entry: 'one' };
    const latest = actions.useSubmission(() => ref);
    await actions.submit!(ref, new FormData());
    flush();
    expect(latest()).toEqual({ pending: false, result: undefined });
  });

  it('keeps what the action threw', async () => {
    const failure = new Error('nope');
    const actions = islandActions({ action: () => '/post', run: () => Promise.reject(failure) });
    const ref = { collection: 'pages', doc: 'home', entry: 'one' };
    const latest = actions.useSubmission(() => ref);
    await actions.submit!(ref, new FormData());
    flush();
    expect(latest()?.pending).toBe(false);
    expect(latest()?.error).toBeDefined();
  });

  it("leaves the browser's post alone with BrickActions that have no submit", () => {
    const { actions } = fakeActions();
    const { container } = page(actions);
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    container.querySelector('form')!.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(false);
  });
});
