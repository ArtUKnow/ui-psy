import { useEffect, useRef, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X } from './icons';

let openModalCount = 0;
let originalBodyOverflow = '';
let originalFocus: HTMLElement | null = null;

export default function Modal({ children, onClose, className = '', label }: { children: ReactNode; onClose: () => void; className?: string; label: string }) {
  const reducedMotion=useReducedMotion()||document.documentElement.dataset.motion==='off';
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Keep the page locked when one animated dialog replaces another.
    if (openModalCount === 0) {
      originalBodyOverflow = document.body.style.overflow;
      originalFocus = previous;
    }
    openModalCount += 1;
    document.body.style.overflow = 'hidden';
    const shell = document.querySelector<HTMLElement>('.app-shell');
    if (shell) shell.inert = true;
    const panel = panelRef.current;
    const timer = window.setTimeout(() => panel?.focus(), 30);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea, select, a[href], [tabindex="0"]')).filter(element => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      clearTimeout(timer);
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        document.body.style.overflow = originalBodyOverflow;
        if (shell) shell.inert = false;
        const focusTarget = previous?.isConnected ? previous : originalFocus;
        if (focusTarget?.isConnected) focusTarget.focus();
        originalFocus = null;
      }
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  return createPortal(
    <motion.div className={`modal-backdrop ${className.includes('event-editor')?'event-sheet-backdrop':''}`} initial={reducedMotion?false:{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: reducedMotion?1:0 }} transition={{duration:reducedMotion?0:.2}} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className={`modal-panel ${className}`} initial={reducedMotion?false:{ opacity: 0, y: 28, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: .97 }} transition={reducedMotion?{duration:0}:{ type: 'spring', stiffness: 330, damping: 32 }}>
        {children}
      </motion.div>
    </motion.div>, document.body
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return <button className="icon-button close-button" onClick={onClick} aria-label="Закрыть"><X size={20} /></button>;
}