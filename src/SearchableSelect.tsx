import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, X, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SearchableSelectProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  onAfterSelect?: () => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  allowCustom?: boolean;
}

export interface SearchableSelectHandle {
  focus: () => void;
}

const SearchableSelect = forwardRef<SearchableSelectHandle, SearchableSelectProps>(({
  options,
  value,
  onChange,
  onAfterSelect,
  placeholder = "Pilih...",
  label,
  required = false,
  allowCustom = false
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const [openUp, setOpenUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      triggerRef.current?.focus();
    }
  }));

  const filteredOptions = options.filter(option =>
    (option?.toLowerCase() || '').includes(searchTerm?.toLowerCase() || '')
  );

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(0);
    if (onAfterSelect) {
      onAfterSelect();
    }
  };

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownRect(rect);
      
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownHeight = 350;

      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        setOpenUp(true);
      } else {
        setOpenUp(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    const maxIndex = filteredOptions.length - 1;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => (prev >= maxIndex ? 0 : prev + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev <= 0 ? maxIndex : prev - 1));
        break;
      case 'Tab':
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex <= maxIndex) {
          handleSelect(filteredOptions[highlightedIndex]);
        } else if (allowCustom && searchTerm) {
          handleSelect(searchTerm);
        } else if (e.key === 'Tab') {
          // If Tab is pressed but no selection, just close and let default tab behavior happen
          setIsOpen(false);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(0);
        break;
    }
  };

  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(0);
    }
  }, [searchTerm, isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        // Check if click is inside portal
        const portalContent = document.getElementById('searchable-select-portal');
        if (portalContent && portalContent.contains(event.target as Node)) {
          return;
        }
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  return (
    <div className="space-y-2 relative" ref={containerRef}>
      {label && (
        <label className="text-[10px] font-black text-purple-300/80 uppercase tracking-widest px-1">
          {label} {required && <span className="text-rose-400">*</span>}
        </label>
      )}

      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className={`w-full px-4 py-3 bg-[#0c0620]/90 border border-purple-900/40 rounded-xl flex items-center justify-between cursor-pointer transition-all outline-none group ${
          isOpen 
            ? 'ring-2 ring-purple-500 border-purple-500 shadow-xl shadow-purple-950/50' 
            : 'hover:border-purple-700/50 hover:bg-[#11082d] focus:ring-2 focus:ring-purple-500/50'
        }`}
      >
        <span className={`truncate text-sm font-bold tracking-wide ${!value ? 'text-purple-300/40 group-hover:text-purple-300/60' : 'text-white'}`}>
          {value || placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-purple-400/60 transition-transform duration-300 ${isOpen ? 'rotate-180 text-purple-300' : 'group-hover:text-purple-300'}`} />
      </div>

      {isOpen && dropdownRect && createPortal(
        <div 
          id="searchable-select-portal"
          style={{
            position: 'fixed',
            top: openUp ? dropdownRect.top : dropdownRect.bottom,
            left: dropdownRect.left,
            width: dropdownRect.width,
            zIndex: 9999,
            pointerEvents: 'auto'
          }}
          className={openUp ? '-translate-y-full' : ''}
        >
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, y: openUp ? 10 : -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: openUp ? 10 : -10, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className={`w-full ${openUp ? 'mb-2' : 'mt-2'} bg-[#130b2e]/98 backdrop-blur-2xl border border-purple-800/50 rounded-2xl shadow-2xl shadow-purple-950/80 overflow-hidden`}
            >
              <div className="p-3 border-b border-purple-900/40 flex items-center gap-2.5 bg-[#0c0620]/90">
                <Search className="w-4 h-4 text-purple-400/60" />
                <input
                  autoFocus
                  type="text"
                  className="w-full bg-transparent border-none outline-none text-xs text-purple-100 placeholder:text-purple-400/40 font-bold"
                  placeholder="Cari pilihan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                />
                {searchTerm && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSearchTerm('');
                    }}
                    className="p-1 hover:bg-purple-800/40 rounded-lg text-purple-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="max-h-60 overflow-y-auto custom-scrollbar py-1.5" ref={listRef}>
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option, index) => (
                    <div
                      key={index}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(option);
                      }}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`px-4 py-2.5 text-xs cursor-pointer transition-all flex items-center justify-between border-l-4 ${
                        value === option 
                          ? 'bg-purple-600/25 text-purple-200 font-black border-purple-500' 
                          : highlightedIndex === index 
                          ? 'bg-purple-900/30 text-white border-purple-500/40' 
                          : 'text-purple-300/70 hover:text-white border-transparent hover:bg-purple-950/20'
                      }`}
                    >
                      <span className="truncate tracking-wide font-medium">{option}</span>
                      {value === option && <div className="w-1.5 h-1.5 bg-purple-400 rounded-full shadow-lg shadow-purple-400" />}
                    </div>
                  ))
                ) : allowCustom && searchTerm ? (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(searchTerm);
                    }}
                    onMouseEnter={() => setHighlightedIndex(0)}
                    className={`px-4 py-3 text-xs text-purple-300 cursor-pointer transition-colors font-bold flex items-center gap-2 border-l-4 ${
                      highlightedIndex === 0 ? 'bg-purple-600/20 border-purple-500' : 'hover:bg-purple-900/20 border-transparent'
                    }`}
                  >
                    <Plus className="w-4 h-4 text-purple-400" />
                    <span className="uppercase tracking-wider text-[11px]">Tambah Baru: "{searchTerm}"</span>
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <span className="text-purple-300/40 text-[10px] font-black uppercase tracking-widest">Tidak ada data ditemukan</span>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>,
        document.body
      )}
    </div>
  );
});

export default SearchableSelect;
