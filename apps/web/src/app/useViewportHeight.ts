// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import {useEffect} from 'react';
/** CSS-only viewport height broadcast: keyboard/browser chrome must not cover dialogs or Deal. */
export function useViewportHeight() {
  useEffect(()=>{
    const root=document.documentElement;
    const previous=root.style.getPropertyValue('--app-viewport-height');
    const previousTop=root.style.getPropertyValue('--app-viewport-top');
    let frame=0;
    const update=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const visual=window.visualViewport;
        const height=visual && visual.scale===1 ? visual.height : (root.clientHeight || window.innerHeight);
        root.style.setProperty('--app-viewport-height',`${Math.round(height)}px`);
        root.style.setProperty('--app-viewport-top',`${visual && visual.scale===1 ? Math.max(0, visual.offsetTop) : 0}px`);
      });
    };
    update(); window.addEventListener('resize',update); window.visualViewport?.addEventListener('resize',update); window.visualViewport?.addEventListener('scroll',update);
    return ()=>{
      cancelAnimationFrame(frame); window.removeEventListener('resize',update); window.visualViewport?.removeEventListener('resize',update); window.visualViewport?.removeEventListener('scroll',update);
      if(previous) root.style.setProperty('--app-viewport-height',previous); else root.style.removeProperty('--app-viewport-height');
      if(previousTop) root.style.setProperty('--app-viewport-top',previousTop); else root.style.removeProperty('--app-viewport-top');
    };
  },[]);
}
