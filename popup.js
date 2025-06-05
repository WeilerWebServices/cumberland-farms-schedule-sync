document.getElementById('login-btn').addEventListener('click', async () => {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  if (!username || !password) {
    showStatus('Please enter both username and password');
    return;
  }
  
  // Save credentials to Chrome storage
  chrome.storage.local.set({ kronosCredentials: { username, password } });
  
  // Open Kronos tab
  chrome.tabs.create({ 
    url: 'https://cumberlandfarms-sso.prd.mykronos.com/wfd/ess/myschedule',
    active: true
  });
  
  showStatus('Logging in to Kronos...');
  
  // Show MFA section
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('mfa-section').style.display = 'block';
});

document.getElementById('mfa-btn').addEventListener('click', () => {
  const mfaCode = document.getElementById('mfa-code').value;
  
  if (!mfaCode) {
    showStatus('Please enter MFA code');
    return;
  }
  
  // Send MFA code to background script
  chrome.runtime.sendMessage({ type: 'submitMFA', mfaCode });
  showStatus('Submitting MFA code...');
  
  // Show sync section
  document.getElementById('mfa-section').style.display = 'none';
  document.getElementById('sync-section').style.display = 'block';
});

document.getElementById('sync-btn').addEventListener('click', () => {
  showStatus('Starting sync process...');
  
  // Trigger schedule extraction
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ['content.js']
    });
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'syncStatus') {
    showStatus(message.text);
  }
  if (message.type === 'syncComplete') {
    showStatus('✅ Schedule synced to Google Calendar!');
  }
});

function showStatus(text) {
  document.getElementById('status').textContent = text;
}