declare module "react-katex" {
  import type { ReactElement } from "react";

  interface KaTeXProps {
    math: string;
    block?: boolean;
    errorColor?: string;
    renderError?: (error: Error) => ReactElement;
    settings?: Record<string, unknown>;
  }

  export const InlineMath: (props: KaTeXProps) => ReactElement;
  export const BlockMath: (props: KaTeXProps) => ReactElement;
}
