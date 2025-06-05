# Chrome Extension

Create a Chrome Extension that integrates with Google Calendar. This solution will use Chrome's built-in APIs for authentication and calendar access, eliminating the need for Python and Selenium.

---

### Project Structure for Chrome Extension:
`Project-Structure.txt`

```
cumberland-schedule-sync-extension/
├── manifest.json
├── background.js
├── popup.html
├── popup.js
├── content.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

### 1. Core extension configuration
`manifest.json`
```json
{
  "manifest_version": 3,
  "name": "Cumberland Schedule Sync",
  "version": "1.0",
  "description": "Sync your Cumberland Farms schedule to Google Calendar",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "permissions": [
    "identity",
    "scripting",
    "storage",
    "https://cumberlandfarms-sso.prd.mykronos.com/*"
  ],
  "host_permissions": [
    "https://www.googleapis.com/*"
  ],
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/calendar"
    ]
  },
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html"
  }
}
```

---

### 2. User interface
`popup.html`
```html
<!DOCTYPE html>
<html>
<head>
  <title>Cumberland Schedule Sync</title>
  <style>
    body { width: 300px; padding: 15px; font-family: Arial, sans-serif; }
    input, button { width: 100%; padding: 8px; margin: 5px 0; }
    #status { margin-top: 10px; color: #555; }
  </style>
</head>
<body>
  <h2>Cumberland Schedule Sync</h2>
  
  <div id="login-section">
    <label for="username">Kronos Username:</label>
    <input type="text" id="username" placeholder="Your username">
    
    <label for="password">Kronos Password:</label>
    <input type="password" id="password" placeholder="Your password">
    
    <button id="login-btn">Login to Kronos</button>
  </div>
  
  <div id="mfa-section" style="display:none;">
    <label for="mfa-code">Enter MFA Code:</label>
    <input type="text" id="mfa-code" placeholder="From SMS">
    <button id="mfa-btn">Submit MFA</button>
  </div>
  
  <div id="sync-section" style="display:none;">
    <button id="sync-btn">Sync to Google Calendar</button>
  </div>
  
  <div id="status"></div>
  
  <script src="popup.js"></script>
</body>
</html>
```

---

### 3. Popup logic
`popup.js`
```javascript
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
```

---

### 4. Extract schedule from Kronos page
`content.js`
```javascript
function extractSchedule() {
  const schedule = [];
  
  // Wait for schedule table to load
  const checkTable = setInterval(() => {
    const table = document.querySelector('.schedule-table');
    if (table) {
      clearInterval(checkTable);
      
      // Process schedule rows
      const rows = table.querySelectorAll('tbody tr');
      rows.forEach(row => {
        try {
          const dateCell = row.querySelector('td.date-column');
          const shiftCell = row.querySelector('td.shift-column');
          
          if (!dateCell || !shiftCell) return;
          
          const dateStr = dateCell.textContent.trim();
          const shiftStr = shiftCell.textContent.trim();
          
          if (!shiftStr || shiftStr.includes('Off')) return;
          
          const [startTime, endTime] = shiftStr.split(' - ');
          
          schedule.push({
            date: dateStr,
            start: startTime,
            end: endTime
          });
        } catch (e) {
          console.error('Error parsing row:', e);
        }
      });
      
      // Send schedule to background script
      chrome.runtime.sendMessage({ 
        type: 'scheduleData', 
        schedule 
      });
    }
  }, 1000);
}

// Start extraction when injected
extractSchedule();
```

---

### 5. Core extension logic
`background.js`
```javascript
let kronosCredentials = null;
let googleAccessToken = null;

// Load saved credentials
chrome.storage.local.get('kronosCredentials', (data) => {
  if (data.kronosCredentials) {
    kronosCredentials = data.kronosCredentials;
  }
});

// Handle Kronos login
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'submitMFA') {
    handleMFA(message.mfaCode);
  }
  else if (message.type === 'scheduleData') {
    processSchedule(message.schedule);
  }
});

