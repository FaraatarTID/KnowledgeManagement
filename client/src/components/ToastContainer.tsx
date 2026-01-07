import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, Loader2 } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'loading';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onClose: (id: string) => void;
}

const ToastComponent: React.FC<ToastProps> = ({ toast, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onClose(toast.id), 300); // Wait for animation
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, toast.id, onClose]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-600" />;
      case 'loading':
        return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
      default:
        return <Info className="w-5 h-5 text-gray-600" />;
    }
  };

  const getColors = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'loading':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  return (
    <div
      className={`transform transition-all duration-300 ease-out ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${getColors()}`}>
        <div className="flex-shrink-0">{getIcon()}</div>
        <div className="flex-1 text-sm font-medium">{toast.message}</div>
        {toast.type !== 'loading' && (
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(() => onClose(toast.id), 300);
            }}
            className="flex-shrink-0 hover:opacity-70 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Toast notification manager
 * Provides global toast notifications without external dependencies
 */
export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    // Listen for custom toast events
    const handleToast = (event: CustomEvent<Toast>) => {
      setToasts(prev => [...prev, event.detail]);
    };

    window.addEventListener('toast' as any, handleToast as EventListener);
    
    return () => {
      window.removeEventListener('toast' as any, handleToast as EventListener);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map(toast => (
        <ToastComponent key={toast.id} toast={toast} onClose={removeToast} />
      ))}
    </div>
  );
};

// Toast API functions
const generateId = () => Math.random().toString(36).substr(2, 9);

export const toast = {
  show: (message: string, type: ToastType = 'info', duration: number = 3000) => {
    const toastEvent = new CustomEvent('toast', {
      detail: {
        id: generateId(),
        message,
        type,
        duration
      }
    });
    window.dispatchEvent(toastEvent);
  },

  success: (message: string, duration?: number) => {
    toast.show(message, 'success', duration);
  },

  error: (message: string, duration?: number) => {
    toast.show(message, 'error', duration || 5000);
  },

  info: (message: string, duration?: number) => {
    toast.show(message, 'info', duration);
  },

  loading: (message: string) => {
    return toast.show(message, 'loading', 0); // No auto-close for loading
  },

  dismiss: (id: string) => {
    // This would need to be implemented if we want manual dismissal
  }
};