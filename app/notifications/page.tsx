"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { AuthUnavailable } from "@/components/auth-unavailable";
import { readJsonResponse } from "@/lib/http/client";

interface NotificationRow {
  id: string;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
}

export default function NotificationsPage() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return <AuthUnavailable />;
  return <NotificationsContent />;
}

function NotificationsContent() {
  const { authenticated, getAccessToken, login } = usePrivy();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!authenticated) return;
    (async () => {
      const token = await getAccessToken();
      const res = await fetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } });
      const data = await readJsonResponse<{
        demo?: boolean;
        message?: string;
        notifications?: NotificationRow[];
      }>(res);
      setDemoNotice(data.demo ? data.message ?? "Notifications unlock when Supabase is connected." : null);
      setNotifications(data.notifications ?? []);
    })();
  }, [authenticated, getAccessToken]);

  if (!authenticated) {
    return (
      <div className="card text-center space-y-4">
        <p>Sign in to view basket notifications.</p>
        <button className="btn" onClick={login}>Sign in</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Notifications</h1>
      {demoNotice && (
        <div className="card border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-semibold">Demo database mode</p>
          <p className="mt-1 text-sm">{demoNotice}</p>
        </div>
      )}
      <div className="space-y-3">
        {notifications.map((notification) => (
          <article key={notification.id} className="card">
            <div className="flex justify-between gap-4">
              <h2 className="font-semibold">{notification.title}</h2>
              <span className="text-xs text-zinc-500">{new Date(notification.created_at).toLocaleString()}</span>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm text-zinc-400">{notification.message}</p>
          </article>
        ))}
        {!notifications.length && <p className="text-zinc-500">No notifications yet.</p>}
      </div>
    </div>
  );
}
