const form = document.querySelector('#support-form');
form.addEventListener('submit', event => {
  event.preventDefault();
  document.querySelector('#form-status').textContent = 'Practice complete. Nothing was sent.';
});
