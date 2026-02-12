import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

interface NotificationItem {
  id: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  useEffect(() => {
    if (!token) return;
    let mounted = true;

    const fetchNotifications = async () => {
      try {
        setLoading(true);
        const data = await apiRequest<{ notifications: NotificationItem[] }>('/api/notifications', {
          token,
        });
        if (mounted) setItems(data.notifications);
      } catch {
        // non-blocking UI component
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const markRead = async (notificationId: string) => {
    if (!token) return;
    setItems((prev) => prev.map((item) => (item.id === notificationId ? { ...item, read: true } : item)));
    try {
      await apiRequest(`/api/notifications/${notificationId}/read`, {
        token,
        method: 'PUT',
      });
    } catch {
      // Keep UX optimistic; refetch will reconcile.
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-gray-300 hover:bg-surface-overlay hover:text-white transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-compliance-red px-1 text-[10px] text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[80vw] rounded-lg border border-surface-border bg-surface-elevated shadow-depth-lg z-40">
          <div className="border-b border-surface-border px-4 py-3 text-sm font-medium text-white">
            Notifications
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">Loading notifications…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">No notifications.</p>
            ) : (
              <ul>
                {items.map((item) => (
                  <li key={item.id} className="border-b border-surface-border last:border-b-0">
                    <Link
                      to={item.link}
                      className={`block px-4 py-3 text-sm transition-colors ${
                        item.read
                          ? 'text-gray-400 hover:bg-surface-overlay'
                          : 'text-gray-200 bg-mactech-blue-muted/30 hover:bg-surface-overlay'
                      }`}
                      onClick={() => {
                        markRead(item.id);
                        setOpen(false);
                      }}
                    >
                      <p>{item.message}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
