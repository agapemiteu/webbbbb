const form = document.querySelector('#compose-form');
form.addEventListener('submit', event => {
  event.preventDefault();
  const field = document.querySelector('#compose-message');
  const value = field.value.trim();
  if (!value) {
    document.querySelector('#send-status').textContent = 'Write a message before sending.';
    return;
  }
  const item = document.createElement('article');
  item.className = 'message';
  const person = document.createElement('div');
  person.className = 'person ava-two';
  person.textContent = 'JL';
  const body = document.createElement('div');
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  const name = document.createElement('strong');
  name.textContent = 'Jordan Lee';
  const time = document.createElement('time');
  time.textContent = 'just now';
  meta.append(name, time);
  const message = document.createElement('p');
  message.textContent = value;
  body.append(meta, message);
  item.append(person, body);
  document.querySelector('#posted-messages').append(item);
  field.value = '';
  document.querySelector('#send-status').textContent = 'Posted in this local practice workspace.';
});
