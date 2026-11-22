// CSS module typings for the package build, which runs without Vite's client
// types. (The workspace typecheck gets the same declaration from vite/client,
// so this lives outside src/.)
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

// Plain stylesheets imported for their side effects (the design tokens and the theme slot).
declare module '*.css' {}
