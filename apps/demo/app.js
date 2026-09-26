const STORAGE_KEY = 'webb-acme-demo-v1';
const initialState = { workspaceName: 'Starter Workspace', connected: true, deployed: false, deploymentTime: null };
if (new URLSearchParams(location.search).has('reset')) {
  localStorage.removeItem(STORAGE_KEY);
  history.replaceState(null, '', location.pathname + location.hash);
}
let state;
try { state = { ...initialState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
catch { state = { ...initialState }; }

const page = document.querySelector('#page');
const announcement = document.querySelector('#announcement');
const breadcrumb = document.querySelector('#breadcrumb-page');
const allowedRoutes = new Set(['overview', 'projects', 'settings', 'connections', 'environment', 'deployments']);

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function say(message) { announcement.textContent = message; }
function safeText(text) { return String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
function currentRoute() { const route = location.hash.slice(1).toLowerCase(); return allowedRoutes.has(route) ? route : 'overview'; }
function header(kicker, title, description, action = '') { return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="subheading">${description}</p></div>${action}</div>`; }
function card(title, body, extra = '') { return `<section class="card"><div class="card-heading"><div><h2>${title}</h2><p>${body}</p></div>${extra}</div></section>`; }
function settingNav(active) { return `<nav class="section-tabs" aria-label="Settings sections"><a href="#settings" ${active === 'settings' ? 'aria-current="page"' : ''}>General</a><a href="#connections" ${active === 'connections' ? 'aria-current="page"' : ''}>Connections</a><a href="#environment" ${active === 'environment' ? 'aria-current="page"' : ''}>Environment</a></nav>`; }
function workspaceCard() { return `<section class="card"><div class="card-heading"><div><h2>Workspace details</h2><p>Manage the name shown across your projects.</p></div><span class="badge blue">Active</span></div><div class="field-block"><label for="workspace-name">Workspace name</label><input id="workspace-name" name="workspaceName" type="text" autocomplete="off" maxlength="80" value="${safeText(state.workspaceName)}" /><p class="field-help">Changes are saved automatically.</p></div></section>`; }
function deploymentCard() { return `<section class="card"><div class="card-heading"><div><h2>Production deployment</h2><p>Publish the current version of the web app.</p></div><span class="badge ${state.deployed ? 'green' : 'neutral'}">${state.deployed ? 'Live' : 'Ready'}</span></div><div class="deployment-row"><div><strong>${state.deployed ? 'Production is live' : 'Ready to deploy'}</strong><p>${state.deployed ? `Deployed ${safeText(state.deploymentTime || 'just now')}` : 'Your project is ready for its first production deployment.'}</p></div><button type="button" class="primary-button" id="deploy-button" ${state.deployed ? 'disabled' : ''}>${state.deployed ? 'Deployed' : 'Deploy production'}</button></div></section>`; }

function render() {
  const route = currentRoute();
  const names = { overview: 'Overview', projects: 'Projects', settings: 'Settings', connections: 'Connections', environment: 'Environment', deployments: 'Deployments' };
  document.title = `Acme Cloud | ${names[route]}`;
  breadcrumb.textContent = names[route];
  document.querySelectorAll('[data-route]').forEach(link => {
    const selected = link.dataset.route === route || (link.dataset.route === 'settings' && ['connections', 'environment'].includes(route));
    if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });

  if (route === 'overview') {
    page.innerHTML = `${header('PROJECT OVERVIEW', 'Good afternoon, Demo', 'Here is what is happening in your workspace.', '<a class="secondary-button" href="#projects">View projects</a>')}<div class="metric-grid"><section class="metric-card"><span>Projects</span><strong>1</strong><small>One active project</small></section><section class="metric-card"><span>Connections</span><strong>1</strong><small>GitHub connected</small></section><section class="metric-card"><span>Deployments</span><strong>${state.deployed ? '1' : '0'}</strong><small>${state.deployed ? 'Production is live' : 'Ready when you are'}</small></section></div><section class="card project-card"><div class="project-icon">W</div><div><h2>webb-demo</h2><p>Next.js project · Updated today</p></div><a href="#settings" class="text-link">Project settings <span aria-hidden="true">→</span></a></section>`;
  } else if (route === 'projects') {
    page.innerHTML = `${header('WORKSPACE', 'Projects', 'Manage applications in your workspace.')}<section class="card project-card"><div class="project-icon">W</div><div><h2>webb-demo</h2><p>Next.js project · Production branch: main</p></div><a href="#settings" class="text-link">Open settings <span aria-hidden="true">→</span></a></section>`;
  } else if (route === 'settings') {
    page.innerHTML = `${header('WEBB-DEMO / SETTINGS', 'Settings', 'Configure your project and workspace.')}${settingNav(route)}${workspaceCard()}${card('Project identifier', 'Used to identify this project in Acme Cloud.', '<span class="mono">webb-demo</span>')}`;
  } else if (route === 'connections') {
    page.innerHTML = `${header('WEBB-DEMO / SETTINGS', 'Connections', 'Manage the services connected to this project.')}${settingNav(route)}<section class="card"><div class="card-heading"><div><h2>Connected services</h2><p>Services this project can use.</p></div><span class="badge green">1 connected</span></div><div class="connection-row"><div class="github-icon" aria-hidden="true">GH</div><div><strong>GitHub</strong><p>Repository access for webb-demo</p></div><span class="connected-label"><span class="status-dot"></span> Connected</span></div></section><div class="inline-note"><strong>Existing workspace found.</strong><p>You can continue with your current workspace or change its name in General settings.</p><a href="#settings">Open General settings <span aria-hidden="true">→</span></a></div>`;
  } else if (route === 'environment') {
    page.innerHTML = `${header('WEBB-DEMO / SETTINGS', 'Environment', 'Configure values used by your project.')}${settingNav(route)}${card('Environment variables', 'No environment variables have been added yet.', '<span class="badge neutral">0 variables</span>')}`;
  } else {
    page.innerHTML = `${header('WEBB-DEMO', 'Deployments', 'Track and publish your project.')}${deploymentCard()}<section class="card"><div class="card-heading"><div><h2>Recent activity</h2><p>${state.deployed ? 'Your latest production deployment completed successfully.' : 'No deployments yet. Your first deployment will appear here.'}</p></div></div></section>`;
  }
}

window.addEventListener('hashchange', render);
page.addEventListener('input', event => {
  if (event.target?.id !== 'workspace-name') return;
  state.workspaceName = event.target.value;
  save();
  say(`Workspace name changed to ${state.workspaceName}`);
});
page.addEventListener('click', event => {
  if (event.target?.id !== 'deploy-button' || state.deployed) return;
  state.deployed = true;
  state.deploymentTime = new Date().toLocaleString();
  save();
  render();
  say('Production deployment completed.');
});

render();
