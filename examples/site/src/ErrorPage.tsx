// Error boundary for production builds: an error nothing else caught
// becomes a 500 message instead of a failed request. In dev it is left out
// so errors reach Vite with their stack, as with the plugin's generated
// entries (which add the same boundary only to builds).
import { httpStatus, isServer } from '@solidjs/web';
import { Errored, type ParentProps } from 'solid-js';

function Boundary(props: ParentProps) {
  return (
    <Errored
      fallback={(error) => {
        console.error(error());
        httpStatus(500);
        return <p>{isServer ? '500 | Internal Server Error' : 'Error | Uncaught Client Exception'}</p>;
      }}
    >
      {props.children}
    </Errored>
  );
}

function Passthrough(props: ParentProps) {
  return <>{props.children}</>;
}

export const ErrorPage = import.meta.env.DEV ? Passthrough : Boundary;
