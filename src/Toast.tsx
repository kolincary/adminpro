import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export type ToastType = 'success' | 'error';

interface ToastProps {
  message: string;
  type: ToastType;
  isVisible: boolean;
  onClose: () => void;
}

export default function Toast({ message, type, isVisible, onClose }: ToastProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -100, x: '-50%' }}
          animate={{ opacity: 1, y: 16, x: '-50%' }}
          exit={{ opacity: 0, y: -100, x: '-50%' }}
          transition={{ duration: 0.25 }}
          className="fixed left-1/2 top-4 z-[9999] w-full max-w-md px-4 pointer-events-none"
        >
          <div className={`
            relative overflow-hidden rounded-2xl border p-4 shadow-2xl backdrop-blur-xl
            ${type === 'success' 
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' 
              : 'border-rose-500/20 bg-rose-500/10 text-rose-400'}
          `}>
            {/* Background Glow */}
            <div className={`absolute -right-4 -top-4 h-24 w-24 blur-3xl opacity-20 ${type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            
            <div className="flex items-center gap-4 relative z-10">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${type === 'success' ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-rose-500/20 bg-rose-500/10'}`}>
                {type === 'success' ? <CheckCircle2 className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black uppercase tracking-widest mb-0.5">
                  {type === 'success' ? 'BERHASIL' : 'KESALAHAN'}
                </p>
                <p className="text-sm font-medium leading-relaxed opacity-90 truncate">
                  {message}
                </p>
              </div>
            </div>
            
            {/* Progress Bar */}
            <motion.div 
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 2.5, ease: "linear" }}
              className={`absolute bottom-0 left-0 h-0.5 w-full origin-left ${type === 'success' ? 'bg-emerald-500/50' : 'bg-rose-500/50'}`}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
