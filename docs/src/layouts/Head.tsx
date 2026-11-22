// A page's title and description as head tags (@solidjs/meta).
import { Meta, Title } from '@solidjs/meta';
import { Show } from 'solid-js';

export function Head(props: { title: string; description?: string }) {
  return (
    <>
      <Title>{props.title === 'Mortar' ? 'Mortar' : `${props.title} · Mortar`}</Title>
      <Show when={props.description}>{(description) => <Meta name="description" content={description()} />}</Show>
    </>
  );
}
