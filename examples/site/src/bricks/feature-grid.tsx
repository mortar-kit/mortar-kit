// Example brick: a titled grid of features, each with an optional image.
import { defineBrick, fields } from '@mortar-kit/core';
import { For, Show } from 'solid-js';

const feature = fields.object({
  label: 'Feature',
  fields: {
    title: fields.text({ label: 'Title', required: true, default: 'New feature' }),
    body: fields.textarea({ label: 'Description' }),
    image: fields.image({ label: 'Image' }),
  },
});

export const featureGrid = defineBrick({
  name: 'feature-grid',
  label: 'Feature grid',
  schema: {
    heading: fields.text({ label: 'Heading', default: 'Features' }),
    columns: fields.number({ label: 'Columns', min: 1, max: 4, default: 3 }),
    features: fields.list({ label: 'Features', of: feature, min: 1, max: 12 }),
  },
  component: (props) => (
    <section class="features">
      <Show when={props.data.heading}>
        <h2>{props.data.heading}</h2>
      </Show>
      <div class="features-grid" style={{ '--columns': String(props.data.columns) }}>
        <For each={props.data.features}>
          {(item) => (
            <article class="feature">
              <Show when={item.image.src}>
                <img src={item.image.src} alt={item.image.alt} />
              </Show>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          )}
        </For>
      </div>
    </section>
  ),
});
