import * as React from 'react';

export interface VisualViewportState {
  keyboardOpen: boolean;
  keyboardHeight: number;
  viewportHeight: number;
}

function isTextInputElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return true;
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type.toLowerCase();
    return ['text', 'search', 'url', 'email', 'password', 'tel', 'number', ''].includes(type);
  }
  return el.isContentEditable;
}

export function useVisualViewport(): VisualViewportState {
  const [state, setState] = React.useState<VisualViewportState>(() => ({
    keyboardOpen: false,
    keyboardHeight: 0,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    let focusedEditable = false;

    const update = () => {
      const layoutHeight = window.innerHeight;
      const vvHeight = vv ? vv.height : layoutHeight;
      const diff = Math.max(0, layoutHeight - vvHeight);
      const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
      const keyboardOpen = diff > 120 || (focusedEditable && isCoarsePointer && window.innerWidth < 768);

      document.documentElement.style.setProperty('--vv-height', `${Math.round(vvHeight)}px`);
      setState({
        keyboardOpen,
        keyboardHeight: diff > 120 ? Math.round(diff) : 0,
        viewportHeight: Math.round(vvHeight),
      });
    };

    const onFocusIn = (e: FocusEvent) => {
      focusedEditable = isTextInputElement(e.target);
      update();
    };

    const onFocusOut = () => {
      setTimeout(() => {
        focusedEditable = isTextInputElement(document.activeElement);
        update();
      }, 60);
    };

    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return state;
}
