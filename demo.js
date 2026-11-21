const dialog = document.querySelector('.request-dialog');
let trigger;
document.addEventListener('click', event => {
  const link = event.target.closest('a[href="request.html"]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !dialog?.showModal) return;
  event.preventDefault();
  trigger = link;
  dialog.showModal();
  document.documentElement.classList.add('request-dialog-open');
  dialog.querySelector('h2').focus({preventScroll: true});
});
dialog?.addEventListener('click', event => {
  if (event.target === dialog || event.target.closest('.request-close')) dialog.close();
});
dialog?.addEventListener('close', () => {
  document.documentElement.classList.remove('request-dialog-open');
  trigger?.focus({preventScroll: true});
});
