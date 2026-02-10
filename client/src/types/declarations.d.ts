declare module 'react-virtualized-auto-sizer' {
  import * as React from 'react';

  export interface Size {
    height: number;
    width: number;
  }

  export interface AutoSizerProps {
    children: (size: Size) => React.ReactNode;
    className?: string;
    defaultHeight?: number;
    defaultWidth?: number;
    disableHeight?: boolean;
    disableWidth?: boolean;
    onResize?: (size: Size) => void;
    style?: React.CSSProperties;
  }

  export default class AutoSizer extends React.Component<AutoSizerProps> {}
}

declare module 'react-window' {
  import * as React from 'react';

  export interface ListProps {
    children: (props: { index: number; style: React.CSSProperties }) => React.ReactNode;
    height: number;
    width: number;
    itemCount: number;
    itemSize: number;
    className?: string;
    style?: React.CSSProperties;
    initialScrollOffset?: number;
    onItemsRendered?: (props: {
      overscanStartIndex: number;
      overscanStopIndex: number;
      visibleStartIndex: number;
      visibleStopIndex: number;
    }) => void;
    onScroll?: (props: {
        scrollDirection: "forward" | "backward";
        scrollOffset: number;
        scrollUpdateWasRequested: boolean;
      }) => void;
  }

  export class FixedSizeList extends React.Component<ListProps> {
    scrollTo(scrollOffset: number): void;
    scrollToItem(index: number, align?: "auto" | "smart" | "center" | "end" | "start"): void;
  }
}
