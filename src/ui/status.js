// User feedback: screen-reader announcements, toasts, and the "Not saved" badge.

export function createStatus({ liveEl, toastEl, badgeEl }) {
  let toastTimer = null;

  function announce(message) {
    liveEl.textContent = '';
    setTimeout(() => { liveEl.textContent = message; }, 30);
  }

  function toast(message, kind = 'info') {
    toastEl.textContent = message;
    toastEl.className = kind === 'error' ? 'toast error' : 'toast';
    toastEl.hidden = false;
    announce(message);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, kind === 'error' ? 6000 : 3000);
  }

  function setSaved(ok) {
    badgeEl.hidden = ok;
  }

  return { announce, toast, setSaved };
}
