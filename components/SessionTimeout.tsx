'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

/**
 * ✅ BUG #9 FIX: Global Session Idle Timeout
 * Tự động logout sau 30 phút không hoạt động
 */
export default function SessionTimeout() {
  const router = useRouter();
  const TIMEOUT_MS = 30 * 60 * 1000; // 30 mins

  const handleLogout = useCallback(() => {
    // Xóa session ở client side
    localStorage.removeItem('currentUser');
    localStorage.removeItem('auth-token');
    
    // Gọi API logout để xóa cookie (optional but recommended)
    fetch('/api/logout', { method: 'POST' }).catch(() => {});
    
    // Chuyển hướng về login
    router.push('/login?reason=timeout');
    router.refresh();
  }, [router]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const resetTimeout = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(handleLogout, TIMEOUT_MS);
    };

    // Theo dõi các tương tác người dùng
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    // Bắt đầu đếm ngược ngay khi mount
    resetTimeout();

    // Lắng nghe sự kiện để reset bộ đếm
    events.forEach(event => {
      document.addEventListener(event, resetTimeout);
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => {
        document.removeEventListener(event, resetTimeout);
      });
    };
  }, [handleLogout, TIMEOUT_MS]);

  return null; // Component không hiển thị gì
}
