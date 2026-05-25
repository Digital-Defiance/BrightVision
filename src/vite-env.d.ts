/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly E2E?: string
}

declare module '*.svg' {
  const src: string
  export default src
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.woff2' {
  const src: string
  export default src
}

declare module '*.svg?raw' {
  const src: string
  export default src
}
