const scenario = new URLSearchParams(location.search).get('scenario') || 'acme';
const lessons = {
  acme: {
    title: 'Deploy your first application.', category: 'PROJECT SETUP', target: '/demo/?reset', targetLabel: 'Open Acme Cloud',
    description: 'This walkthrough uses the older name “Integrations” for the Connections page. Skip the workspace step if you already have one.',
    note: 'Play one step, let Webb act, then advance. Say “I already did that” at the workspace step, change the requested name, and wait before deploying.',
    clips: [
      { title: 'A little context', transcript: 'The dashboard has several project areas. You can review deployments from the settings page.' },
      { title: 'Open settings', transcript: 'First, open your project settings.' },
      { title: 'Find integrations', transcript: 'Now open Integrations.' },
      { title: 'Create a workspace', transcript: 'Create a new workspace for this project.' },
      { title: 'Name the workspace', transcript: 'Call it Demo Production.' },
      { title: 'Deploy', transcript: 'Now deploy the project to production.' },
    ],
  },
  form: {
    title: 'Prepare a support request.', category: 'FORM PRACTICE', target: '/demo/form.html', targetLabel: 'Open the request form',
    description: 'Webb can prepare labelled fields from speech. The request only submits after you approve the action.',
    note: 'Start FOLLOW, play one step, then interrupt with a correction. Check the visible fields before saying “go ahead” to Send request.',
    clips: [
      { title: 'Set the scene', transcript: 'Support requests are reviewed during business hours. Add a concise project name and explain what your team needs.' },
      { title: 'Name the project', transcript: 'Enter Webb Demo in the Project name field.' },
      { title: 'Explain the request', transcript: 'In the message field, ask to add one engineer to the onboarding workspace before Monday.' },
      { title: 'Send the request', transcript: 'Now send the support request.' },
    ],
  },
  lecture: {
    title: 'Follow a software lesson.', category: 'LECTURE PRACTICE', target: '/demo/?reset', targetLabel: 'Open Acme Cloud',
    description: 'Listen for the difference between a lecturer explaining options and giving a step to carry out.',
    note: 'The first two clips are context and alternatives. Webb should wait until the lecturer gives the explicit instruction.',
    clips: [
      { title: 'Background', transcript: 'Integrations connect a project to services such as GitHub. Different products organize these settings in different places.' },
      { title: 'An alternative', transcript: 'Some teams prefer to open the project menu first. Either route is fine, depending on the interface.' },
      { title: 'Open settings', transcript: 'In this workspace, open Settings.' },
      { title: 'Choose integrations', transcript: 'Next, choose Integrations.' },
    ],
  },
  teams: {
    title: 'Share an update with your team.', category: 'TEAM CHANNEL PRACTICE', target: '/demo/teams.html', targetLabel: 'Open the launch channel',
    description: 'Prepare a channel update and check it before posting. This is a local practice workspace. Nothing reaches Microsoft Teams.',
    note: 'Webb should fill the composer, pause for your review, and require your direct approval before Send message.',
    clips: [
      { title: 'Context', transcript: 'The launch planning channel is where the team coordinates release readiness. QA will review the final build.' },
      { title: 'Draft an update', transcript: 'Write in the message box that the release is ready for review by QA.' },
      { title: 'Post the update', transcript: 'Now send the message to the channel.' },
    ],
  },
};
const lesson = lessons[scenario] || lessons.acme;
document.querySelector('#lesson-title').textContent = lesson.title;
document.querySelector('#lesson-category').textContent = lesson.category;
document.querySelector('#lesson-description').textContent = lesson.description;
document.querySelector('#lesson-note').textContent = lesson.note;
document.querySelector('#target-link').href = lesson.target;
document.querySelector('#target-link').textContent = `${lesson.targetLabel} ↗`;
document.title = `Webb Practice | ${lesson.title}`;
const clips = lesson.clips;
let index = 0;
const list = document.querySelector('#lesson-list');
list.innerHTML = clips.map((clip, number) => `<li><button type="button" data-index="${number}"><span class="step-number">${String(number + 1).padStart(2, '0')}</span><span>${clip.title}</span></button></li>`).join('');
function selectClip(nextIndex) {
  index = Math.max(0, Math.min(clips.length - 1, nextIndex));
  speechSynthesis.cancel();
  document.querySelector('#speak-clip').textContent = 'Play spoken step';
  document.querySelector('#clip-title').textContent = clips[index].title;
  document.querySelector('#clip-count').textContent = `${index + 1} of ${clips.length}`;
  document.querySelector('#clip-transcript').textContent = clips[index].transcript;
  document.querySelector('#previous-clip').disabled = index === 0;
  document.querySelector('#next-clip').disabled = index === clips.length - 1;
  list.querySelectorAll('button').forEach((button, number) => {
    if (number === index) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
  });
}
document.querySelector('#previous-clip').addEventListener('click', () => selectClip(index - 1));
document.querySelector('#next-clip').addEventListener('click', () => selectClip(index + 1));
document.querySelector('#speak-clip').addEventListener('click', event => {
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
    event.currentTarget.textContent = 'Play spoken step';
    return;
  }
  const speech = new SpeechSynthesisUtterance(clips[index].transcript);
  speech.rate = 0.88;
  speech.onend = speech.onerror = () => { event.currentTarget.textContent = 'Play spoken step'; };
  speechSynthesis.speak(speech);
  event.currentTarget.textContent = 'Stop spoken step';
});
list.addEventListener('click', event => { const button = event.target.closest('button[data-index]'); if (button) selectClip(Number(button.dataset.index)); });
selectClip(0);
