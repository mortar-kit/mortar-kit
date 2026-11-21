// Root component (start mode renders it inside Document.tsx).
import { Loading } from 'solid-js';

import { Router } from './router.ts';
import './styles.css';

export default function App() {
  return <Router>{(props) => <Loading>{props.children}</Loading>}</Router>;
}
