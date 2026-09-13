import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { Bell, MessageCircle, AlertTriangle, Info, X, CheckCircle2 } from 'lucide-react';

interface GlobalAlert {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'wa-alert';
  timestamp: number;
  expiresAt: number;
  isActive: boolean;
}

const GlobalNotificationBanner: React.FC = () => {
  const [alert, setAlert] = useState<GlobalAlert | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [lastAlertId, setLastAlertId] = useState<string | null>(null);

  useEffect(() => {
    // Listen to the global alerts document
    const unsub = onSnapshot(doc(db, 'metadata', 'global_alerts'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data && data.activeNotification) {
          const newAlert = data.activeNotification as GlobalAlert;
          
          if (!newAlert.isActive) {
            setIsVisible(false);
            return;
          }

          // If it has expired before we even received it, don't show it
          if (newAlert.expiresAt > 0 && Date.now() >= newAlert.expiresAt) {
            setIsVisible(false);
            return;
          }

          setAlert(newAlert);
          setIsVisible(true);
          setLastAlertId(newAlert.id);
        } else {
          setIsVisible(false);
        }
      }
    }, (error) => {
      // Gracefully handle permission/network notices
    });

    return () => unsub();
  }, []);

  // Interval to check expiration
  useEffect(() => {
    const interval = setInterval(() => {
      if (isVisible && alert && alert.expiresAt > 0) {
        if (Date.now() >= alert.expiresAt) {
          setIsVisible(false);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isVisible, alert]);

  const getIconAndColors = (type: string) => {
    switch (type) {
      case 'wa-alert':
        return {
          icon: <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" />,
          bg: 'bg-emerald-950/80',
          border: 'border-emerald-500/30',
          glow: 'shadow-[0_0_40px_rgba(16,185,129,0.3)]',
          text: 'text-emerald-100',
          title: 'text-emerald-400'
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400" />,
          bg: 'bg-amber-950/80',
          border: 'border-amber-500/30',
          glow: 'shadow-[0_0_40px_rgba(245,158,11,0.3)]',
          text: 'text-amber-100',
          title: 'text-amber-400'
        };
      case 'success':
        return {
          icon: <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />,
          bg: 'bg-blue-950/80',
          border: 'border-blue-500/30',
          glow: 'shadow-[0_0_40px_rgba(59,130,246,0.3)]',
          text: 'text-blue-100',
          title: 'text-blue-400'
        };
      case 'info':
      default:
        return {
          icon: <Info className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400" />,
          bg: 'bg-indigo-950/80',
          border: 'border-indigo-500/30',
          glow: 'shadow-[0_0_40px_rgba(99,102,241,0.3)]',
          text: 'text-indigo-100',
          title: 'text-indigo-400'
        };
    }
  };

  return (
    <AnimatePresence>
      {isVisible && alert && (
        <motion.div
          initial={{ y: -100, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -100, opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="fixed top-4 sm:top-6 left-0 right-0 z-[9999] flex justify-center pointer-events-none px-4"
        >
          <div 
            className={`pointer-events-auto flex items-start sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl sm:rounded-full backdrop-blur-xl border ${getIconAndColors(alert.type).bg} ${getIconAndColors(alert.type).border} ${getIconAndColors(alert.type).glow} max-w-[90%] sm:max-w-2xl w-full sm:w-auto overflow-hidden relative`}
          >
            {/* Shimmer Effect */}
            <motion.div 
              className="absolute inset-0 w-[200%] h-full bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-[-45deg]"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }}
            />

            <div className={`p-2 rounded-xl sm:rounded-full bg-black/20 shrink-0 relative z-10`}>
              {getIconAndColors(alert.type).icon}
            </div>
            
            <div className="flex-1 min-w-0 py-0.5 relative z-10">
              <div className="flex items-center gap-2 mb-0.5 sm:mb-0">
                <span className={`font-black text-[11px] sm:text-xs uppercase tracking-widest ${getIconAndColors(alert.type).title}`}>
                  {alert.type === 'wa-alert' ? 'WhatsApp Notification' : 'System Announcement'}
                </span>
                <span className="flex h-2 w-2 relative">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${alert.type === 'wa-alert' ? 'bg-emerald-400' : 'bg-indigo-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${alert.type === 'wa-alert' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></span>
                </span>
              </div>
              <p className={`font-semibold text-sm sm:text-base leading-snug break-words ${getIconAndColors(alert.type).text}`}>
                {alert.message}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GlobalNotificationBanner;