function handleMFA(mfaCode) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (code) => {
        document.getElementById('mfaCode').value = code;
        document.getElementById('verify-mfa-button').click();
      },
      args: [mfaCode]
    });
  });
}

async function processSchedule(schedule) {
  if (!schedule.length) {
    updateStatus('⚠️ No shifts found in schedule');
    return;
  }
  
  updateStatus(`📅 Processing ${schedule.length} shifts...`);
  
  try {
    // Authenticate with Google
    googleAccessToken = await getGoogleAuthToken();
    
    // Create calendar events
    for (const shift of schedule) {
      await createCalendarEvent(shift);
      updateStatus(`✅ Added: ${shift.date} ${shift.start}-${shift.end}`);
    }
    
    updateStatus('🎉 Schedule synced to Google Calendar!');
  } catch (error) {
    updateStatus(`❌ Error: ${error.message}`);
  }
}

function getGoogleAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

async function createCalendarEvent(shift) {
  // Parse shift date/time
  const shiftDate = parseDate(shift.date);
  const startDateTime = combineDateTime(shiftDate, shift.start);
  const endDateTime = combineDateTime(shiftDate, shift.end);
  
  // Create event payload
  const event = {
    summary: 'Work Shift',
    location: 'Cumberland Farms',
    start: { dateTime: startDateTime.toISOString(), timeZone: 'America/New_York' },
    end: { dateTime: endDateTime.toISOString(), timeZone: 'America/New_York' },
    reminders: { useDefault: true }
  };
  
  // Send to Google Calendar API
  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  });
  
  if (!response.ok) {
    throw new Error('Failed to create calendar event');
  }
}

// Helper functions
function parseDate(dateStr) {
  // Format: "Wed 06/05/24"
  const [, month, day, year] = dateStr.match(/\w{3} (\d{2})\/(\d{2})\/(\d{2})/);
  return new Date(`20${year}-${month}-${day}`);
}

function combineDateTime(date, timeStr) {
  const [hours, minutes] = timeStr.includes('AM') || timeStr.includes('PM')
    ? parse12HourTime(timeStr)
    : timeStr.split(':').map(Number);
  
  const dateTime = new Date(date);
  dateTime.setHours(hours, minutes);
  return dateTime;
}

function parse12HourTime(timeStr) {
  const [, time, period] = timeStr.match(/(\d+):(\d+) (AM|PM)/);
  let hours = parseInt(time);
  const minutes = parseInt(minutes);
  
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  
  return [hours, minutes];
}

function updateStatus(text) {
  chrome.runtime.sendMessage({ type: 'syncStatus', text });
}
```

---

### How to Set Up:

1. **Create Chrome Extension Project**:
   - Make the directory structure shown above
   - Create icons (16x16, 48x48, 128x128 PNG images)

2. **Set Up Google OAuth**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project
   - Under "APIs & Services" > "Credentials":
     - Create OAuth Client ID
     - Application type: Chrome App
     - Enter your extension ID (get from chrome://extensions)
   - Add `https://www.googleapis.com/auth/calendar` to scopes

3. **Load Extension in Chrome**:
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked" and select your extension directory

---

### How to Use:

1. Click the extension icon
2. Enter your Kronos credentials
3. When prompted, enter your MFA code
4. Click "Sync to Google Calendar"
5. Your schedule will be added to Google Calendar

---

### Key Benefits:

1. **No Python/Selenium Required**:
   - Uses Chrome's built-in APIs
   - Runs entirely in the browser

2. **Secure Authentication**:
   - Uses Chrome's identity API for Google OAuth
   - Credentials stored in Chrome's secure storage

3. **Simplified Workflow**:
   - All actions through browser extension UI
   - Real-time status updates

4. **Automatic Schedule Extraction**:
   - Content script parses Kronos page directly
   - No need for external browser automation

This Chrome Extension solution provides a more integrated and user-friendly experience compared to the Python script, while maintaining the same core functionality.
