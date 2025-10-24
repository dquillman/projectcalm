import { Toaster } from 'react-hot-toast';

/**
 * Toast notification wrapper
 * Provides consistent styling for all toast notifications
 */
export function ToastContainer() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: '#1e293b', // slate-800
          color: '#f8fafc',      // slate-50
          border: '1px solid #475569', // slate-600
          borderRadius: '0.75rem',
          padding: '12px 16px',
          fontSize: '0.875rem',
        },
        success: {
          duration: 3000,
          iconTheme: {
            primary: '#10b981', // emerald-500
            secondary: '#f8fafc',
          },
        },
        error: {
          duration: 5000,
          iconTheme: {
            primary: '#ef4444', // red-500
            secondary: '#f8fafc',
          },
        },
        loading: {
          iconTheme: {
            primary: '#60a5fa', // blue-400
            secondary: '#f8fafc',
          },
        },
      }}
    />
  );
}
