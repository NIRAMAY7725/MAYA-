// ============================================
// js/dashboard.js — Task Dashboard Logic
// ============================================
// WHY THIS FILE?
// Optional enhancement file for the task dashboard.
// Currently, task logic lives in assistant.js.
// This file can be expanded later for:
//   - Task filtering and sorting UI
//   - Drag-and-drop reordering
//   - Calendar view
//   - Statistics and charts
//
// For now, it exports a few utilities.
// ============================================

const dashboard = (() => {
  // Format a date for display
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date - now;

    // If due within 24 hours, show relative time
    if (diff > 0 && diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return hours > 0 ? `In ${hours}h` : 'Due soon!';
    }

    // If overdue
    if (diff < 0) {
      return 'Overdue!';
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }

  // Get task statistics
  function getStats(tasks) {
    return {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      inProgress: tasks.filter((t) => t.status === 'in-progress').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      highPriority: tasks.filter((t) => t.priority === 'high' && t.status !== 'completed').length,
    };
  }

  return {
    formatDate,
    getStats,
  };
})();

