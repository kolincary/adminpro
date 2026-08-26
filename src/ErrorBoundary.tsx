import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#020617] p-8 relative overflow-hidden font-sans">
          {/* Background elements */}
          <div className="absolute top-0 left-0 w-full h-full bg-slate-950/20 backdrop-blur-3xl z-0" />
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-600/10 blur-[120px] rounded-full animate-pulse delay-700" />

          <div className="max-w-md w-full glass-card rounded-[48px] border-white/5 p-12 text-center shadow-3xl relative z-10 transition-all">
            <div className="w-24 h-24 bg-rose-500/10 rounded-[32px] flex items-center justify-center mx-auto mb-8 border border-rose-500/20 shadow-2xl shadow-rose-900/10 group hover:rotate-6 transition-transform">
              <svg className="w-12 h-12 text-rose-500 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-3xl font-black text-white mb-4 tracking-tight uppercase">Gangguan Sistem</h1>
            <p className="text-slate-400 mb-10 font-medium leading-relaxed">
              Kesalahan kritis terdeteksi selama runtime. Protokol memerlukan penyegaran sistem manual untuk memulihkan integritas.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="glow-btn w-full py-5 px-8 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-2xl shadow-indigo-900/40 text-xs uppercase tracking-[0.2em]"
            >
              MULAI PEMULIHAN
            </button>
            {this.state.error && (
              <details className="mt-10 text-left group">
                <summary className="text-[10px] font-black text-slate-600 cursor-pointer hover:text-slate-400 transition-colors uppercase tracking-[0.2em] outline-none">Dashboard Diagnostik</summary>
                <div className="mt-4 p-5 bg-[#080c18] rounded-2xl border border-white/5 text-[11px] text-slate-500 overflow-auto max-h-40 font-mono leading-relaxed custom-scrollbar shadow-inner">
                  {this.state.error.message}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
