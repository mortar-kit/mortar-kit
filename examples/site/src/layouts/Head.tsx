// A document's title and description as head tags (@solidjs/meta). The
// Document's own <title> is the fallback.
import { Meta, Title } from '@solidjs/meta';
import { Show } from 'solid-js';

export function Head(props: { title: string; description?: string }) {
  return (
    <>
      <Title>{props.title}</Title>
      <Show when={props.description}>{(description) => <Meta name="description" content={description()} />}</Show>
    </>
  );
}
