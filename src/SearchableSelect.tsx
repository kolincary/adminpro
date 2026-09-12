import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, X, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type SelectColorTheme = 'purple' | 'cyan' | 'amber' | 'emerald' | 'rose' | 'blue';

interface SearchableSelectProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  onAfterSelect?: () => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  allowCustom?: boolean;
  colorTheme?: SelectColorTheme;
  hasError?: boolean;
}

export interface SearchableSelectHandle {
  focus: () => void;
}

const THEME_STYLES: Record<SelectColorTheme, {
  label: string;
  triggerBorder: string;
  triggerOpen: string;
  triggerHover: string;
  triggerFocus: string;
  dropdownBorder: string;
  dropdownShadow: string;
  searchIcon: string;
  searchClearHover: string;
  chevronOpen: string;
  chevronHover: string;
  itemSelected: string;
  itemHighlight: string;
  itemHover: string;
  itemText: string;
  activeDot: string;
  plusIcon: string;
  customOptionHighlight: string;
}> = {
  purple: {
    label: 'text-purple-300/80',
    triggerBorder: 'border-purple-900/40',
    triggerOpen: 'ring-2 ring-purple-500 border-purple-500 shadow-xl shadow-purple-950/50',
    triggerHover: 'hover:border-purple-700/50 hover:bg-[#11082d]',
    triggerFocus: 'focus:ring-2 focus:ring-purple-500/50',
    dropdownBorder: 'border-purple-800/50',
    dropdownShadow: 'shadow-purple-950/80',
    searchIcon: 'text-purple-400/60',
    searchClearHover: 'hover:bg-purple-800/40 text-purple-400',
    chevronOpen: 'rotate-180 text-purple-300',
    chevronHover: 'group-hover:text-purple-300 text-purple-400/60',
    itemSelected: 'bg-purple-600/30 text-purple-100 font-black border-purple-500',
    itemHighlight: 'bg-purple-900/40 text-white border-purple-500/40',
    itemHover: 'hover:bg-purple-950/25 text-purple-300/70 hover:text-white border-transparent',
    itemText: 'text-purple-300/70',
    activeDot: 'bg-purple-400 shadow-purple-400',
    plusIcon: 'text-purple-400',
    customOptionHighlight: 'bg-purple-600/25 border-purple-500'
  },
  cyan: {
    label: 'text-cyan-300/80',
    triggerBorder: 'border-cyan-900/40',
    triggerOpen: 'ring-2 ring-cyan-500 border-cyan-500 shadow-xl shadow-cyan-950/50',
    triggerHover: 'hover:border-cyan-700/50 hover:bg-[#07192a]',
    triggerFocus: 'focus:ring-2 focus:ring-cyan-500/50',
    dropdownBorder: 'border-cyan-800/50',
    dropdownShadow: 'shadow-cyan-950/80',
    searchIcon: 'text-cyan-400/60',
    searchClearHover: 'hover:bg-cyan-800/40 text-cyan-400',
    chevronOpen: 'rotate-180 text-cyan-300',
    chevronHover: 'group-hover:text-cyan-300 text-cyan-400/60',
    itemSelected: 'bg-cyan-600/30 text-cyan-100 font-black border-cyan-400',
    itemHighlight: 'bg-cyan-900/40 text-white border-cyan-500/40',
    itemHover: 'hover:bg-cyan-950/25 text-cyan-300/70 hover:text-white border-transparent',
    itemText: 'text-cyan-300/70',
    activeDot: 'bg-cyan-400 shadow-cyan-400',
    plusIcon: 'text-cyan-400',
    customOptionHighlight: 'bg-cyan-600/25 border-cyan-400'
  },
  amber: {
    label: 'text-amber-300/80',
    triggerBorder: 'border-amber-900/40',
    triggerOpen: 'ring-2 ring-amber-500 border-amber-500 shadow-xl shadow-amber-950/50',
    triggerHover: 'hover:border-amber-700/50 hover:bg-[#1a1208]',
    triggerFocus: 'focus:ring-2 focus:ring-amber-500/50',
    dropdownBorder: 'border-amber-800/50',
    dropdownShadow: 'shadow-amber-950/80',
    searchIcon: 'text-amber-400/60',
    searchClearHover: 'hover:bg-amber-800/40 text-amber-400',
    chevronOpen: 'rotate-180 text-amber-300',
    chevronHover: 'group-hover:text-amber-300 text-amber-400/60',
    itemSelected: 'bg-amber-600/30 text-amber-100 font-black border-amber-400',
    itemHighlight: 'bg-amber-900/40 text-white border-amber-500/40',
    itemHover: 'hover:bg-amber-950/25 text-amber-300/70 hover:text-white border-transparent',
    itemText: 'text-amber-300/70',
    activeDot: 'bg-amber-400 shadow-amber-400',
    plusIcon: 'text-amber-400',
    customOptionHighlight: 'bg-amber-600/25 border-amber-400'
  },
  emerald: {
    label: 'text-emerald-300/80',
    triggerBorder: 'border-emerald-900/40',
    triggerOpen: 'ring-2 ring-emerald-500 border-emerald-500 shadow-xl shadow-emerald-950/50',
    triggerHover: 'hover:border-emerald-700/50 hover:bg-[#061e16]',
    triggerFocus: 'focus:ring-2 focus:ring-emerald-500/50',
    dropdownBorder: 'border-emerald-800/50',
    dropdownShadow: 'shadow-emerald-950/80',
    searchIcon: 'text-emerald-400/60',
    searchClearHover: 'hover:bg-emerald-800/40 text-emerald-400',
    chevronOpen: 'rotate-180 text-emerald-300',
    chevronHover: 'group-hover:text-emerald-300 text-emerald-400/60',
    itemSelected: 'bg-emerald-600/30 text-emerald-100 font-black border-emerald-400',
    itemHighlight: 'bg-emerald-900/40 text-white border-emerald-500/40',
    itemHover: 'hover:bg-emerald-950/25 text-emerald-300/70 hover:text-white border-transparent',
    itemText: 'text-emerald-300/70',
    activeDot: 'bg-emerald-400 shadow-emerald-400',
    plusIcon: 'text-emerald-400',
    customOptionHighlight: 'bg-emerald-600/25 border-emerald-400'
  },
  rose: {
    label: 'text-rose-300/80',
    triggerBorder: 'border-rose-900/40',
    triggerOpen: 'ring-2 ring-rose-500 border-rose-500 shadow-xl shadow-rose-950/50',
    triggerHover: 'hover:border-rose-700/50 hover:bg-[#200812]',
    triggerFocus: 'focus:ring-2 focus:ring-rose-500/50',
    dropdownBorder: 'border-rose-800/50',
    dropdownShadow: 'shadow-rose-950/80',
    searchIcon: 'text-rose-400/60',
    searchClearHover: 'hover:bg-rose-800/40 text-rose-400',
    chevronOpen: 'rotate-180 text-rose-300',
    chevronHover: 'group-hover:text-rose-300 text-rose-400/60',
    itemSelected: 'bg-rose-600/30 text-rose-100 font-black border-rose-400',
    itemHighlight: 'bg-rose-900/40 text-white border-rose-500/40',
    itemHover: 'hover:bg-rose-950/25 text-rose-300/70 hover:text-white border-transparent',
    itemText: 'text-rose-300/70',
    activeDot: 'bg-rose-400 shadow-rose-400',
    plusIcon: 'text-rose-400',
    customOptionHighlight: 'bg-rose-600/25 border-rose-400'
  },
  blue: {
    label: 'text-blue-300/80',
    triggerBorder: 'border-blue-900/40',
    triggerOpen: 'ring-2 ring-blue-500 border-blue-500 shadow-xl shadow-blue-950/50',
    triggerHover: 'hover:border-blue-700/50 hover:bg-[#07142a]',
    triggerFocus: 'focus:ring-2 focus:ring-blue-500/50',
    dropdownBorder: 'border-blue-800/50',
    dropdownShadow: 'shadow-blue-950/80',
    searchIcon: 'text-blue-400/60',
    searchClearHover: 'hover:bg-blue-800/40 text-blue-400',
    chevronOpen: 'rotate-180 text-blue-300',
    chevronHover: 'group-hover:text-blue-300 text-blue-400/60',
    itemSelected: 'bg-blue-600/30 text-blue-100 font-black border-blue-400',
    itemHighlight: 'bg-blue-900/40 text-white border-blue-500/40',
    itemHover: 'hover:bg-blue-950/25 text-blue-300/70 hover:text-white border-transparent',
    itemText: 'text-blue-300/70',
    activeDot: 'bg-blue-400 shadow-blue-400',
    plusIcon: 'text-blue-400',
    customOptionHighlight: 'bg-blue-600/25 border-blue-400'
  }
};

