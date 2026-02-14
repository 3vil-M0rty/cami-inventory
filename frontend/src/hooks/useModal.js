import { useState, useCallback } from 'react';

/**
 * useModal Hook
 * 
 * Reusable hook for managing modal open/close state
 * Used for forms, confirmations, and other modal dialogs
 */

export const useModal = (initialState = false) => {
  const [isOpen, setIsOpen] = useState(initialState);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle
  };
};

export default useModal;
