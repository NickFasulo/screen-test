// @devvit/web resolves its client entry behind the `browser` export
// condition — under bundler resolution tsc sees a panic stub with no
// exports, so declare the client API we use here.
declare module '@devvit/web/client' {
  export function navigateTo(url: string | { url: string }): void
}
