import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

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

  const getStyle = () => {
    switch (type) {
      case 'success':
        return {
          container: 'border-emerald-500/30 bg-emerald-950/80 text-emerald-300 shadow-emerald-950/50',
          iconBg: 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400',
          glow: 'bg-emerald-500',
          bar: 'bg-emerald-500/60',
          title: 'BERHASIL',
          icon: <CheckCircle2 className="h-5 w-5" />
        };
      case 'info':
        return {
          container: 'border-cyan-500/30 bg-cyan-950/80 text-cyan-300 shadow-cyan-950/50',
          iconBg: 'border-cyan-500/30 bg-cyan-500/20 text-cyan-400',
          glow: 'bg-cyan-500',
          bar: 'bg-cyan-500/60',
          title: 'MODE DEVELOPER',
          icon: <Sparkles className="h-5 w-5" />
        };
      case 'error':
      default:
        return {
          container: 'border-rose-500/30 bg-rose-950/80 text-rose-300 shadow-rose-950/50',
          iconBg: 'border-rose-500/30 bg-rose-500/20 text-rose-400',
          glow: 'bg-rose-500',
          bar: 'bg-rose-500/60',
          title: 'KESALAHAN',
          icon: <AlertCircle className="h-5 w-5" />
        };
    }
  };

  const style = getStyle();

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
            ${style.container}
          `}>
            {/* Background Glow */}
            <div className={`absolute -right-4 -top-4 h-24 w-24 blur-3xl opacity-20 ${style.glow}`} />
            
            <div className="flex items-center gap-3.5 relative z-10">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${style.iconBg}`}>
                {style.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black uppercase tracking-widest mb-0.5">
                  {style.title}
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
              className={`absolute bottom-0 left-0 h-0.5 w-full origin-left ${style.bar}`}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