const SearchableSelect = forwardRef<SearchableSelectHandle, SearchableSelectProps>(({
  options,
  value,
  onChange,
  onAfterSelect,
  placeholder = "Pilih...",
  label,
  required = false,
  allowCustom = false,
  colorTheme = 'purple',
  hasError = false
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const [openUp, setOpenUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const theme = THEME_STYLES[colorTheme] || THEME_STYLES.purple;

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
          setIsOpen(false);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(0);
        break;
    }
  };

  // When dropdown opens or search changes: Auto-scroll to selected option if available!
  useEffect(() => {
    if (isOpen) {
      if (value && !searchTerm) {
        const foundIdx = filteredOptions.findIndex(opt => opt === value);
        if (foundIdx >= 0) {
          setHighlightedIndex(foundIdx);
          const t = setTimeout(() => {
            if (listRef.current && listRef.current.children[foundIdx]) {
              (listRef.current.children[foundIdx] as HTMLElement).scrollIntoView({ block: 'nearest' });
            }
          }, 40);
          return () => clearTimeout(t);
        }
      }
      setHighlightedIndex(0);
    }
  }, [isOpen, searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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
    if (highlightedIndex >= 0 && listRef.current && isOpen) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  return (
    <div className="space-y-2 relative" ref={containerRef}>
      {label && (
        <label className={`text-[10px] font-black uppercase tracking-widest px-1 ${hasError ? 'text-rose-400' : theme.label}`}>
          {label} {required && <span className="text-rose-400">*</span>}
        </label>
      )}

      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className={`w-full px-4 py-3 bg-[#0c0620]/90 rounded-xl flex items-center justify-between cursor-pointer transition-all outline-none group border ${
          hasError
            ? 'ring-2 ring-rose-500 border-rose-500 bg-rose-950/20 shadow-lg shadow-rose-950/50'
            : isOpen 
            ? theme.triggerOpen 
            : `${theme.triggerBorder} ${theme.triggerHover} ${theme.triggerFocus}`
        }`}
      >
        <span className={`truncate text-sm font-bold tracking-wide ${!value ? 'text-purple-300/40 group-hover:text-purple-300/60' : 'text-white'}`}>
          {value || placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isOpen ? theme.chevronOpen : theme.chevronHover}`} />
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
              className={`w-full ${openUp ? 'mb-2' : 'mt-2'} bg-[#130b2e]/98 backdrop-blur-2xl border ${theme.dropdownBorder} rounded-2xl shadow-2xl ${theme.dropdownShadow} overflow-hidden`}
            >
              <div className="p-3 border-b border-purple-900/40 flex items-center gap-2.5 bg-[#0c0620]/90">
                <Search className={`w-4 h-4 ${theme.searchIcon}`} />
                <input
                  autoFocus
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
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
                    className={`p-1 rounded-lg transition-colors ${theme.searchClearHover}`}
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
                          ? theme.itemSelected 
                          : highlightedIndex === index 
                          ? theme.itemHighlight 
                          : theme.itemHover
                      }`}
                    >
                      <span className="truncate tracking-wide font-medium">{option}</span>
                      {value === option && <div className={`w-1.5 h-1.5 rounded-full shadow-lg ${theme.activeDot}`} />}
                    </div>
                  ))
                ) : allowCustom && searchTerm ? (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(searchTerm);
                    }}
                    onMouseEnter={() => setHighlightedIndex(0)}
                    className={`px-4 py-3 text-xs cursor-pointer transition-colors font-bold flex items-center gap-2 border-l-4 ${
                      highlightedIndex === 0 ? theme.customOptionHighlight : 'hover:bg-purple-900/20 border-transparent'
                    }`}
                  >
                    <Plus className={`w-4 h-4 ${theme.plusIcon}`} />
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
